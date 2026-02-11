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
  PatchPlanSchema,
  type PatchPlan,
  safeParseLLMResponse,
  SCHEMA_DESCRIPTIONS,
  buildRetryPrompt,
  generateUnifiedDiff,
  generateReplaceActionDiff,
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
  action: 'create' | 'modify' | 'delete' | 'replace';
  content?: string; // Required for create/modify, not needed for delete/replace
  find?: string; // Required for replace action
  replace?: string; // Required for replace action
  rationale?: string; // Required for modify action
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
    const { owner: repoOwner, repo: repoName } = repoConfig;
    const { readmeContent, packageJson, tree, storedContextSummary, storedContextPath, baseSha } = repoContext;

    let patchTitle = workflow.goal?.substring(0, 50) || 'Code change';
    let patchSummary = workflow.goal || 'Implement requested changes';
    let patchDiff = '';
    let files: Array<{ path: string; additions: number; deletions: number }> = [];
    let addsTests = false;

    if (process.env.NODE_ENV === 'test' && workflow.context?.includes('[FORCE_PATCH_ERROR]')) {
      throw new Error(`Forced patch validation error for ${repoOwner}/${repoName}`);
    }

    this.logger.log(`Using ${llmProvider.name} LLM (${llmProvider.modelId}) to generate patch for ${repoOwner}/${repoName}...`);
    const llmRunner = new LLMRunner({ provider: llmProvider }, this.prisma);

    // Fetch approved artifacts to guide patch generation
    const approvedArtifacts = await this.fetchApprovedArtifacts(workflowId);

    // ============================================================================
    // PASS 1: File Selection - Ask LLM to identify which files need changes
    // ============================================================================
    this.logger.log(`Pass 1: Requesting file selection plan for ${repoOwner}/${repoName}...`);

    const pass1Prompt = this.buildPass1Prompt(
      workflow,
      repoConfig,
      tree,
      storedContextSummary,
      storedContextPath,
      approvedArtifacts
    );

    const pass1Response = await llmRunner.run('coder', pass1Prompt, {
      context: { workflowId }
    });

    let patchPlan: PatchPlan | null = null;
    if (pass1Response.success && pass1Response.rawContent) {
      const planResult = await this.parseOrRetryPatchPlan(pass1Response.rawContent, llmRunner, workflowId, repoOwner, repoName);
      if ('error' in planResult) {
        const allowFallback = process.env.ALLOW_PATCH_FALLBACK === 'true';
        if (allowFallback) {
          this.logger.warn(`Pass 1 failed for ${repoOwner}/${repoName}: ${planResult.error}`);
          this.logger.warn(`ALLOW_PATCH_FALLBACK is enabled, will use stub patch`);
        } else {
          throw new Error(`Patch planning failed for ${repoOwner}/${repoName}:\n${planResult.error}`);
        }
      } else {
        patchPlan = planResult.parsed;
        patchTitle = patchPlan.title || patchTitle;
        patchSummary = patchPlan.summary || patchSummary;
        this.logger.log(`Pass 1 complete: ${patchPlan.files.length} files selected for ${repoOwner}/${repoName}`);
      }
    } else {
      this.logger.warn(`Pass 1 LLM call failed for ${repoOwner}/${repoName}: ${pass1Response.error}`);
    }

    // ============================================================================
    // PASS 2: Generate actual changes with file contents
    // ============================================================================
    if (patchPlan && patchPlan.files.length > 0) {
      this.logger.log(`Pass 2: Fetching ${patchPlan.files.length} selected files and generating changes...`);

      // Fetch content for all selected files
      const fileContents = await this.fetchSelectedFiles(patchPlan.files, repoOwner, repoName, baseSha, readmeContent, packageJson);

      // Build Pass 2 prompt with actual file contents
      const pass2Prompt = this.buildPass2Prompt(
        workflow,
        repoConfig,
        patchPlan,
        fileContents,
        storedContextSummary,
        storedContextPath,
        approvedArtifacts
      );

      const pass2Response = await llmRunner.run('coder', pass2Prompt, {
        context: { workflowId }
      });

      if (pass2Response.success && pass2Response.rawContent) {
        const parseResult = await this.parseOrRetryLLMResponse(pass2Response.rawContent, llmRunner, workflowId, repoOwner, repoName);
        if ('error' in parseResult) {
          const allowFallback = process.env.ALLOW_PATCH_FALLBACK === 'true';
          if (allowFallback) {
            this.logger.warn(`Pass 2 validation failed for ${repoOwner}/${repoName}: ${parseResult.error}`);
            this.logger.warn(`ALLOW_PATCH_FALLBACK is enabled, will use stub patch`);
          } else {
            throw new Error(`Patch generation failed for ${repoOwner}/${repoName}:\n${parseResult.error}`);
          }
        }

        const parsed = 'parsed' in parseResult ? parseResult.parsed : null;
        if (parsed) {
          patchTitle = parsed.title || patchTitle;
          patchSummary = parsed.summary || patchSummary;

          if (parsed.files && parsed.files.length > 0) {
            const diffs: string[] = [];
            const replaceErrors: string[] = [];

            for (const fileChange of parsed.files) {
              const action = fileChange.action || 'modify';
              let oldContent = '';
              let newContent = '';

              // Get file content from our pre-fetched map
              const getFileContent = (path: string): string | null => {
                return fileContents.get(path) ?? null;
              };

              // Handle REPLACE action (preferred for existing files)
              if (action === 'replace') {
                if (!fileChange.find || fileChange.replace === undefined) {
                  this.logger.warn(`Replace action missing find/replace for ${fileChange.path}, skipping`);
                  continue;
                }

                oldContent = getFileContent(fileChange.path) || '';
                if (!oldContent) {
                  replaceErrors.push(`File '${fileChange.path}' not found for replace action`);
                  continue;
                }

                const replaceResult = generateReplaceActionDiff(
                  fileChange.path,
                  oldContent,
                  fileChange.find,
                  fileChange.replace,
                  { contextLines: 3 }
                );

                if ('error' in replaceResult) {
                  replaceErrors.push(replaceResult.error);
                  this.logger.warn(`Replace action failed: ${replaceResult.error}`);
                  continue;
                }

                diffs.push(replaceResult.diff.patch);
                files.push({
                  path: fileChange.path,
                  additions: replaceResult.diff.additions,
                  deletions: replaceResult.diff.deletions
                });

                this.logger.log(`Generated replace diff for ${fileChange.path}: +${replaceResult.diff.additions}/-${replaceResult.diff.deletions}`);
                continue;
              }

              // Handle DELETE action
              if (action === 'delete') {
                oldContent = getFileContent(fileChange.path) || '';
                if (!oldContent) {
                  this.logger.warn(`Could not fetch ${fileChange.path} for deletion, skipping`);
                  continue;
                }

                const diffResult = generateUnifiedDiff(
                  fileChange.path,
                  oldContent,
                  '',
                  'delete',
                  { contextLines: 3 }
                );
                diffs.push(diffResult.patch);
                files.push({
                  path: fileChange.path,
                  additions: 0,
                  deletions: diffResult.deletions
                });

                this.logger.log(`Generated delete diff for ${fileChange.path}: -${diffResult.deletions}`);
                continue;
              }

              // Handle MODIFY action (discouraged - requires rationale)
              if (action === 'modify') {
                oldContent = getFileContent(fileChange.path) || '';

                if (!fileChange.content) {
                  this.logger.warn(`Missing content for modify action on ${fileChange.path}, skipping`);
                  continue;
                }
                newContent = fileChange.content;

                if (!fileChange.rationale) {
                  this.logger.warn(`Modify action on ${fileChange.path} missing rationale`);
                }

                const effectiveAction = oldContent ? 'modify' : 'create';

                const diffResult = generateUnifiedDiff(
                  fileChange.path,
                  oldContent,
                  newContent,
                  effectiveAction,
                  { contextLines: 3 }
                );
                diffs.push(diffResult.patch);
                files.push({
                  path: fileChange.path,
                  additions: diffResult.additions,
                  deletions: diffResult.deletions
                });

                this.logger.log(`Generated ${effectiveAction} diff for ${fileChange.path}: +${diffResult.additions}/-${diffResult.deletions} (${diffResult.hunks} hunks)`);
                continue;
              }

              // Handle CREATE action
              if (action === 'create') {
                if (!fileChange.content) {
                  this.logger.warn(`Missing content for create action on ${fileChange.path}, skipping`);
                  continue;
                }
                newContent = fileChange.content;

                const diffResult = generateUnifiedDiff(
                  fileChange.path,
                  '',
                  newContent,
                  'create',
                  { contextLines: 3 }
                );
                diffs.push(diffResult.patch);
                files.push({
                  path: fileChange.path,
                  additions: diffResult.additions,
                  deletions: diffResult.deletions
                });

                this.logger.log(`Generated create diff for ${fileChange.path}: +${diffResult.additions}`);
              }

              // Check if this is a test file
              if (fileChange.path.includes('test') || fileChange.path.includes('spec') || fileChange.path.includes('__tests__')) {
                addsTests = true;
              }
            }

            // Report replace action errors
            if (replaceErrors.length > 0) {
              this.logger.warn(`Replace action errors: ${replaceErrors.join('; ')}`);
            }

            if (diffs.length > 0) {
              patchDiff = diffs.join('\n\n');
              this.logger.log(`Pass 2 complete: ${files.length} file changes for ${repoOwner}/${repoName}: ${patchTitle}`);
            } else if (replaceErrors.length > 0) {
              const allowFallback = process.env.ALLOW_PATCH_FALLBACK === 'true';
              if (!allowFallback) {
                throw new Error(`All file changes failed: ${replaceErrors.join('; ')}`);
              }
              this.logger.warn(`All file changes failed, will use fallback: ${replaceErrors.join('; ')}`);
            }
          }
        }
      } else {
        this.logger.warn(`Pass 2 LLM call failed for ${repoOwner}/${repoName}: ${pass2Response.error}`);
      }
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
        patchTitle = `Stub patch for ${repoOwner}/${repoName}`;
        patchSummary = 'Fallback patch generated in test mode.';
        const stubDiff = generateUnifiedDiff(stubPath, '', stubContent, 'create', { contextLines: 3 });
        patchDiff = stubDiff.patch;
        files = [{ path: stubPath, additions: stubDiff.additions, deletions: 0 }];
        addsTests = false;
        this.logger.warn(`Using fallback stub patch for ${repoOwner}/${repoName}`);
      } else {
        throw new Error(`No valid patch diff generated for ${repoOwner}/${repoName}`);
      }
    }

    return { patchTitle, patchSummary, patchDiff, files, addsTests };
  }

  /**
   * Build Pass 1 prompt for file selection.
   * Asks LLM to identify which files need to be changed without actual code.
   */
  private buildPass1Prompt(
    workflow: { goal: string | null; context: string | null; feedback: string | null },
    repoConfig: RepoConfig,
    tree: Array<{ path: string; type: 'blob' | 'tree'; size?: number }>,
    storedContextSummary: string | undefined,
    storedContextPath: string | undefined,
    approvedArtifacts: { summary: string | null; architecture: string | null; timeline: string | null }
  ): string {
    const { owner: repoOwner, repo: repoName } = repoConfig;
    const promptParts = [
      `You are an expert software engineer. Your task is to PLAN which files need to be changed to implement the following request.`,
      ``,
      `DO NOT write any code yet. Just identify the files and describe what changes each file needs.`,
      ``
    ];

    // Include approved plan artifacts
    if (approvedArtifacts.summary) {
      promptParts.push(
        `## Approved Summary`,
        `The following summary was approved for this implementation:`,
        '```',
        approvedArtifacts.summary,
        '```',
        ``
      );
    }

    if (approvedArtifacts.architecture) {
      promptParts.push(
        `## Approved Architecture`,
        `Follow this approved architecture approach:`,
        '```',
        approvedArtifacts.architecture,
        '```',
        ``
      );
    }

    if (approvedArtifacts.timeline) {
      promptParts.push(
        `## Approved Timeline/Tasks`,
        `Implement according to this approved task breakdown:`,
        '```',
        approvedArtifacts.timeline,
        '```',
        ``
      );
    }

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

    // Include tree structure
    if (tree.length > 0) {
      const fileTree = tree
        .filter(item => item.type === 'blob')
        .slice(0, 200)
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

    promptParts.push(
      `## Instructions`,
      `Identify which files need to be created, modified, or deleted to achieve the goal.`,
      ``,
      `Respond with ONLY a JSON object (no markdown code blocks, no explanation):`,
      SCHEMA_DESCRIPTIONS.patchPlan,
      ``,
      `Rules:`,
      `- Maximum 5 files per patch`,
      `- Use only paths from the repository file structure above (or new paths for create)`,
      `- Prefer "replace" action for existing files (surgical edits)`,
      `- Use "modify" only for major refactors (>50% of file)`,
      `- Provide clear descriptions of what each file change will do`,
      `- Return valid JSON only`
    );

    return promptParts.join('\n');
  }

  /**
   * Fetch contents of files selected in Pass 1.
   */
  private async fetchSelectedFiles(
    selectedFiles: Array<{ path: string; action: string }>,
    repoOwner: string,
    repoName: string,
    baseSha: string,
    readmeContent: string,
    packageJson: string
  ): Promise<Map<string, string>> {
    const fileContents = new Map<string, string>();

    for (const file of selectedFiles) {
      // Skip files being created (no existing content)
      if (file.action === 'create') {
        this.logger.log(`Skipping fetch for new file: ${file.path}`);
        continue;
      }

      // Use cached content for README and package.json
      if (file.path === 'README.md' && readmeContent) {
        fileContents.set(file.path, readmeContent);
        continue;
      }
      if (file.path === 'package.json' && packageJson) {
        fileContents.set(file.path, packageJson);
        continue;
      }

      // Fetch from GitHub
      try {
        const content = await this.github.getFileContents({
          owner: repoOwner,
          repo: repoName,
          path: file.path,
          ref: baseSha
        });
        fileContents.set(file.path, content.content);
        this.logger.log(`Fetched ${file.path} (${content.size} bytes)`);
      } catch (err) {
        this.logger.warn(`Could not fetch ${file.path}: ${err}`);
      }
    }

    return fileContents;
  }

  /**
   * Build Pass 2 prompt with actual file contents.
   */
  private buildPass2Prompt(
    workflow: { goal: string | null; context: string | null; feedback: string | null },
    repoConfig: RepoConfig,
    patchPlan: PatchPlan,
    fileContents: Map<string, string>,
    storedContextSummary: string | undefined,
    storedContextPath: string | undefined,
    approvedArtifacts: { summary: string | null; architecture: string | null; timeline: string | null }
  ): string {
    const { owner: repoOwner, repo: repoName } = repoConfig;
    const promptParts = [
      `You are an expert software engineer. Implement the planned changes below.`,
      ``
    ];

    // Brief goal reminder
    promptParts.push(
      `## Goal`,
      workflow.goal || 'Improve the codebase',
      ``
    );

    // Include architecture for reference
    if (approvedArtifacts.architecture) {
      promptParts.push(
        `## Approved Architecture (reference)`,
        '```',
        approvedArtifacts.architecture.substring(0, 2000), // Truncate to save tokens
        '```',
        ``
      );
    }

    // Show the plan from Pass 1
    promptParts.push(
      `## Your Plan (from Pass 1)`,
      `Title: ${patchPlan.title}`,
      `Summary: ${patchPlan.summary}`,
      ``,
      `Files to change:`
    );
    for (const file of patchPlan.files) {
      promptParts.push(`- ${file.path} (${file.action}): ${file.description}`);
    }
    promptParts.push(``);

    // Include actual file contents
    promptParts.push(`## File Contents (current state)`, ``);
    for (const [path, content] of fileContents) {
      const ext = path.split('.').pop() || 'txt';
      promptParts.push(`### ${path}`, '```' + ext, content, '```', ``);
    }

    promptParts.push(
      `## Instructions`,
      `Now implement the changes you planned. For each file:`,
      ``,
      `- Use "replace" action for surgical edits (PREFERRED)`,
      `- Use "create" for new files`,
      `- Use "modify" only for major refactors (>50% of file, requires rationale)`,
      `- Use "delete" to remove files`,
      ``,
      `Respond with ONLY a JSON object (no markdown code blocks, no explanation):`,
      SCHEMA_DESCRIPTIONS.patch,
      ``,
      `Critical Rules:`,
      `- Return valid JSON only (no markdown fences, no commentary)`,
      `- Escape newlines in JSON strings as \\n`,
      `- For "replace": the "find" string must match EXACTLY ONCE in the file`,
      `- For "modify": provide rationale and keep under 200 lines`,
      `- Make minimal, focused changes`,
      `- Preserve existing code style`
    );

    return promptParts.join('\n');
  }

  /**
   * Parse and retry Pass 1 (PatchPlan) response.
   */
  private async parseOrRetryPatchPlan(
    raw: string,
    llmRunner: LLMRunner,
    workflowId: string,
    repoOwner: string,
    repoName: string
  ): Promise<{ parsed: PatchPlan } | { error: string }> {
    const initial = safeParseLLMResponse(raw, PatchPlanSchema);
    if (initial.success) {
      return { parsed: initial.data };
    }

    this.logger.warn(`Pass 1 parse failed for ${repoOwner}/${repoName}: ${initial.error}`);
    this.logger.warn(`Retrying Pass 1 with strict JSON request...`);

    const retryPrompt = [
      'Your previous response was invalid.',
      '',
      `Validation error: ${initial.error}`,
      '',
      'Return ONLY a valid JSON object with the exact schema below. No markdown, no commentary.',
      '',
      SCHEMA_DESCRIPTIONS.patchPlan,
      '',
      'Here is your previous output. Fix it into valid JSON:',
      raw.substring(0, 3000)
    ].join('\n');

    const retryResponse = await llmRunner.run('coder', retryPrompt, {
      context: { workflowId }
    });

    if (!retryResponse.success || !retryResponse.rawContent) {
      return { error: `Pass 1 retry failed: ${retryResponse.error || 'No response'}. Original error: ${initial.error}` };
    }

    const retried = safeParseLLMResponse(retryResponse.rawContent, PatchPlanSchema);
    if (!retried.success) {
      return { error: `Pass 1 validation failed after retry: ${retried.error}` };
    }

    return { parsed: retried.data };
  }

  private async parseOrRetryLLMResponse(
    raw: string,
    llmRunner: LLMRunner,
    workflowId: string,
    repoOwner: string,
    repoName: string
  ): Promise<{ parsed: LLMPatchResponse } | { error: string }> {
    const initial = this.tryParseLLMResponse(raw);
    if (initial.parsed) {
      return { parsed: initial.parsed };
    }

    this.logger.warn(`LLM response parse failed for ${repoOwner}/${repoName}: ${initial.error}`);
    this.logger.warn(`Retrying with strict JSON request...`);

    const retryPrompt = [
      'Your previous response was invalid.',
      '',
      `Validation error: ${initial.error}`,
      '',
      'Return ONLY a valid JSON object with the exact schema below. No markdown, no commentary.',
      'Escape newlines in JSON strings as \\n and avoid unescaped control characters.',
      '',
      SCHEMA_DESCRIPTIONS.patch,
      '',
      'Here is your previous output. Fix it into valid JSON:',
      raw.substring(0, 3000) // Truncate to avoid token overflow
    ].join('\n');

    const retryResponse = await llmRunner.run('coder', retryPrompt, {
      context: { workflowId }
    });

    if (!retryResponse.success || !retryResponse.rawContent) {
      return { error: `LLM retry failed: ${retryResponse.error || 'No response'}. Original error: ${initial.error}` };
    }

    const retried = this.tryParseLLMResponse(retryResponse.rawContent);
    if (!retried.parsed) {
      return { error: `Patch validation failed after retry: ${retried.error}` };
    }

    return { parsed: retried.parsed };
  }

  private tryParseLLMResponse(raw: string): { parsed: LLMPatchResponse | null; error?: string } {
    // Use Zod schema for strict validation (no fallback to ensure quality constraints)
    const result = safeParseLLMResponse(raw, PatchGenerationSchema);
    if (result.success) {
      return { parsed: result.data };
    }

    // No fallback - strict Zod validation enforces:
    // - replace action preferred (find must match exactly once)
    // - modify requires rationale
    // - max 200 lines for modify
    // - max 5 files per patch
    return { parsed: null, error: result.error };
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

  /**
   * Fetch approved artifacts (Summary, Architecture, Timeline) for the workflow.
   * These guide the patch generation to align with the approved plan.
   */
  private async fetchApprovedArtifacts(workflowId: string): Promise<{
    summary: string | null;
    architecture: string | null;
    timeline: string | null;
  }> {
    const artifactKinds = ['SummaryV1', 'ArchitectureV1', 'TimelineV1'] as const;

    const artifacts = await this.prisma.artifact.findMany({
      where: {
        workflowId,
        kind: { in: [...artifactKinds] }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get the most recent artifact of each kind
    const summaryArtifact = artifacts.find(a => a.kind === 'SummaryV1');
    const architectureArtifact = artifacts.find(a => a.kind === 'ArchitectureV1');
    const timelineArtifact = artifacts.find(a => a.kind === 'TimelineV1');

    const result = {
      summary: summaryArtifact?.content || null,
      architecture: architectureArtifact?.content || null,
      timeline: timelineArtifact?.content || null
    };

    const loadedCount = [result.summary, result.architecture, result.timeline].filter(Boolean).length;
    this.logger.log(`Loaded ${loadedCount}/3 approved artifacts for patch generation`);

    return result;
  }
}
