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
  createProviderWithFallback,
  PatchGenerationSchema,
  safeParseLLMResponse,
  SCHEMA_DESCRIPTIONS,
  buildRetryPrompt,
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
  // Repo tree structure
  tree: Array<{ path: string; type: 'blob' | 'tree'; size?: number }>;
  // Stored project context (from RepoContext table)
  storedContextSummary?: string;
  storedContextContent?: string;
  storedContextPath?: string;
  // Context audit trail
  storedContextId?: string;
  storedContextSha?: string;
}

interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string; // Required for create/modify, not needed for delete
  summary?: string;
}

interface LLMPatchResponse {
  title?: string;
  summary?: string;
  files?: FileChange[];
}

interface PatchResult {
  patchTitle: string;
  patchSummary: string;
  patchDiff: string;
  files: Array<{ path: string; additions: number; deletions: number }>;
  addsTests: boolean;
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

    if (workflow.stage === 'patches' && workflow.stageStatus !== 'processing') {
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'processing', stageUpdatedAt: new Date() }
      });
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
    const llmProvider = createProviderWithFallback('patches');

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

        // Generate patch for this repo (multi-file support)
        const { patchTitle, patchSummary, patchDiff, files, addsTests } = await this.generatePatch(
          workflowId,
          workflow,
          repoConfig,
          context,
          llmProvider
        );

        // Create PatchSet for this repo (with context audit trail)
        const patchSet = await this.prisma.patchSet.create({
          data: {
            workflowId,
            title: patchTitle,
            baseSha: context.baseSha,
            status: 'proposed',
            repoOwner,
            repoName,
            contextId: context.storedContextId || null,
            contextSha: context.storedContextSha || null
          }
        });

        await this.prisma.patch.create({
          data: {
            patchSetId: patchSet.id,
            taskId: `T-${repoName.substring(0, 3).toUpperCase()}-001`,
            title: patchTitle,
            summary: patchSummary,
            diff: patchDiff,
            files: files,
            addsTests: addsTests,
            riskLevel: files.length > 5 ? 'high' : files.length > 2 ? 'med' : 'low',
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
            payload: {
              repoOwner,
              repoName,
              baseSha: context.baseSha,
              patchSetId: patchSet.id,
              // Context audit trail
              contextId: context.storedContextId || null,
              contextSha: context.storedContextSha || null,
              contextPath: context.storedContextPath || null,
              usedStoredContext: !!context.storedContextId
            }
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

      if (workflow.stage === 'patches') {
        await this.prisma.workflow.update({
          where: { id: workflowId },
          data: { stageStatus: 'ready', stageUpdatedAt: new Date() }
        });
      }

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

      if (workflow.stage === 'patches') {
        try {
          await this.prisma.workflow.update({
            where: { id: workflowId },
            data: {
              stageStatus: 'needs_changes',
              stageUpdatedAt: new Date(),
              feedback: String(error?.message ?? error)
            }
          });
        } catch (updateErr) {
          this.logger.warn(`Failed to update workflow stageStatus on error: ${updateErr}`);
        }
      }

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

    // Fetch repo tree
    let tree: Array<{ path: string; type: 'blob' | 'tree'; size?: number }> = [];
    try {
      const treeResponse = await this.github.getTree({ owner, repo, sha: baseSha, recursive: true });
      tree = treeResponse.tree
        .filter(item => item.type === 'blob' || item.type === 'tree')
        .map(item => ({
          path: item.path,
          type: item.type as 'blob' | 'tree',
          size: item.size
        }));
      this.logger.log(`${owner}/${repo}: Fetched tree with ${tree.length} items`);
    } catch (err) {
      this.logger.warn(`${owner}/${repo}: Failed to fetch tree: ${err}`);
    }

    // Check for stored project context first
    let storedContextSummary: string | undefined;
    let storedContextContent: string | undefined;
    let storedContextPath: string | undefined;
    let storedContextId: string | undefined;
    let storedContextSha: string | undefined;

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
        storedContextId = storedContext.id;
        storedContextSha = storedContext.baseSha || undefined;
        this.logger.log(`${owner}/${repo}: Using stored context from ${storedContextPath} (id: ${storedContextId}, summary: ${storedContextSummary?.length || 0} chars)`);
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
      tree,
      storedContextSummary,
      storedContextContent,
      storedContextPath,
      storedContextId,
      storedContextSha
    };
  }

  private async generatePatch(
    workflowId: string,
    workflow: { goal: string | null; context: string | null; feedback: string | null },
    repoConfig: RepoConfig,
    repoContext: RepoContext,
    llmProvider: ReturnType<typeof createProviderWithFallback>
  ): Promise<PatchResult> {
    const { owner: repoOwner, repo: repoName, baseBranch } = repoConfig;
    const { readmeContent, packageJson, tree, storedContextSummary, storedContextPath, baseSha } = repoContext;

    let patchTitle = workflow.goal?.substring(0, 50) || 'Code change';
    let patchSummary = workflow.goal || 'Implement requested changes';
    let patchDiff = '';
    let files: Array<{ path: string; additions: number; deletions: number }> = [];
    let addsTests = false;

    this.logger.log(`Using ${llmProvider.name} LLM (${llmProvider.modelId}) to generate patch for ${repoOwner}/${repoName}...`);
    const llmRunner = new LLMRunner({ provider: llmProvider }, this.prisma);

      const promptParts = [
        `You are an expert software engineer. Your task is to implement the following request by modifying or creating files in the repository.`,
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
        ``
      );

      // Include tree structure (limited to avoid token overflow)
      if (tree.length > 0) {
        const fileTree = tree
          .filter(item => item.type === 'blob')
          .slice(0, 200) // Limit to first 200 files
          .map(item => item.path)
          .join('\n');
        promptParts.push(
          `## Repository File Structure`,
          '```',
          fileTree,
          '```',
          ``
        );
      }

      promptParts.push(`## Key Files (current content)`, ``);

      if (readmeContent) {
        promptParts.push(`### README.md`, '```markdown', readmeContent, '```', ``);
      }

      if (packageJson) {
        promptParts.push(`### package.json`, '```json', packageJson, '```', ``);
      }

      promptParts.push(
        `## Instructions`,
        `Based on the goal and context, determine which files need to be created, modified, or deleted.`,
        `You may modify existing files, create new ones, or delete files. Include test files if appropriate.`,
        ``,
        `Respond with ONLY a JSON object (no markdown code blocks, no explanation):`,
        `{`,
        `  "title": "Short title for the change (max 50 chars)",`,
        `  "summary": "Brief description of what this change does",`,
        `  "files": [`,
        `    {`,
        `      "path": "relative/path/to/file.ts",`,
        `      "action": "create" | "modify" | "delete",`,
        `      "content": "complete new file content (not needed for delete)"`,
        `    }`,
        `  ]`,
        `}`,
        ``,
        `Important:`,
        `- Return valid JSON only (no markdown fences, no commentary)`,
        `- Escape newlines in JSON strings as \\n`,
        `- Do not include unescaped quotes or control characters`,
        `- Always include a non-empty "files" array`,
        `- Max 5 files; choose the most critical changes`,
        `- Use only paths from the repository file structure above`,
        `- For "modify" action, provide the complete new content (not a diff)`,
        `- For "create" action, provide the full file content`,
        `- For "delete" action, content is not needed`,
        `- Keep changes focused and minimal`,
        `- Include any necessary imports`
      );

      const prompt = promptParts.join('\n');

      const response = await llmRunner.run('coder', prompt, {
        context: { workflowId }
      });

      if (response.success && response.rawContent) {
        const parsed = await this.parseOrRetryLLMResponse(response.rawContent, llmRunner, workflowId, repoOwner, repoName);
        if (!parsed) {
          throw new Error(`LLM response invalid after retry for ${repoOwner}/${repoName}`);
        }

        patchTitle = parsed.title || patchTitle;
        patchSummary = parsed.summary || patchSummary;

        if (parsed.files && parsed.files.length > 0) {
          const diffs: string[] = [];

          for (const fileChange of parsed.files) {
            const action = fileChange.action || 'modify';
            let oldContent = '';
            let oldLines: string[] = [];
            let newLines: string[] = [];

            // For modify/delete, we need the existing content
            if (action === 'modify' || action === 'delete') {
              // Check if it's one of our pre-fetched files
              if (fileChange.path === 'README.md') {
                oldContent = readmeContent;
              } else if (fileChange.path === 'package.json') {
                oldContent = packageJson;
              } else {
                // Fetch from GitHub
                try {
                  const file = await this.github.getFileContents({
                    owner: repoOwner,
                    repo: repoName,
                    path: fileChange.path,
                    ref: baseSha
                  });
                  oldContent = file.content;
                  this.logger.log(`Fetched ${fileChange.path} for diff generation`);
                } catch {
                  if (action === 'delete') {
                    this.logger.warn(`Could not fetch ${fileChange.path} for deletion, skipping`);
                    continue;
                  }
                  this.logger.warn(`Could not fetch ${fileChange.path}, treating as new file`);
                }
              }
              oldLines = oldContent ? oldContent.split('\n') : [];
            }

            // For create/modify, we need new content
            if (action !== 'delete') {
              if (!fileChange.content) {
                this.logger.warn(`Missing content for ${action} action on ${fileChange.path}, skipping`);
                continue;
              }
              newLines = fileChange.content.split('\n');
            }

            // Determine effective action based on what we found
            let effectiveAction = action;
            if (action === 'modify' && oldLines.length === 0) {
              effectiveAction = 'create';
            }

            const fileDiff = this.generateDiff(fileChange.path, oldLines, newLines, effectiveAction);
            diffs.push(fileDiff);

            // Calculate additions/deletions
            const additions = action === 'delete' ? 0 : newLines.length;
            const deletions = action === 'create' ? 0 : oldLines.length;
            files.push({ path: fileChange.path, additions, deletions });

            // Check if this is a test file
            if (fileChange.path.includes('test') || fileChange.path.includes('spec') || fileChange.path.includes('__tests__')) {
              addsTests = true;
            }
          }

          if (diffs.length > 0) {
            patchDiff = diffs.join('\n\n');
            this.logger.log(`LLM generated ${files.length} file changes for ${repoOwner}/${repoName}: ${patchTitle}`);
          }
        }
      } else {
        this.logger.warn(`LLM call failed for ${repoOwner}/${repoName}: ${response.error}`);
      }

    // Block progression if LLM didn't produce a usable diff (unless fallback is allowed)
    if (!patchDiff) {
      const allowFallback = process.env.ALLOW_PATCH_FALLBACK === 'true';
      if (allowFallback) {
        const stubPath = 'docs/ARCH_ORCHESTRATOR_STUB.md';
        const stubContent = [
          '# Stub Patch',
          '',
          `Generated because patch output was invalid for ${repoOwner}/${repoName}.`,
          `Workflow: ${workflowId}`,
        ].join('\n');
        const newLines = stubContent.split('\n');
        patchTitle = `Stub patch for ${repoOwner}/${repoName}`;
        patchSummary = 'Fallback patch generated in test mode.';
        patchDiff = this.generateDiff(stubPath, [], newLines, 'create');
        files = [{ path: stubPath, additions: newLines.length, deletions: 0 }];
        addsTests = false;
        this.logger.warn(`Using fallback stub patch for ${repoOwner}/${repoName}`);
      } else {
        throw new Error(`No valid patch diff generated for ${repoOwner}/${repoName}`);
      }
    }

    return { patchTitle, patchSummary, patchDiff, files, addsTests };
  }

  private async parseOrRetryLLMResponse(
    raw: string,
    llmRunner: LLMRunner,
    workflowId: string,
    repoOwner: string,
    repoName: string
  ): Promise<LLMPatchResponse | null> {
    const initial = this.tryParseLLMResponse(raw);
    if (initial.parsed) {
      return initial.parsed;
    }

    this.logger.warn(`LLM response parse failed for ${repoOwner}/${repoName}, retrying with strict JSON request`);

    const retryPrompt = [
      'Your previous response was invalid JSON.',
      'Return ONLY a valid JSON object with the exact schema below. No markdown, no commentary.',
      'Escape newlines in JSON strings as \\n and avoid unescaped control characters.',
      '',
      SCHEMA_DESCRIPTIONS.patch,
      '',
      'Here is your previous output. Fix it into valid JSON:',
      raw
    ].join('\n');

    const retryResponse = await llmRunner.run('coder', retryPrompt, {
      context: { workflowId }
    });

    if (!retryResponse.success || !retryResponse.rawContent) {
      this.logger.warn(`LLM retry failed for ${repoOwner}/${repoName}: ${retryResponse.error}`);
      return null;
    }

    const retried = this.tryParseLLMResponse(retryResponse.rawContent);
    if (!retried.parsed) {
      this.logger.warn(`LLM retry response still invalid for ${repoOwner}/${repoName}: ${retried.error}`);
      return null;
    }

    return retried.parsed;
  }

  private tryParseLLMResponse(raw: string): { parsed: LLMPatchResponse | null; error?: string } {
    // Use Zod schema for validation
    const result = safeParseLLMResponse(raw, PatchGenerationSchema);
    if (result.success) {
      return { parsed: result.data };
    }

    // Fallback to legacy validation for backwards compatibility
    try {
      let jsonContent = this.extractJsonBlock(raw);
      if (!jsonContent) {
        return { parsed: null, error: result.error || 'No JSON object found' };
      }
      jsonContent = this.sanitizeJsonString(jsonContent);
      const rawParsed = JSON.parse(jsonContent);
      const parsed = this.validateLLMResponse(rawParsed);
      if (!parsed) {
        return { parsed: null, error: result.error || 'Invalid response structure' };
      }
      return { parsed };
    } catch (err: any) {
      return { parsed: null, error: result.error || String(err?.message ?? err) };
    }
  }

  private extractJsonBlock(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch && fenceMatch[1]) {
        return fenceMatch[1].trim();
      }
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    return null;
  }

  private sanitizeJsonString(input: string): string {
    return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
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

  private generateDiff(
    path: string,
    oldLines: string[],
    newLines: string[],
    action: 'create' | 'modify' | 'delete'
  ): string {
    const diffLines: string[] = [`diff --git a/${path} b/${path}`];

    if (action === 'create') {
      diffLines.push('new file mode 100644');
      diffLines.push('index 0000000..1111111');
      diffLines.push('--- /dev/null');
      diffLines.push(`+++ b/${path}`);
      diffLines.push(`@@ -0,0 +1,${newLines.length} @@`);
      for (const line of newLines) {
        diffLines.push(`+${line}`);
      }
    } else if (action === 'delete') {
      diffLines.push('deleted file mode 100644');
      diffLines.push('index 1111111..0000000');
      diffLines.push(`--- a/${path}`);
      diffLines.push('+++ /dev/null');
      diffLines.push(`@@ -1,${oldLines.length} +0,0 @@`);
      for (const line of oldLines) {
        diffLines.push(`-${line}`);
      }
    } else {
      // modify
      diffLines.push('index 0000000..1111111 100644');
      diffLines.push(`--- a/${path}`);
      diffLines.push(`+++ b/${path}`);
      diffLines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
      for (const line of oldLines) {
        diffLines.push(`-${line}`);
      }
      for (const line of newLines) {
        diffLines.push(`+${line}`);
      }
    }

    return diffLines.join('\n');
  }

  private validateLLMResponse(parsed: unknown): LLMPatchResponse | null {
    if (!parsed || typeof parsed !== 'object') return null;

    const response = parsed as Record<string, unknown>;

    // Validate files array if present
    if (response.files && Array.isArray(response.files)) {
      const validFiles = response.files.filter((f: unknown) => {
        if (!f || typeof f !== 'object') return false;
        const file = f as Record<string, unknown>;
        if (typeof file.path !== 'string' || !file.path.trim()) return false;
        if (!['create', 'modify', 'delete'].includes(file.action as string)) {
          // Default to 'modify' if action missing
          file.action = 'modify';
        }
        // content required for create/modify
        if (file.action !== 'delete' && typeof file.content !== 'string') return false;
        return true;
      });

      if (validFiles.length === 0) return null;
      response.files = validFiles;
    }

    return {
      title: typeof response.title === 'string' ? response.title : undefined,
      summary: typeof response.summary === 'string' ? response.summary : undefined,
      files: response.files as FileChange[] | undefined
    };
  }
}
