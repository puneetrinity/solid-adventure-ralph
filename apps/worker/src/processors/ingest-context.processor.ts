import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import {
  RunRecorder,
  type GitHubClient,
  LLMRunner,
  createGroqProvider,
} from '@arch-orchestrator/core';
import { GITHUB_CLIENT_TOKEN } from '../constants';

@Processor('ingest_context')
export class IngestContextProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(IngestContextProcessor.name);

  constructor(
    @Inject(GITHUB_CLIENT_TOKEN) private readonly github: GitHubClient,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<{ workflowId: string }>) {
    const { workflowId } = job.data;

    // Get workflow with repo info
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!workflow.repoOwner || !workflow.repoName) {
      throw new Error(`Workflow ${workflowId} missing repository configuration`);
    }

    this.logger.log(`Ingesting context for ${workflow.repoOwner}/${workflow.repoName}`);

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'ingest_context',
      inputs: { workflowId, repoOwner: workflow.repoOwner, repoName: workflow.repoName }
    });

    try {
      // Get base branch SHA from GitHub
      const branch = await this.github.getBranch({
        owner: workflow.repoOwner,
        repo: workflow.repoName,
        branch: workflow.baseBranch
      });

      const baseSha = branch.sha;
      this.logger.log(`Base SHA: ${baseSha}`);

      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { baseSha }
      });

      // Fetch README.md from the repo
      let readmeContent = '';
      try {
        const readme = await this.github.getFileContents({
          owner: workflow.repoOwner,
          repo: workflow.repoName,
          path: 'README.md',
          ref: baseSha
        });
        readmeContent = readme.content;
        this.logger.log(`Fetched README.md (${readme.size} bytes)`);
      } catch {
        this.logger.warn('No README.md found in repository');
      }

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.ingest_context.completed',
          payload: { baseSha, repoOwner: workflow.repoOwner, repoName: workflow.repoName }
        }
      });

      // Generate patch using Groq LLM
      const groqProvider = createGroqProvider();
      let patchTitle = 'Update README';
      let patchSummary = 'Improve README documentation';
      let patchDiff = '';

      if (groqProvider) {
        this.logger.log('Using Groq LLM to generate patch...');
        const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

        const prompt = `You are a helpful coding assistant. Given this README.md content:

\`\`\`markdown
${readmeContent || '# Project\n\nNo README content yet.'}
\`\`\`

Generate a small improvement to this README. Respond with ONLY a JSON object in this exact format (no markdown code blocks, no explanation):
{
  "title": "Short title for the change",
  "summary": "Brief description of what this change does",
  "newContent": "The complete new README.md content"
}`;

        const response = await llmRunner.run('coder', prompt, {
          context: { workflowId }
        });

        if (response.success && response.rawContent) {
          try {
            // Try to parse JSON from the response
            let jsonContent = response.rawContent.trim();
            // Handle if wrapped in code blocks
            if (jsonContent.startsWith('```')) {
              jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
            }
            const parsed = JSON.parse(jsonContent);
            patchTitle = parsed.title || patchTitle;
            patchSummary = parsed.summary || patchSummary;

            if (parsed.newContent) {
              // Generate diff
              const oldLines = (readmeContent || '').split('\n');
              const newLines = parsed.newContent.split('\n');
              patchDiff = this.generateSimpleDiff('README.md', oldLines, newLines);
            }
            this.logger.log(`LLM generated patch: ${patchTitle}`);
          } catch (parseErr) {
            this.logger.warn(`Failed to parse LLM response: ${parseErr}`);
          }
        } else {
          this.logger.warn(`LLM call failed: ${response.error}`);
        }
      } else {
        this.logger.warn('GROQ_API_KEY not set, using stub patch');
      }

      // Fallback to stub diff if LLM didn't produce one
      if (!patchDiff) {
        patchDiff = [
          'diff --git a/README.md b/README.md',
          'index 0000000..1111111 100644',
          '--- a/README.md',
          '+++ b/README.md',
          '@@ -1 +1,2 @@',
          ` ${readmeContent.split('\n')[0] || '# Project'}`,
          '+',
          '+This project is managed by arch-orchestrator.'
        ].join('\n');
      }

      // Create decision artifact
      const decisionContent = [
        '# Decision',
        '',
        `- Repository: ${workflow.repoOwner}/${workflow.repoName}`,
        `- Base SHA: ${baseSha}`,
        `- Recommendation: PROCEED`,
        `- Generated patch: ${patchTitle}`,
      ].join('\n');

      const contentSha = createHash('sha256').update(decisionContent, 'utf8').digest('hex');

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'DecisionV1',
          path: '.ai/DECISION.md',
          content: decisionContent,
          contentSha
        }
      });

      // Create PatchSet + Patch
      const patchSet = await this.prisma.patchSet.create({
        data: {
          workflowId,
          title: patchTitle,
          baseSha,
          status: 'proposed'
        }
      });

      await this.prisma.patch.create({
        data: {
          patchSetId: patchSet.id,
          taskId: 'T-001',
          title: patchTitle,
          summary: patchSummary,
          diff: patchDiff,
          files: [{ path: 'README.md', additions: 2, deletions: 0 }],
          addsTests: false,
          riskLevel: 'low',
          proposedCommands: []
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { baseSha, patchSetId: patchSet.id }
      });

      // Emit success event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'ingest_context',
          result: { baseSha, patchSetId: patchSet.id }
        }
      });

      return { ok: true, patchSetId: patchSet.id };
    } catch (error: any) {
      this.logger.error(`Ingest context failed: ${error?.message ?? error}`);

      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg: String(error?.message ?? error)
      });

      // Emit failure event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'ingest_context',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }

  private generateSimpleDiff(path: string, oldLines: string[], newLines: string[]): string {
    const diffLines = [
      `diff --git a/${path} b/${path}`,
      'index 0000000..1111111 100644',
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ];

    // Simple unified diff - mark all old as removed, all new as added
    for (const line of oldLines) {
      diffLines.push(`-${line}`);
    }
    for (const line of newLines) {
      diffLines.push(`+${line}`);
    }

    return diffLines.join('\n');
  }
}
