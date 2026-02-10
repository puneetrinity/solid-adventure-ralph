import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import {
  RunRecorder,
  LLMRunner,
  createGroqProvider,
  SummaryAnalysisSchema,
  safeParseLLMResponse,
  buildRetryPrompt,
  SCHEMA_DESCRIPTIONS,
} from '@arch-orchestrator/core';

interface SummaryJobData {
  workflowId: string;
}

interface SummaryArtifact {
  kind: 'SummaryV1';
  overview: string;
  scope: string[];
  risks: string[];
  tests: string[];
  dependencies: string[];
  pros: string[];
  cons: string[];
  links: string[];
  recommendation: 'proceed' | 'hold';
  inputs: {
    featureGoal: string;
    businessJustification: string;
    feasibilityRecommendation: string;
    architectureOverview: string;
    timelineSummary: string;
  };
}

@Processor('summary')
export class SummaryAnalysisProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(SummaryAnalysisProcessor.name);

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<SummaryJobData>) {
    const { workflowId } = job.data;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        repos: true,
        artifacts: {
          where: { kind: { in: ['FeasibilityV1', 'ArchitectureV1', 'TimelineV1'] } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Running summary analysis for workflow ${workflowId}`);

    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'summary_analysis',
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

      const feasibilityArtifact = workflow.artifacts.find(a => a.kind === 'FeasibilityV1');
      const architectureArtifact = workflow.artifacts.find(a => a.kind === 'ArchitectureV1');
      const timelineArtifact = workflow.artifacts.find(a => a.kind === 'TimelineV1');

      let feasibilityData: any = {};
      let architectureData: any = {};
      let timelineData: any = {};

      try {
        if (feasibilityArtifact) feasibilityData = JSON.parse(feasibilityArtifact.content);
      } catch {}
      try {
        if (architectureArtifact) architectureData = JSON.parse(architectureArtifact.content);
      } catch {}
      try {
        if (timelineArtifact) timelineData = JSON.parse(timelineArtifact.content);
      } catch {}

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

      const artifactLinks = [
        feasibilityArtifact?.path,
        architectureArtifact?.path,
        timelineArtifact?.path
      ].filter(Boolean) as string[];

      const groqProvider = createGroqProvider();
      let artifact: SummaryArtifact;

      if (groqProvider) {
        const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

        const promptParts = [
          `You are preparing a final pre-patch summary for a gated workflow.`,
          ``,
          `## Feature Goal`,
          workflow.featureGoal || workflow.goal || 'No goal specified',
          ``,
          `## Business Justification`,
          workflow.businessJustification || 'No justification provided',
          ``,
          `## Feasibility Artifact`,
          feasibilityArtifact ? feasibilityArtifact.content : 'None',
          ``,
          `## Architecture Artifact`,
          architectureArtifact ? architectureArtifact.content : 'None',
          ``,
          `## Timeline Artifact`,
          timelineArtifact ? timelineArtifact.content : 'None',
          ``,
          `## Repo Context Summaries`,
          Object.entries(repoSummaries).map(([repo, summary]) => `### ${repo}\n${summary}`).join('\n\n') || 'None',
          ``,
          `## Available Artifact Links`,
          artifactLinks.length > 0 ? artifactLinks.join('\n') : 'None',
          ``,
          `## Instructions`,
          `Produce a concise summary to confirm scope before patch generation.`,
          `Include overall pros/cons and relevant links from the artifacts or context.`,
          ``,
          `Respond with ONLY a JSON object (no markdown code blocks):`,
          SCHEMA_DESCRIPTIONS.summary,
          ``,
          `Guidelines:`,
          `- "overview" should be 2-4 sentences max`,
          `- "scope" should list files/areas likely to change`,
          `- "pros"/"cons" should reflect overall tradeoffs`,
          `- "links" should include relevant URLs or artifact paths (if none, empty array)`
        ];

        const prompt = promptParts.join('\n');

        const response = await llmRunner.run('architect', prompt, {
          context: { workflowId },
          budget: { maxInputTokens: 50000, maxOutputTokens: 2000, maxTotalCost: 50 }
        });

        if (!response.success || !response.rawContent) {
          throw new Error(`LLM call failed: ${response.error}`);
        }

        let parsedResult = safeParseLLMResponse(response.rawContent, SummaryAnalysisSchema);
        if (!parsedResult.success) {
          const retryPrompt = buildRetryPrompt(
            response.rawContent,
            parsedResult,
            SCHEMA_DESCRIPTIONS.summary
          );

          const retry = await llmRunner.run('architect', retryPrompt, {
            context: { workflowId },
            budget: { maxInputTokens: 20000, maxOutputTokens: 1500, maxTotalCost: 25 }
          });

          if (!retry.success || !retry.rawContent) {
            throw new Error(`LLM retry failed: ${retry.error}`);
          }

          parsedResult = safeParseLLMResponse(retry.rawContent, SummaryAnalysisSchema);
          if (!parsedResult.success) {
            throw new Error(`Failed to parse summary analysis: ${parsedResult.error}`);
          }
        }

        const parsed = parsedResult.data;
        artifact = {
          kind: 'SummaryV1',
          overview: parsed.overview,
          scope: parsed.scope || [],
          risks: parsed.risks || [],
          tests: parsed.tests || [],
          dependencies: parsed.dependencies || [],
          pros: parsed.pros || [],
          cons: parsed.cons || [],
          links: parsed.links || [],
          recommendation: parsed.recommendation,
          inputs: {
            featureGoal: workflow.featureGoal || workflow.goal || '',
            businessJustification: workflow.businessJustification || '',
            feasibilityRecommendation: feasibilityData.recommendation || 'unknown',
            architectureOverview: architectureData.overview || '',
            timelineSummary: timelineData.summary || ''
          }
        };
      } else {
        this.logger.warn('GROQ_API_KEY not set, using stub summary analysis');
        artifact = {
          kind: 'SummaryV1',
          overview: 'Stub summary - GROQ_API_KEY not configured',
          scope: [],
          risks: [],
          tests: [],
          dependencies: [],
          pros: [],
          cons: [],
          links: artifactLinks,
          recommendation: 'hold',
          inputs: {
            featureGoal: workflow.featureGoal || workflow.goal || '',
            businessJustification: workflow.businessJustification || '',
            feasibilityRecommendation: feasibilityData.recommendation || 'unknown',
            architectureOverview: architectureData.overview || '',
            timelineSummary: timelineData.summary || ''
          }
        };
      }

      const artifactContent = JSON.stringify(artifact, null, 2);
      const contentSha = createHash('sha256').update(artifactContent, 'utf8').digest('hex');

      const existingArtifact = await this.prisma.artifact.findFirst({
        where: { workflowId, kind: 'SummaryV1' },
        orderBy: { artifactVersion: 'desc' }
      });

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'SummaryV1',
          path: '.ai/SUMMARY.json',
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
          type: 'worker.summary.completed',
          payload: { recommendation: artifact.recommendation }
        }
      });

      await this.runRecorder.completeRun({
        runId,
        outputs: { recommendation: artifact.recommendation }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'summary',
          result: { recommendation: artifact.recommendation }
        }
      });

      return { ok: true, recommendation: artifact.recommendation };
    } catch (error: any) {
      this.logger.error(`Summary analysis failed: ${error?.message ?? error}`);

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
          type: 'worker.summary.failed',
          payload: { error: String(error?.message ?? error) }
        }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'summary',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }
}
