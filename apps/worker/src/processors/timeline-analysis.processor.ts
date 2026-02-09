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
} from '@arch-orchestrator/core';

interface TimelineJobData {
  workflowId: string;
}

interface TimelineArtifact {
  kind: 'TimelineV1';
  summary: string;
  phases: Array<{
    name: string;
    description: string;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      files: string[];
      dependencies: string[];
      estimatedComplexity: 'low' | 'medium' | 'high';
    }>;
  }>;
  criticalPath: string[];
  parallelizable: string[][];
  inputs: {
    featureGoal: string;
    architectureOverview: string;
  };
}

@Processor('timeline')
export class TimelineAnalysisProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(TimelineAnalysisProcessor.name);

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<TimelineJobData>) {
    const { workflowId } = job.data;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        repos: true,
        artifacts: {
          where: { kind: { in: ['FeasibilityV1', 'ArchitectureV1'] } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.log(`Running timeline analysis for workflow ${workflowId}`);

    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'timeline_analysis',
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

      // Get architecture artifact for context
      const architectureArtifact = workflow.artifacts.find(a => a.kind === 'ArchitectureV1');
      let architectureData: any = {};
      if (architectureArtifact) {
        try {
          architectureData = JSON.parse(architectureArtifact.content);
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

      const groqProvider = createGroqProvider();
      let artifact: TimelineArtifact;

      if (groqProvider) {
        const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

        const promptParts = [
          `You are a senior software architect creating an implementation timeline for a feature.`,
          ``,
          `## Feature Goal`,
          workflow.featureGoal || workflow.goal || 'No goal specified',
          ``,
          `## Architecture Overview`,
          architectureData.overview || 'No architecture analysis available',
          ``,
          `## Components`,
          architectureData.components?.map((c: any) => `- ${c.name}: ${c.description}`).join('\n') || 'No components defined',
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
          `Create an implementation timeline breaking down the work into phases and tasks. Consider:`,
          `- Logical ordering of implementation steps`,
          `- Dependencies between tasks`,
          `- Which tasks can be parallelized`,
          `- Complexity of each task`,
          ``,
          `Respond with ONLY a JSON object (no markdown code blocks):`,
          `{`,
          `  "summary": "Brief summary of the implementation plan",`,
          `  "phases": [`,
          `    {`,
          `      "name": "Phase name",`,
          `      "description": "What this phase accomplishes",`,
          `      "tasks": [`,
          `        {`,
          `          "id": "task-1",`,
          `          "title": "Task title",`,
          `          "description": "What needs to be done",`,
          `          "files": ["files to create/modify"],`,
          `          "dependencies": ["task ids this depends on"],`,
          `          "estimatedComplexity": "low" | "medium" | "high"`,
          `        }`,
          `      ]`,
          `    }`,
          `  ],`,
          `  "criticalPath": ["task-1", "task-2", ...],`,
          `  "parallelizable": [["task-a", "task-b"], ...]`,
          `}`
        );

        const prompt = promptParts.join('\n');

        const response = await llmRunner.run('architect', prompt, {
          context: { workflowId },
          budget: { maxInputTokens: 50000, maxOutputTokens: 4000, maxTotalCost: 50 }
        });

        if (response.success && response.rawContent) {
          try {
            let jsonContent = response.rawContent.trim();
            if (jsonContent.startsWith('```')) {
              jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
            }
            const parsed = JSON.parse(jsonContent);

            artifact = {
              kind: 'TimelineV1',
              summary: parsed.summary || 'Timeline analysis completed',
              phases: Array.isArray(parsed.phases) ? parsed.phases : [],
              criticalPath: Array.isArray(parsed.criticalPath) ? parsed.criticalPath : [],
              parallelizable: Array.isArray(parsed.parallelizable) ? parsed.parallelizable : [],
              inputs: {
                featureGoal: workflow.featureGoal || workflow.goal || '',
                architectureOverview: architectureData.overview || ''
              }
            };

            const totalTasks = artifact.phases.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);
            this.logger.log(`Timeline analysis complete: ${artifact.phases.length} phases, ${totalTasks} tasks`);
          } catch (parseErr) {
            this.logger.warn(`Failed to parse LLM response: ${parseErr}`);
            throw new Error(`Failed to parse timeline analysis: ${parseErr}`);
          }
        } else {
          throw new Error(`LLM call failed: ${response.error}`);
        }
      } else {
        this.logger.warn('GROQ_API_KEY not set, using stub timeline analysis');
        artifact = {
          kind: 'TimelineV1',
          summary: 'Stub analysis - GROQ_API_KEY not configured',
          phases: [],
          criticalPath: [],
          parallelizable: [],
          inputs: {
            featureGoal: workflow.featureGoal || workflow.goal || '',
            architectureOverview: architectureData.overview || ''
          }
        };
      }

      const artifactContent = JSON.stringify(artifact, null, 2);
      const contentSha = createHash('sha256').update(artifactContent, 'utf8').digest('hex');

      const existingArtifact = await this.prisma.artifact.findFirst({
        where: { workflowId, kind: 'TimelineV1' },
        orderBy: { artifactVersion: 'desc' }
      });

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'TimelineV1',
          path: '.ai/TIMELINE.json',
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

      const totalTasks = artifact.phases.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.timeline.completed',
          payload: { phasesCount: artifact.phases.length, tasksCount: totalTasks }
        }
      });

      await this.runRecorder.completeRun({
        runId,
        outputs: { phasesCount: artifact.phases.length, tasksCount: totalTasks }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'timeline',
          result: { phasesCount: artifact.phases.length, tasksCount: totalTasks }
        }
      });

      return { ok: true, phasesCount: artifact.phases.length, tasksCount: totalTasks };

    } catch (error: any) {
      this.logger.error(`Timeline analysis failed: ${error?.message ?? error}`);

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
          type: 'worker.timeline.failed',
          payload: { error: String(error?.message ?? error) }
        }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'timeline',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }
}
