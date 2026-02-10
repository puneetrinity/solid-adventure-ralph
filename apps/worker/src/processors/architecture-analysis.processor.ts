import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import {
  RunRecorder,
  LLMRunner,
  createProviderWithFallback,
  ArchitectureAnalysisSchema,
  safeParseLLMResponse,
  SCHEMA_DESCRIPTIONS,
} from '@arch-orchestrator/core';

interface ArchitectureJobData {
  workflowId: string;
}

interface ArchitectureArtifact {
  kind: 'ArchitectureV1';
  overview: string;
  components: Array<{
    name: string;
    description: string;
    files: string[];
    dependencies: string[];
  }>;
  dataFlow: string;
  integrationPoints: string[];
  technicalDecisions: Array<{
    decision: string;
    rationale: string;
    alternatives: string[];
  }>;
  inputs: {
    featureGoal: string;
    feasibilityRecommendation: string;
  };
}

@Processor('architecture')
export class ArchitectureAnalysisProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(ArchitectureAnalysisProcessor.name);

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<ArchitectureJobData>) {
    const { workflowId } = job.data;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { repos: true, artifacts: { where: { kind: 'FeasibilityV1' }, orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Running architecture analysis for workflow ${workflowId}`);

    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'architecture_analysis',
      inputs: {
        workflowId,
        featureGoal: workflow.featureGoal,
        repos: workflow.repos.map(r => `${r.owner}/${r.repo}`)
      }
    });

    try {
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'processing', stageUpdatedAt: new Date() }
      });

      // Get feasibility artifact for context
      const feasibilityArtifact = workflow.artifacts[0];
      let feasibilityData: any = {};
      if (feasibilityArtifact) {
        try {
          feasibilityData = JSON.parse(feasibilityArtifact.content);
        } catch {}
      }

      // Gather repo context summaries
      const repoSummaries: Record<string, string> = {};
      for (const repo of workflow.repos) {
        const context = await this.prisma.repoContext.findUnique({
          where: {
            repoOwner_repoName_baseBranch: {
              repoOwner: repo.owner,
              repoName: repo.repo,
              baseBranch: repo.baseBranch
            }
          }
        });
        if (context?.summary) {
          repoSummaries[`${repo.owner}/${repo.repo}`] = context.summary;
        }
      }

      const llmProvider = createProviderWithFallback('architecture');
      let artifact: ArchitectureArtifact;

      this.logger.log(`Using ${llmProvider.name} LLM (${llmProvider.modelId}) for architecture analysis`);
      const llmRunner = new LLMRunner({ provider: llmProvider }, this.prisma);

        const promptParts = [
          `You are a senior software architect designing the technical architecture for a feature.`,
          ``,
          `## Feature Goal`,
          workflow.featureGoal || workflow.goal || 'No goal specified',
          ``,
          `## Feasibility Analysis Summary`,
          feasibilityData.reasoning || 'No feasibility analysis available',
          feasibilityData.risks?.length ? `Risks: ${feasibilityData.risks.join(', ')}` : '',
          ``
        ];

        if (Object.keys(repoSummaries).length > 0) {
          promptParts.push(`## Repository Context`);
          for (const [repo, summary] of Object.entries(repoSummaries)) {
            promptParts.push(`### ${repo}`, summary, ``);
          }
        }

        if (workflow.feedback) {
          promptParts.push(`## Previous Feedback (address these concerns)`, workflow.feedback, ``);
        }

        promptParts.push(
          `## Instructions`,
          `Design the technical architecture for this feature. Consider:`,
          `- High-level component structure`,
          `- Data flow between components`,
          `- Integration points with existing code`,
          `- Key technical decisions and their rationale`,
          ``,
          `Respond with ONLY a JSON object (no markdown code blocks):`,
          `{`,
          `  "overview": "2-3 sentence architecture overview",`,
          `  "components": [{"name": "...", "description": "...", "files": ["..."], "dependencies": ["..."]}],`,
          `  "dataFlow": "Description of how data flows through the system",`,
          `  "integrationPoints": ["existing file/module to modify", ...],`,
          `  "technicalDecisions": [{"decision": "...", "rationale": "...", "alternatives": ["..."]}]`,
          `}`
        );

        const prompt = promptParts.join('\n');

        const response = await llmRunner.run('architect', prompt, {
          context: { workflowId },
          budget: { maxInputTokens: 50000, maxOutputTokens: 3000, maxTotalCost: 50 }
        });

        if (response.success && response.rawContent) {
          // Try Zod validation first
          const zodResult = safeParseLLMResponse(response.rawContent, ArchitectureAnalysisSchema);

          if (zodResult.success) {
            const parsed = zodResult.data;
            artifact = {
              kind: 'ArchitectureV1',
              overview: parsed.summary,
              components: (parsed.components || []).map(c => ({
                name: c.name,
                description: c.purpose,
                files: [],
                dependencies: c.dependencies || []
              })),
              dataFlow: parsed.dataFlow || '',
              integrationPoints: [],
              technicalDecisions: (parsed.decisions || []).map(d => ({
                decision: d.decision,
                rationale: d.rationale,
                alternatives: (d.alternatives || []).map(a => a.option)
              })),
              inputs: {
                featureGoal: workflow.featureGoal || workflow.goal || '',
                feasibilityRecommendation: feasibilityData.recommendation || 'unknown'
              }
            };
            this.logger.log(`Architecture analysis complete (Zod validated): ${artifact.components.length} components`);
          } else {
            // Fallback to legacy parsing
            this.logger.warn(`Zod validation failed, falling back to legacy parsing: ${zodResult.error}`);
            try {
              let jsonContent = response.rawContent.trim();
              if (jsonContent.startsWith('```')) {
                jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
              }
              const parsed = JSON.parse(jsonContent);

              artifact = {
                kind: 'ArchitectureV1',
                overview: parsed.overview || 'Architecture analysis completed',
                components: Array.isArray(parsed.components) ? parsed.components : [],
                dataFlow: parsed.dataFlow || '',
                integrationPoints: Array.isArray(parsed.integrationPoints) ? parsed.integrationPoints : [],
                technicalDecisions: Array.isArray(parsed.technicalDecisions) ? parsed.technicalDecisions : [],
                inputs: {
                  featureGoal: workflow.featureGoal || workflow.goal || '',
                  feasibilityRecommendation: feasibilityData.recommendation || 'unknown'
                }
              };

              this.logger.log(`Architecture analysis complete (legacy): ${artifact.components.length} components`);
            } catch (parseErr) {
              this.logger.warn(`Failed to parse LLM response: ${parseErr}`);
              throw new Error(`Failed to parse architecture analysis: ${parseErr}`);
            }
          }
        } else {
          throw new Error(`LLM call failed: ${response.error}`);
        }

      const artifactContent = JSON.stringify(artifact, null, 2);
      const contentSha = createHash('sha256').update(artifactContent, 'utf8').digest('hex');

      const existingArtifact = await this.prisma.artifact.findFirst({
        where: { workflowId, kind: 'ArchitectureV1' },
        orderBy: { artifactVersion: 'desc' }
      });

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'ArchitectureV1',
          path: '.ai/ARCHITECTURE.json',
          content: artifactContent,
          contentSha,
          artifactVersion: existingArtifact ? existingArtifact.artifactVersion + 1 : 1,
          supersedesArtifactId: existingArtifact?.id || null
        }
      });

      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'ready', stageUpdatedAt: new Date() }
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.architecture.completed',
          payload: { componentsCount: artifact.components.length }
        }
      });

      await this.runRecorder.completeRun({
        runId,
        outputs: { componentsCount: artifact.components.length }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'architecture',
          result: { componentsCount: artifact.components.length }
        }
      });

      return { ok: true, componentsCount: artifact.components.length };

    } catch (error: any) {
      this.logger.error(`Architecture analysis failed: ${error?.message ?? error}`);

      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'blocked', stageUpdatedAt: new Date() }
      });

      await this.runRecorder.failRun({
        runId,
        errorMsg: String(error?.message ?? error)
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.architecture.failed',
          payload: { error: String(error?.message ?? error) }
        }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'architecture',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }
}
