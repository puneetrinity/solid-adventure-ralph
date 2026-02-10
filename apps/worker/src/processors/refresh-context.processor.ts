import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import {
  type GitHubClient,
  LLMRunner,
  createGroqProvider,
} from '@arch-orchestrator/core';
import { GITHUB_CLIENT_TOKEN } from '../constants';

interface RefreshContextJobData {
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  workflowId?: string;
}

// Files to try for project context (in order of preference)
const CONTEXT_FILES = [
  'PROJECT_CONTEXT.md',
  'AGENTS.md',
  'CONTEXT.md',
  '.github/CONTEXT.md',
  'docs/CONTEXT.md',
];

@Processor('refresh_context')
export class RefreshContextProcessor extends WorkerHost {
  private prisma = getPrisma();
  private readonly logger = new Logger(RefreshContextProcessor.name);

  constructor(
    @Inject(GITHUB_CLIENT_TOKEN) private readonly github: GitHubClient
  ) {
    super();
  }

  async process(job: Job<RefreshContextJobData>) {
    const { repoOwner, repoName, baseBranch, workflowId } = job.data;
    this.logger.log(`Refreshing context for ${repoOwner}/${repoName}@${baseBranch}`);

    try {
      // Get base branch SHA
      const branch = await this.github.getBranch({
        owner: repoOwner,
        repo: repoName,
        branch: baseBranch
      });
      const baseSha = branch.sha;
      this.logger.log(`${repoOwner}/${repoName} base SHA: ${baseSha}`);

      // Try to fetch context file
      let content: string | null = null;
      let contextPath: string | null = null;

      for (const filePath of CONTEXT_FILES) {
        try {
          const file = await this.github.getFileContents({
            owner: repoOwner,
            repo: repoName,
            path: filePath,
            ref: baseSha
          });
          content = file.content;
          contextPath = filePath;
          this.logger.log(`${repoOwner}/${repoName}: Found context file at ${filePath} (${file.size} bytes)`);
          break;
        } catch {
          // File not found, try next
        }
      }

      // Generate summary using LLM, or generate full context if none exists
      let summary: string | null = null;
      const groqProvider = createGroqProvider();

      if (content) {
        // Context file exists - generate summary
        if (groqProvider) {
          this.logger.log(`Generating summary for ${repoOwner}/${repoName} context...`);
          const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

          const prompt = `You are a technical documentation expert. Summarize the following project context document in 2-3 paragraphs. Focus on:
1. What the project does (purpose and main features)
2. Key technologies and architecture
3. Important constraints or guidelines for contributors

Be concise but comprehensive. This summary will be used to provide context to an AI coding assistant.

---

${content}`;

          try {
            const response = await llmRunner.run('documenter', prompt, {
              budget: { maxInputTokens: 50000, maxOutputTokens: 1000, maxTotalCost: 50 },
            });

            if (response.success && response.rawContent) {
              summary = response.rawContent;
              this.logger.log(`Generated summary for ${repoOwner}/${repoName} (${summary.length} chars)`);
            }
          } catch (err) {
            this.logger.warn(`LLM summarization failed: ${err}`);
          }
        }
      } else if (groqProvider) {
        // No context file - generate one by analyzing repo structure
        this.logger.log(`No context file found for ${repoOwner}/${repoName}, generating from repo analysis...`);

        try {
          // Fetch repo info and file tree
          const [repoInfo, tree] = await Promise.all([
            this.github.getRepository({ owner: repoOwner, repo: repoName }),
            this.github.getTree({ owner: repoOwner, repo: repoName, sha: baseSha, recursive: true })
          ]);

          // Get key files for analysis (package.json, README, etc.)
          const keyFiles = ['package.json', 'README.md', 'readme.md', 'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml'];
          const keyFileContents: { path: string; content: string }[] = [];

          for (const keyFile of keyFiles) {
            const found = tree.tree.find((f: any) => f.path === keyFile || f.path?.endsWith(`/${keyFile}`));
            if (found && found.type === 'blob') {
              try {
                const file = await this.github.getFileContents({
                  owner: repoOwner,
                  repo: repoName,
                  path: found.path,
                  ref: baseSha
                });
                if (file.content && file.content.length < 50000) {
                  keyFileContents.push({ path: found.path, content: file.content });
                }
              } catch {
                // Skip files we can't read
              }
            }
          }

          // Build file tree summary (limit to important directories)
          const fileTree = tree.tree
            .filter((f: any) => f.type === 'blob')
            .map((f: any) => f.path)
            .slice(0, 200)
            .join('\n');

          const llmRunner = new LLMRunner({ provider: groqProvider }, this.prisma);

          const generatePrompt = `You are a technical documentation expert. Analyze this repository and generate a PROJECT_CONTEXT.md document.

## Repository Info
- Name: ${repoInfo.fullName}
- Description: ${repoInfo.description || 'No description'}
- Language: ${repoInfo.language || 'Unknown'}
- Topics: ${repoInfo.topics?.join(', ') || 'None'}

## File Structure (first 200 files)
\`\`\`
${fileTree}
\`\`\`

${keyFileContents.map(f => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 5000)}\n\`\`\``).join('\n\n')}

---

Generate a comprehensive PROJECT_CONTEXT.md that includes:
1. **Project Overview** - What the project does, its purpose
2. **Tech Stack** - Languages, frameworks, key dependencies
3. **Architecture** - High-level structure, key directories, patterns used
4. **Getting Started** - How to set up and run the project
5. **Key Concepts** - Important domain concepts or abstractions
6. **Development Guidelines** - Coding standards, testing approach

Format it as a proper markdown document. Be specific and accurate based on the files analyzed.`;

          const response = await llmRunner.run('documenter', generatePrompt, {
            budget: { maxInputTokens: 100000, maxOutputTokens: 4000, maxTotalCost: 100 },
          });

          if (response.success && response.rawContent) {
            content = response.rawContent;
            contextPath = 'PROJECT_CONTEXT.md (generated)';
            this.logger.log(`Generated context for ${repoOwner}/${repoName} (${content.length} chars)`);

            // Generate a shorter summary from the generated content
            const summaryPrompt = `Summarize this project context in 2-3 sentences:\n\n${content.slice(0, 3000)}`;
            try {
              const summaryResponse = await llmRunner.run('documenter', summaryPrompt, {
                budget: { maxInputTokens: 10000, maxOutputTokens: 500, maxTotalCost: 10 },
              });
              if (summaryResponse.success && summaryResponse.rawContent) {
                summary = summaryResponse.rawContent;
              }
            } catch {
              // Summary generation failed, use first paragraph
              summary = content.split('\n\n')[0]?.slice(0, 500) || null;
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to generate context from repo analysis: ${err}`);
        }
      }

      // Upsert RepoContext
      await this.prisma.repoContext.upsert({
        where: {
          repoOwner_repoName_baseBranch: { repoOwner, repoName, baseBranch }
        },
        create: {
          repoOwner,
          repoName,
          baseBranch,
          baseSha,
          contextPath: contextPath || 'PROJECT_CONTEXT.md',
          content,
          summary,
          isStale: false,
        },
        update: {
          baseSha,
          contextPath: contextPath || undefined,
          content,
          summary,
          isStale: false,
          updatedAt: new Date(),
        }
      });

      this.logger.log(`Context refreshed for ${repoOwner}/${repoName}: ${contextPath ? 'found' : 'no context file'}`);

      if (workflowId) {
        await this.prisma.workflowEvent.create({
          data: {
            workflowId,
            type: contextPath ? 'context.refreshed' : 'context.missing',
            payload: {
              repoOwner,
              repoName,
              baseBranch,
              contextPath,
              baseSha,
              hasContent: !!content,
              hasSummary: !!summary
            }
          }
        });
      }

      return {
        ok: true,
        repoOwner,
        repoName,
        baseBranch,
        contextPath,
        hasContent: !!content,
        hasSummary: !!summary,
        baseSha
      };

    } catch (error: any) {
      this.logger.error(`Context refresh failed for ${repoOwner}/${repoName}: ${error?.message ?? error}`);

      if (workflowId) {
        try {
          await this.prisma.workflowEvent.create({
            data: {
              workflowId,
              type: 'context.refresh_failed',
              payload: {
                repoOwner,
                repoName,
                baseBranch,
                error: error?.message ?? String(error)
              }
            }
          });
        } catch {
          // Best-effort audit trail
        }
      }

      // Mark as stale if exists
      try {
        await this.prisma.repoContext.update({
          where: {
            repoOwner_repoName_baseBranch: { repoOwner, repoName, baseBranch }
          },
          data: { isStale: true }
        });
      } catch {
        // Record doesn't exist, that's ok
      }

      throw error;
    }
  }
}
