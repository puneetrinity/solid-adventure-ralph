import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { parseRedisUrl } from './redis';
import { IngestContextProcessor } from './processors/ingest-context.processor';
import { ApplyPatchesProcessor } from './processors/apply-patches.processor';
import { EvaluatePolicyProcessor } from './processors/evaluate-policy.processor';
import { SummaryAnalysisProcessor } from './processors/summary-analysis.processor';
import { OrchestrateProcessor } from './processors/orchestrate.processor';
import { RefreshContextProcessor } from './processors/refresh-context.processor';
import { FeasibilityAnalysisProcessor } from './processors/feasibility-analysis.processor';
import { ArchitectureAnalysisProcessor } from './processors/architecture-analysis.processor';
import { TimelineAnalysisProcessor } from './processors/timeline-analysis.processor';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StubGitHubClient, type GitHubClient } from '@arch-orchestrator/core';
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
      htmlUrl: data.html_url
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

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')
    }),
    BullModule.registerQueue({ name: 'workflow' }),
    BullModule.registerQueue({ name: 'orchestrate' }),
    BullModule.registerQueue({ name: 'ingest_context' }),
    BullModule.registerQueue({ name: 'apply_patches' }),
    BullModule.registerQueue({ name: 'evaluate_policy' }),
    BullModule.registerQueue({ name: 'refresh_context' }),
    BullModule.registerQueue({ name: 'feasibility' }),
    BullModule.registerQueue({ name: 'architecture' }),
    BullModule.registerQueue({ name: 'timeline' }),
    BullModule.registerQueue({ name: 'summary' })
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

    // GitHub client - real when GITHUB_TOKEN is set, stub otherwise
    {
      provide: GITHUB_CLIENT_TOKEN,
      useFactory: createGitHubClient
    }
  ],
  exports: [GITHUB_CLIENT_TOKEN]
})
export class WorkerModule {}
