import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import {
  RunRecorder,
  LLMRunner,
  createGroqProvider,
} from '@arch-orchestrator/core';

interface FeasibilityJobData {
  workflowId: string;
}

interface FeasibilityArtifact {
  kind: 'FeasibilityV1';
  recommendation: 'proceed' | 'hold' | 'reject';
  reasoning: string;
  risks: string[];
  alternatives: string[];
  unknowns: string[];
  assumptions: string[];
  repoSummaries: Record<string, string>;
  inputs: {
    featureGoal: string;
    businessJustification: string;
  };
}

@Processor('feasibility')
export class FeasibilityAnalysisProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(FeasibilityAnalysisProcessor.name);

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<FeasibilityJobData>) {
    const { workflowId } = job.data;

    // Get workflow with repos
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { repos: true }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Running feasibility analysis for workflow ${workflowId}`);

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'feasibility_analysis',
      inputs: {
        workflowId,
        featureGoal: workflow.featureGoal,
        businessJustification: workflow.businessJustification,
        repos: workflow.repos.map(r => `${r.owner}/${r.repo}`)
      }
    });

    try {
      // Update workflow stage status to processing
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'processing', stageUpdatedAt: new Date() }
      });

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

      // Generate feasibility analysis using LLM
      const groqProvider = createGroqProvider();
      let artifact: FeasibilityArtifact;

      if (groqProvider) {
        const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

        const promptParts = [
          `You are a senior software architect evaluating a feature request. Analyze the feasibility of this feature.`,
          ``,
          `## Feature Goal`,
          workflow.featureGoal || workflow.goal || 'No goal specified',
          ``,
          `## Business Justification`,
          workflow.businessJustification || 'No business justification provided',
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
          `Analyze the feasibility of this feature request. Consider:`,
          `- Technical complexity and effort`,
          `- Risks and potential blockers`,
          `- Alternative approaches`,
          `- Information gaps or unknowns`,
          `- Key assumptions`,
          ``,
          `Respond with ONLY a JSON object (no markdown code blocks):`,
          `{`,
          `  "recommendation": "proceed" | "hold" | "reject",`,
          `  "reasoning": "2-3 sentence explanation of your recommendation",`,
          `  "risks": ["risk 1", "risk 2", ...],`,
          `  "alternatives": ["alternative approach 1", ...],`,
          `  "unknowns": ["what info is missing", ...],`,
          `  "assumptions": ["assumption 1", ...]`,
          `}`,
          ``,
          `Guidelines:`,
          `- "proceed": Feature is well-defined and achievable`,
          `- "hold": Need more information or clarification before proceeding`,
          `- "reject": Feature is not feasible, too risky, or doesn't align with goals`
        );

        const prompt = promptParts.join('\n');

        const response = await llmRunner.run('architect', prompt, {
          context: { workflowId },
          budget: { maxInputTokens: 50000, maxOutputTokens: 2000, maxTotalCost: 10 }
        });

        if (response.success && response.rawContent) {
          try {
            let jsonContent = response.rawContent.trim();
            if (jsonContent.startsWith('```')) {
              jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
            }
            const parsed = JSON.parse(jsonContent);

            artifact = {
              kind: 'FeasibilityV1',
              recommendation: parsed.recommendation || 'hold',
              reasoning: parsed.reasoning || 'Analysis completed',
              risks: Array.isArray(parsed.risks) ? parsed.risks : [],
              alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
              unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
              assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
              repoSummaries,
              inputs: {
                featureGoal: workflow.featureGoal || workflow.goal || '',
                businessJustification: workflow.businessJustification || ''
              }
            };

            this.logger.log(`Feasibility analysis complete: ${artifact.recommendation}`);
          } catch (parseErr) {
            this.logger.warn(`Failed to parse LLM response: ${parseErr}`);
            throw new Error(`Failed to parse feasibility analysis: ${parseErr}`);
          }
        } else {
          throw new Error(`LLM call failed: ${response.error}`);
        }
      } else {
        // Stub artifact when no LLM configured
        this.logger.warn('GROQ_API_KEY not set, using stub feasibility analysis');
        artifact = {
          kind: 'FeasibilityV1',
          recommendation: 'proceed',
          reasoning: 'Stub analysis - GROQ_API_KEY not configured',
          risks: ['LLM not configured for proper analysis'],
          alternatives: [],
          unknowns: ['Full analysis requires LLM configuration'],
          assumptions: [],
          repoSummaries,
          inputs: {
            featureGoal: workflow.featureGoal || workflow.goal || '',
            businessJustification: workflow.businessJustification || ''
          }
        };
      }

      // Save artifact
      const artifactContent = JSON.stringify(artifact, null, 2);
      const contentSha = createHash('sha256').update(artifactContent, 'utf8').digest('hex');

      // Check for existing artifact to set version
      const existingArtifact = await this.prisma.artifact.findFirst({
        where: { workflowId, kind: 'FeasibilityV1' },
        orderBy: { artifactVersion: 'desc' }
      });

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'FeasibilityV1',
          path: '.ai/FEASIBILITY.json',
          content: artifactContent,
          contentSha,
          artifactVersion: existingArtifact ? existingArtifact.artifactVersion + 1 : 1,
          supersedesArtifactId: existingArtifact?.id || null
        }
      });

      // Update workflow to ready status
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          stageStatus: 'ready',
          stageUpdatedAt: new Date()
        }
      });

      // Record event
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.feasibility.completed',
          payload: {
            recommendation: artifact.recommendation,
            risksCount: artifact.risks.length,
            alternativesCount: artifact.alternatives.length
          }
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { recommendation: artifact.recommendation }
      });

      // Emit success event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'feasibility',
          result: { recommendation: artifact.recommendation }
        }
      });

      return { ok: true, recommendation: artifact.recommendation };

    } catch (error: any) {
      this.logger.error(`Feasibility analysis failed: ${error?.message ?? error}`);

      // Update workflow to blocked status
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          stageStatus: 'blocked',
          stageUpdatedAt: new Date()
        }
      });

      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg: String(error?.message ?? error)
      });

      // Record event
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.feasibility.failed',
          payload: { error: String(error?.message ?? error) }
        }
      });

      // Emit failure event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'feasibility',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }
}
