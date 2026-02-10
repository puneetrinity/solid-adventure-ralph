import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { parseRedisUrl } from './redis';
import { IngestContextProcessor } from './processors/ingest-context.processor';
import { ApplyPatchesProcessor } from './processors/apply-patches.processor';
import { EvaluatePolicyProcessor } from './processors/evaluate-policy.processor';
import { SummaryAnalysisProcessor } from './processors/summary-analysis.processor';
import { SandboxValidationProcessor } from './processors/sandbox-validation.processor';
import { OrchestrateProcessor } from './processors/orchestrate.processor';
import { RefreshContextProcessor } from './processors/refresh-context.processor';
import { FeasibilityAnalysisProcessor } from './processors/feasibility-analysis.processor';
import { ArchitectureAnalysisProcessor } from './processors/architecture-analysis.processor';
import { TimelineAnalysisProcessor } from './processors/timeline-analysis.processor';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StubGitHubClient, type GitHubClient, type WorkflowRunInfo, type WorkflowRunList } from '@arch-orchestrator/core';
import { Octokit } from '@octokit/rest';
import { GITHUB_CLIENT_TOKEN } from './constants';

// Simple inline implementation to avoid ESM import issues
class TokenGitHubClient implements GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getRepository(params: { owner: string; repo: string }) {
    const { data } = await this.octokit.repos.get(params);
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
      htmlUrl: data.html_url,
      description: data.description,
      language: data.language,
      topics: data.topics
    };
  }

  async getFileContents(params: { owner: string; repo: string; path: string; ref?: string }) {
    const { data } = await this.octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path "${params.path}" is not a file`);
    }

    const content = data.content
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : '';

    return { path: data.path, content, sha: data.sha, size: data.size };
  }

  async getBranch(params: { owner: string; repo: string; branch: string }) {
    const { data } = await this.octokit.repos.getBranch(params);
    return { name: data.name, sha: data.commit.sha, protected: data.protected };
  }

  async getTree(params: { owner: string; repo: string; sha: string; recursive?: boolean }) {
    const { data } = await this.octokit.git.getTree({
      owner: params.owner,
      repo: params.repo,
      tree_sha: params.sha,
      recursive: params.recursive ? 'true' : undefined
    });
    return {
      sha: data.sha,
      tree: data.tree.map(item => ({
        path: item.path || '',
        mode: item.mode || '',
        type: item.type as 'blob' | 'tree',
        sha: item.sha || '',
        size: item.size
      })),
      truncated: data.truncated
    };
  }

  async dispatchWorkflow(params: { owner: string; repo: string; workflowId: string; ref: string; inputs?: Record<string, string> }) {
    await this.octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner: params.owner,
      repo: params.repo,
      workflow_id: params.workflowId,
      ref: params.ref,
      inputs: params.inputs ?? {}
    });
  }

  async listWorkflowRuns(params: { owner: string; repo: string; workflowId?: string; branch?: string; event?: string; perPage?: number }): Promise<WorkflowRunList> {
    const mapRun = (run: any): WorkflowRunInfo => ({
      id: run.id,
      status: (run.status as WorkflowRunInfo['status']) ?? 'queued',
      conclusion: run.conclusion as WorkflowRunInfo['conclusion'],
      htmlUrl: run.html_url,
      logsUrl: run.logs_url,
      headSha: run.head_sha,
      headBranch: run.head_branch ?? undefined,
      event: run.event,
      createdAt: run.created_at,
      updatedAt: run.updated_at
    });

    if (params.workflowId) {
      const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
        owner: params.owner,
        repo: params.repo,
        workflow_id: params.workflowId,
        branch: params.branch,
        event: params.event,
        per_page: params.perPage ?? 20
      });
      return {
        totalCount: data.total_count ?? data.workflow_runs.length,
        runs: data.workflow_runs.map(mapRun)
      };
    }

    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      event: params.event,
      per_page: params.perPage ?? 20
    });

    return {
      totalCount: data.total_count ?? data.workflow_runs.length,
      runs: data.workflow_runs.map(mapRun)
    };
  }

  async getWorkflowRun(params: { owner: string; repo: string; runId: number }): Promise<WorkflowRunInfo> {
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
      owner: params.owner,
      repo: params.repo,
      run_id: params.runId
    });
    return {
      id: data.id,
      status: (data.status as WorkflowRunInfo['status']) ?? 'queued',
      conclusion: data.conclusion as WorkflowRunInfo['conclusion'],
      htmlUrl: data.html_url,
      logsUrl: data.logs_url,
      headSha: data.head_sha,
      headBranch: data.head_branch ?? undefined,
      event: data.event,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async createBranch(params: { owner: string; repo: string; branch: string; sha: string }) {
    const { data } = await this.octokit.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${params.branch}`,
      sha: params.sha
    });
    return { ref: data.ref, sha: data.object.sha };
  }

  async updateFile(params: { owner: string; repo: string; path: string; message: string; content: string; sha?: string; branch: string }) {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      content: params.content,
      sha: params.sha,
      branch: params.branch
    });
    return {
      path: data.content?.path ?? params.path,
      sha: data.content?.sha ?? '',
      commitSha: data.commit.sha ?? ''
    };
  }

  async deleteFile(params: { owner: string; repo: string; path: string; message: string; sha: string; branch: string }) {
    const { data } = await this.octokit.repos.deleteFile({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      sha: params.sha,
      branch: params.branch
    });
    return {
      commitSha: data.commit.sha ?? ''
    };
  }

  async openPullRequest(params: { owner: string; repo: string; head: string; base: string; title: string; body?: string }) {
    const { data } = await this.octokit.pulls.create(params);
    return { url: data.html_url, number: data.number };
  }
}

function createGitHubClient(): GitHubClient {
  const logger = new Logger('GitHubClientFactory');
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    logger.log('Using TokenGitHubClient with PAT authentication');
    return new TokenGitHubClient(token);
  }

  logger.warn('GITHUB_TOKEN not set, using StubGitHubClient');
  return new StubGitHubClient();
}

// Default job options for retry with exponential backoff
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000, // 5s initial delay, then 10s, 20s
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 50, // Keep last 50 failed jobs
};

// LLM-heavy jobs get more time and retries
const LLM_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 10000, // 10s initial delay for LLM rate limits
  },
};

// Quick orchestration jobs
const ORCHESTRATE_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
};

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')
    }),
    BullModule.registerQueue({ name: 'workflow', defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'orchestrate', defaultJobOptions: ORCHESTRATE_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'ingest_context', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'apply_patches', defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'evaluate_policy', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'refresh_context', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'feasibility', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'architecture', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'timeline', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'summary', defaultJobOptions: LLM_JOB_OPTIONS }),
    BullModule.registerQueue({ name: 'sandbox', defaultJobOptions: DEFAULT_JOB_OPTIONS })
  ],
  providers: [
    // Orchestrator (Phase 3)
    OrchestratorService,
    OrchestrateProcessor,

    // Stage processors
    FeasibilityAnalysisProcessor,
    ArchitectureAnalysisProcessor,
    TimelineAnalysisProcessor,
    SummaryAnalysisProcessor,
    IngestContextProcessor,
    ApplyPatchesProcessor,
    EvaluatePolicyProcessor,
    RefreshContextProcessor,
    SandboxValidationProcessor,

    // GitHub client - real when GITHUB_TOKEN is set, stub otherwise
    {
      provide: GITHUB_CLIENT_TOKEN,
      useFactory: createGitHubClient
    }
  ],
  exports: [GITHUB_CLIENT_TOKEN]
})
export class WorkerModule {}
