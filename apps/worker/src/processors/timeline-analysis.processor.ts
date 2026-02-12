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
  TimelineAnalysisSchema,
  safeParseLLMResponse,
  sanitizeJson,
  extractJson,
  buildRetryPrompt,
  SCHEMA_DESCRIPTIONS,
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

      const llmProvider = createProviderWithFallback('timeline');
      let artifact: TimelineArtifact | undefined;

      this.logger.log(`Using ${llmProvider.name} LLM (${llmProvider.modelId}) for timeline analysis`);
      const llmRunner = new LLMRunner({ provider: llmProvider }, this.prisma);

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
          `Create an implementation timeline breaking down the work into tasks and milestones. Consider:`,
          `- Logical ordering of implementation steps`,
          `- Dependencies between tasks`,
          `- Which tasks can be parallelized`,
          `- Complexity of each task`,
          ``,
          `Respond with ONLY a JSON object (no markdown code blocks) matching this exact schema:`,
          SCHEMA_DESCRIPTIONS.timeline,
          ``,
          `IMPORTANT:`,
          `- Keep descriptions concise (1-2 sentences)`,
          `- Group related tasks into milestones`,
          `- Use task IDs like "T001", "T002" etc.`,
          `- Return valid, complete JSON — do not truncate`
        );

        const prompt = promptParts.join('\n');

        const response = await llmRunner.run('architect', prompt, {
          context: { workflowId },
          budget: { maxInputTokens: 50000, maxOutputTokens: 4000, maxTotalCost: 500 }
        });

        if (response.success && response.rawContent) {
          // Try Zod validation first
          const zodResult = safeParseLLMResponse(response.rawContent, TimelineAnalysisSchema);

          if (zodResult.success) {
            const parsed = zodResult.data;
            // Convert flat tasks + milestones into phases for the artifact
            const phases = this.tasksToPhases(parsed.tasks, parsed.milestones);
            artifact = {
              kind: 'TimelineV1',
              summary: parsed.summary,
              phases,
              criticalPath: parsed.criticalPath || [],
              parallelizable: parsed.parallelizable || [],
              inputs: {
                featureGoal: workflow.featureGoal || workflow.goal || '',
                architectureOverview: architectureData.overview || ''
              }
            };
            const totalTasks = parsed.tasks.length;
            this.logger.log(`Timeline analysis complete (Zod validated): ${artifact.phases.length} phases, ${totalTasks} tasks`);
          } else {
            // Retry with structured error feedback
            this.logger.warn(`Zod validation failed, retrying with error feedback: ${zodResult.error}`);

            const retryPrompt = buildRetryPrompt(response.rawContent, zodResult, SCHEMA_DESCRIPTIONS.timeline);
            const retryResponse = await llmRunner.run('architect', retryPrompt, {
              context: { workflowId },
              budget: { maxInputTokens: 50000, maxOutputTokens: 4000, maxTotalCost: 500 }
            });

            if (retryResponse.success && retryResponse.rawContent) {
              const retryResult = safeParseLLMResponse(retryResponse.rawContent, TimelineAnalysisSchema);
              if (retryResult.success) {
                const parsed = retryResult.data;
                const phases = this.tasksToPhases(parsed.tasks, parsed.milestones);
                artifact = {
                  kind: 'TimelineV1',
                  summary: parsed.summary,
                  phases,
                  criticalPath: parsed.criticalPath || [],
                  parallelizable: parsed.parallelizable || [],
                  inputs: {
                    featureGoal: workflow.featureGoal || workflow.goal || '',
                    architectureOverview: architectureData.overview || ''
                  }
                };
                this.logger.log(`Timeline analysis complete (Zod validated on retry): ${artifact.phases.length} phases, ${parsed.tasks.length} tasks`);
              } else {
                this.logger.warn(`Zod validation failed on retry, falling back to legacy parsing: ${retryResult.error}`);
              }
            }

            // Final fallback to legacy parsing
            if (!artifact) {
              try {
                const rawToParse = (retryResponse?.success && retryResponse?.rawContent) ? retryResponse.rawContent : response.rawContent;
                const jsonContent = extractJson(rawToParse);
                if (!jsonContent) {
                  throw new Error('No JSON object found in response');
                }
                const sanitized = sanitizeJson(jsonContent);
                const parsed = JSON.parse(sanitized);

                // Handle both flat tasks[] and nested phases[].tasks[] formats
                let phases: TimelineArtifact['phases'];
                if (Array.isArray(parsed.phases)) {
                  phases = parsed.phases;
                } else if (Array.isArray(parsed.tasks)) {
                  phases = this.tasksToPhases(parsed.tasks, parsed.milestones);
                } else {
                  phases = [];
                }

                artifact = {
                  kind: 'TimelineV1',
                  summary: parsed.summary || 'Timeline analysis completed',
                  phases,
                  criticalPath: Array.isArray(parsed.criticalPath) ? parsed.criticalPath : [],
                  parallelizable: Array.isArray(parsed.parallelizable) ? parsed.parallelizable : [],
                  inputs: {
                    featureGoal: workflow.featureGoal || workflow.goal || '',
                    architectureOverview: architectureData.overview || ''
                  }
                };

                const totalTasks = artifact.phases.reduce((sum, p) => sum + (p.tasks?.length || 0), 0);
                this.logger.log(`Timeline analysis complete (legacy): ${artifact.phases.length} phases, ${totalTasks} tasks`);
              } catch (parseErr) {
                this.logger.warn(`Failed to parse LLM response: ${parseErr}`);
                throw new Error(`Failed to parse timeline analysis: ${parseErr}`);
              }
            }
          }

          // Save tasks to WorkflowTask table
          await this.saveTasks(workflowId, artifact!.phases);
        } else {
          throw new Error(`LLM call failed: ${response.error}`);
        }

      if (!artifact) {
        throw new Error('Failed to produce timeline artifact from LLM response');
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

  /**
   * Convert flat tasks + milestones (Zod schema format) to nested phases (artifact format).
   */
  private tasksToPhases(
    tasks: Array<{ id: string; title: string; description: string; estimatedHours?: number; dependencies?: string[]; priority?: string; skills?: string[]; risks?: string[] }>,
    milestones?: Array<{ name: string; tasks: string[]; deliverables?: string[] }>
  ): TimelineArtifact['phases'] {
    if (milestones && milestones.length > 0) {
      // Group tasks by milestone
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      const assignedTaskIds = new Set<string>();

      const phases = milestones.map(m => {
        const phaseTasks = m.tasks
          .map(id => taskMap.get(id))
          .filter((t): t is NonNullable<typeof t> => !!t);
        phaseTasks.forEach(t => assignedTaskIds.add(t.id));

        return {
          name: m.name,
          description: (m.deliverables || []).join(', ') || m.name,
          tasks: phaseTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            files: [] as string[],
            dependencies: t.dependencies || [],
            estimatedComplexity: this.priorityToComplexity(t.priority || 'medium') as 'low' | 'medium' | 'high'
          }))
        };
      });

      // Add unassigned tasks as a separate phase
      const unassigned = tasks.filter(t => !assignedTaskIds.has(t.id));
      if (unassigned.length > 0) {
        phases.push({
          name: 'Additional Tasks',
          description: 'Tasks not assigned to a specific milestone',
          tasks: unassigned.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            files: [] as string[],
            dependencies: t.dependencies || [],
            estimatedComplexity: this.priorityToComplexity(t.priority || 'medium') as 'low' | 'medium' | 'high'
          }))
        });
      }

      return phases;
    }

    // No milestones — put all tasks in a single phase
    return [{
      name: 'Implementation',
      description: 'All implementation tasks',
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        files: [] as string[],
        dependencies: t.dependencies || [],
        estimatedComplexity: this.priorityToComplexity(t.priority || 'medium') as 'low' | 'medium' | 'high'
      }))
    }];
  }

  private priorityToComplexity(priority: string): string {
    switch (priority) {
      case 'critical': return 'high';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Save parsed tasks to WorkflowTask table for structured tracking.
   */
  private async saveTasks(
    workflowId: string,
    phases: TimelineArtifact['phases']
  ): Promise<void> {
    // Delete existing tasks for this workflow (re-run case)
    await this.prisma.workflowTask.deleteMany({
      where: { workflowId }
    });

    // Flatten all tasks from phases
    const tasksToCreate = phases.flatMap((phase, phaseIndex) =>
      (phase.tasks || []).map((task, taskIndex) => ({
        workflowId,
        taskId: task.id || `T${String(phaseIndex + 1).padStart(2, '0')}${String(taskIndex + 1).padStart(2, '0')}`,
        title: task.title || 'Untitled task',
        description: task.description || '',
        type: 'feature' as const,
        priority: this.complexityToPriority(task.estimatedComplexity),
        complexity: this.mapComplexity(task.estimatedComplexity),
        status: 'pending' as const,
        dependencies: JSON.stringify(task.dependencies || []),
        files: JSON.stringify(task.files || []),
        acceptanceCriteria: JSON.stringify([])
      }))
    );

    if (tasksToCreate.length > 0) {
      await this.prisma.workflowTask.createMany({
        data: tasksToCreate
      });
      this.logger.log(`Saved ${tasksToCreate.length} tasks to WorkflowTask table`);
    }
  }

  private complexityToPriority(complexity: string): string {
    switch (complexity) {
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private mapComplexity(complexity: string): string {
    switch (complexity) {
      case 'high': return 'large';
      case 'medium': return 'medium';
      case 'low': return 'small';
      default: return 'medium';
    }
  }
}
