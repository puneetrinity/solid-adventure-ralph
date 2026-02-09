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

interface RepoConfig {
  owner: string;
  repo: string;
  baseBranch: string;
  role: string;
}

interface RepoContext {
  readmeContent: string;
  packageJson: string;
  baseSha: string;
  // Stored project context (from RepoContext table)
  storedContextSummary?: string;
  storedContextContent?: string;
  storedContextPath?: string;
}

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

    // Get workflow with repos
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { repos: true }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Build list of repos to process
    const repos: RepoConfig[] = [];
    if (workflow.repos && workflow.repos.length > 0) {
      for (const r of workflow.repos) {
        repos.push({
          owner: r.owner,
          repo: r.repo,
          baseBranch: r.baseBranch,
          role: r.role
        });
      }
    } else if (workflow.repoOwner && workflow.repoName) {
      // Legacy single-repo fallback
      repos.push({
        owner: workflow.repoOwner,
        repo: workflow.repoName,
        baseBranch: workflow.baseBranch,
        role: 'primary'
      });
    }

    if (repos.length === 0) {
      throw new Error(`Workflow ${workflowId} has no repositories configured`);
    }

    this.logger.log(`Ingesting context for ${repos.length} repo(s): ${repos.map(r => `${r.owner}/${r.repo}`).join(', ')}`);

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'ingest_context',
      inputs: { workflowId, repos: repos.map(r => `${r.owner}/${r.repo}`), goal: workflow.goal }
    });

    const patchSetIds: string[] = [];
    const groqProvider = createGroqProvider();

    try {
      // Process each repo
      for (const repoConfig of repos) {
        const { owner: repoOwner, repo: repoName, baseBranch } = repoConfig;
        this.logger.log(`Processing repo: ${repoOwner}/${repoName}`);

        // Fetch context for this repo
        const context = await this.fetchRepoContext(repoOwner, repoName, baseBranch);

        // Update WorkflowRepo with baseSha if it exists
        await this.prisma.workflowRepo.updateMany({
          where: { workflowId, owner: repoOwner, repo: repoName },
          data: { baseSha: context.baseSha }
        });

        // Generate patch for this repo
        const { patchTitle, patchSummary, patchDiff } = await this.generatePatch(
          workflowId,
          workflow,
          repoConfig,
          context,
          groqProvider
        );

        // Create PatchSet for this repo
        const patchSet = await this.prisma.patchSet.create({
          data: {
            workflowId,
            title: patchTitle,
            baseSha: context.baseSha,
            status: 'proposed',
            repoOwner,
            repoName
          }
        });

        await this.prisma.patch.create({
          data: {
            patchSetId: patchSet.id,
            taskId: `T-${repoName.substring(0, 3).toUpperCase()}-001`,
            title: patchTitle,
            summary: patchSummary,
            diff: patchDiff,
            files: [{ path: 'README.md', additions: 2, deletions: 0 }],
            addsTests: false,
            riskLevel: 'low',
            proposedCommands: [],
            repoOwner,
            repoName
          }
        });

        patchSetIds.push(patchSet.id);
        this.logger.log(`Created PatchSet ${patchSet.id} for ${repoOwner}/${repoName}`);

        await this.prisma.workflowEvent.create({
          data: {
            workflowId,
            type: 'worker.ingest_context.repo_completed',
            payload: { repoOwner, repoName, baseSha: context.baseSha, patchSetId: patchSet.id }
          }
        });
      }

      // Update workflow baseSha with primary repo's SHA
      const primaryRepo = repos.find(r => r.role === 'primary') || repos[0];
      const primaryContext = await this.fetchRepoContext(primaryRepo.owner, primaryRepo.repo, primaryRepo.baseBranch);
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { baseSha: primaryContext.baseSha }
      });

      // Create decision artifact summarizing all repos
      const decisionContent = this.buildDecisionArtifact(workflow, repos, patchSetIds);
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

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.ingest_context.completed',
          payload: { patchSetIds, repoCount: repos.length }
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { patchSetIds, repoCount: repos.length }
      });

      // Emit success event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'ingest_context',
          result: { patchSetIds }
        }
      });

      return { ok: true, patchSetIds };
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

  private async fetchRepoContext(owner: string, repo: string, baseBranch: string): Promise<RepoContext> {
    // Get base branch SHA
    const branch = await this.github.getBranch({ owner, repo, branch: baseBranch });
    const baseSha = branch.sha;
    this.logger.log(`${owner}/${repo} base SHA: ${baseSha}`);

    // Check for stored project context first
    let storedContextSummary: string | undefined;
    let storedContextContent: string | undefined;
    let storedContextPath: string | undefined;

    try {
      const storedContext = await this.prisma.repoContext.findUnique({
        where: {
          repoOwner_repoName_baseBranch: { repoOwner: owner, repoName: repo, baseBranch }
        }
      });

      if (storedContext && !storedContext.isStale) {
        storedContextSummary = storedContext.summary || undefined;
        storedContextContent = storedContext.content || undefined;
        storedContextPath = storedContext.contextPath;
        this.logger.log(`${owner}/${repo}: Using stored context from ${storedContextPath} (summary: ${storedContextSummary?.length || 0} chars)`);
      } else if (storedContext?.isStale) {
        this.logger.warn(`${owner}/${repo}: Stored context is stale, will fallback to README`);
      }
    } catch (err) {
      this.logger.warn(`${owner}/${repo}: Failed to fetch stored context: ${err}`);
    }

    // Fetch README.md (always as fallback or supplementary)
    let readmeContent = '';
    try {
      const readme = await this.github.getFileContents({ owner, repo, path: 'README.md', ref: baseSha });
      readmeContent = readme.content;
      this.logger.log(`${owner}/${repo}: Fetched README.md (${readme.size} bytes)`);
    } catch {
      this.logger.warn(`${owner}/${repo}: No README.md found`);
    }

    // Fetch package.json
    let packageJson = '';
    try {
      const pkg = await this.github.getFileContents({ owner, repo, path: 'package.json', ref: baseSha });
      packageJson = pkg.content;
      this.logger.log(`${owner}/${repo}: Fetched package.json (${pkg.size} bytes)`);
    } catch {
      // package.json is optional
    }

    return {
      readmeContent,
      packageJson,
      baseSha,
      storedContextSummary,
      storedContextContent,
      storedContextPath
    };
  }

  private async generatePatch(
    workflowId: string,
    workflow: { goal: string | null; context: string | null; feedback: string | null },
    repoConfig: RepoConfig,
    repoContext: RepoContext,
    groqProvider: ReturnType<typeof createGroqProvider>
  ): Promise<{ patchTitle: string; patchSummary: string; patchDiff: string }> {
    const { owner: repoOwner, repo: repoName } = repoConfig;
    const { readmeContent, packageJson, storedContextSummary, storedContextPath } = repoContext;

    let patchTitle = workflow.goal?.substring(0, 50) || 'Code change';
    let patchSummary = workflow.goal || 'Implement requested changes';
    let patchDiff = '';

    if (groqProvider) {
      this.logger.log(`Using Groq LLM to generate patch for ${repoOwner}/${repoName}...`);
      const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

      const promptParts = [
        `You are an expert software engineer. Your task is to implement the following request.`,
        ``
      ];

      // Include stored project context summary if available
      if (storedContextSummary) {
        promptParts.push(
          `## Project Context (from ${storedContextPath})`,
          storedContextSummary,
          ``
        );
      }

      promptParts.push(
        `## Goal`,
        workflow.goal || 'Improve the codebase',
        ``
      );

      if (workflow.context) {
        promptParts.push(`## Additional Context`, workflow.context, ``);
      }

      if (workflow.feedback) {
        promptParts.push(`## Previous Feedback (address these issues)`, workflow.feedback, ``);
      }

      promptParts.push(
        `## Repository: ${repoOwner}/${repoName}`,
        ``,
        `## Current Files`,
        ``
      );

      if (readmeContent) {
        promptParts.push(`### README.md`, '```markdown', readmeContent, '```', ``);
      }

      if (packageJson) {
        promptParts.push(`### package.json`, '```json', packageJson, '```', ``);
      }

      promptParts.push(
        `## Instructions`,
        `Based on the goal and context, generate a patch that implements the requested changes for this specific repository.`,
        `Focus on the README.md file for now.`,
        ``,
        `Respond with ONLY a JSON object in this exact format (no markdown code blocks, no explanation):`,
        `{`,
        `  "title": "Short title for the change (max 50 chars)",`,
        `  "summary": "Brief description of what this change does",`,
        `  "newContent": "The complete new README.md content"`,
        `}`
      );

      const prompt = promptParts.join('\n');

      const response = await llmRunner.run('coder', prompt, {
        context: { workflowId }
      });

      if (response.success && response.rawContent) {
        try {
          let jsonContent = response.rawContent.trim();
          if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
          }
          const parsed = JSON.parse(jsonContent);
          patchTitle = parsed.title || patchTitle;
          patchSummary = parsed.summary || patchSummary;

          if (parsed.newContent) {
            const oldLines = (readmeContent || '').split('\n');
            const newLines = parsed.newContent.split('\n');
            patchDiff = this.generateSimpleDiff('README.md', oldLines, newLines);
          }
          this.logger.log(`LLM generated patch for ${repoOwner}/${repoName}: ${patchTitle}`);
        } catch (parseErr) {
          this.logger.warn(`Failed to parse LLM response for ${repoOwner}/${repoName}: ${parseErr}`);
        }
      } else {
        this.logger.warn(`LLM call failed for ${repoOwner}/${repoName}: ${response.error}`);
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

    return { patchTitle, patchSummary, patchDiff };
  }

  private buildDecisionArtifact(
    workflow: { goal: string | null; context: string | null; feedback: string | null },
    repos: RepoConfig[],
    patchSetIds: string[]
  ): string {
    const lines = [
      '# Decision',
      '',
      `## Goal`,
      workflow.goal || 'No goal specified',
      '',
    ];

    if (workflow.context) {
      lines.push(`## Context`, workflow.context, '');
    }

    if (workflow.feedback) {
      lines.push(`## Feedback`, workflow.feedback, '');
    }

    lines.push(`## Repositories (${repos.length})`);
    for (let i = 0; i < repos.length; i++) {
      const r = repos[i];
      lines.push(`- ${r.owner}/${r.repo} (${r.role}) → PatchSet: ${patchSetIds[i] || 'pending'}`);
    }
    lines.push('', `- Recommendation: PROCEED`);

    return lines.join('\n');
  }

  private generateSimpleDiff(path: string, oldLines: string[], newLines: string[]): string {
    const diffLines = [
      `diff --git a/${path} b/${path}`,
      'index 0000000..1111111 100644',
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ];

    for (const line of oldLines) {
      diffLines.push(`-${line}`);
    }
    for (const line of newLines) {
      diffLines.push(`+${line}`);
    }

    return diffLines.join('\n');
  }
}
