/**
 * Patch Applicator
 *
 * Applies patches from a PatchSet to a GitHub repository.
 * This service is responsible for:
 * 1. Creating a branch from base SHA
 * 2. Applying diffs by updating files via GitHub API
 * 3. Committing changes per patch
 * 4. Opening a PR
 * 5. Recording the PR in the database
 *
 * All write operations go through WriteGate to enforce approval requirements.
 */

import type { PrismaClient } from '@prisma/client';
import { WriteGate } from '../policy/write-gate';
import { parseDiff, type DiffFile } from '../policy/diff-parser';
import { validateDiffContext } from './diff-generator';

// ============================================================================
// Types
// ============================================================================

export interface PatchData {
  id: string;
  title: string;
  summary: string;
  diff: string;
  files: Array<{ path: string; additions: number; deletions: number }>;
}

export interface PatchSetData {
  id: string;
  title: string;
  baseSha: string;
  patches: PatchData[];
}

export interface ApplyPatchesInput {
  workflowId: string;
  patchSetId: string;
  owner: string;
  repo: string;
  baseBranch: string;
}

export interface ApplyPatchesToBranchInput extends ApplyPatchesInput {
  branchName?: string;
}

export interface ApplyPatchesResult {
  success: boolean;
  branchName: string;
  prNumber?: number;
  prUrl?: string;
  commitShas: string[];
  error?: string;
}

export interface FileChange {
  path: string;
  content: string; // new file content (decoded)
  isNew: boolean;
  isDeleted: boolean;
  originalSha?: string;
}

// ============================================================================
// Diff Application Logic
// ============================================================================

export interface ApplyDiffResult {
  success: boolean;
  content?: string;
  error?: string;
  validationErrors?: string[];
}

/**
 * Validate and apply a unified diff to existing content.
 * Validates context lines match before applying.
 * Returns error details if validation fails.
 */
export function validateAndApplyDiff(
  originalContent: string,
  diff: string,
  options?: { skipValidation?: boolean }
): ApplyDiffResult {
  if (!diff.trim()) {
    return { success: true, content: originalContent };
  }

  // Validate context lines match unless explicitly skipped
  if (!options?.skipValidation) {
    const validation = validateDiffContext(originalContent, diff);
    if (!validation.valid) {
      return {
        success: false,
        error: `Diff validation failed: context lines do not match current file content`,
        validationErrors: validation.errors
      };
    }
  }

  // Apply the diff
  try {
    const result = applyDiffToContent(originalContent, diff);
    return { success: true, content: result };
  } catch (err) {
    return {
      success: false,
      error: `Failed to apply diff: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Apply a unified diff to existing content.
 * Processes hunks sequentially, tracking line position in original file.
 * NOTE: Use validateAndApplyDiff() for safer application with validation.
 */
export function applyDiffToContent(originalContent: string, diff: string): string {
  if (!diff.trim()) {
    return originalContent;
  }

  const originalLines = originalContent.split('\n');
  const diffLines = diff.split('\n');
  const resultLines: string[] = [];

  let originalIdx = 0; // Current position in original file (0-indexed)

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    // Look for hunk header: @@ -start,count +start,count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1], 10); // 1-indexed

      // Copy unchanged lines before this hunk
      while (originalIdx < oldStart - 1) {
        resultLines.push(originalLines[originalIdx]);
        originalIdx++;
      }

      // Process hunk content
      i++; // Move past hunk header
      while (i < diffLines.length) {
        const hunkLine = diffLines[i];

        // Stop at next hunk or file boundary
        if (hunkLine.startsWith('@@') || hunkLine.startsWith('diff --git')) {
          i--; // Back up so outer loop sees it
          break;
        }

        if (hunkLine.startsWith(' ')) {
          // Context line - copy from original
          resultLines.push(hunkLine.slice(1));
          originalIdx++;
        } else if (hunkLine.startsWith('-') && !hunkLine.startsWith('---')) {
          // Deleted line - skip in original
          originalIdx++;
        } else if (hunkLine.startsWith('+') && !hunkLine.startsWith('+++')) {
          // Added line - add to result
          resultLines.push(hunkLine.slice(1));
        } else if (hunkLine.startsWith('\\')) {
          // "\ No newline at end of file" - skip
        }

        i++;
      }
    }
  }

  // Copy remaining unchanged lines
  while (originalIdx < originalLines.length) {
    resultLines.push(originalLines[originalIdx]);
    originalIdx++;
  }

  return resultLines.join('\n');
}

/**
 * Extract file changes from a diff.
 * Returns the list of files and whether they are new, modified, or deleted.
 */
export function extractFileChangesFromDiff(diff: string): Array<{
  path: string;
  isNew: boolean;
  isDeleted: boolean;
  diffContent: string;
}> {
  const files: Array<{
    path: string;
    isNew: boolean;
    isDeleted: boolean;
    diffContent: string;
  }> = [];

  const parsed = parseDiff(diff);

  // Split diff by file
  const diffLines = diff.split('\n');
  let currentFileStart = -1;
  let currentFilePath = '';
  let currentIsNew = false;
  let currentIsDeleted = false;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];

    if (line.startsWith('diff --git')) {
      // Save previous file if any
      if (currentFilePath && currentFileStart >= 0) {
        files.push({
          path: currentFilePath,
          isNew: currentIsNew,
          isDeleted: currentIsDeleted,
          diffContent: diffLines.slice(currentFileStart, i).join('\n')
        });
      }

      // Start new file
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        currentFilePath = match[2];
        currentFileStart = i;
        currentIsNew = false;
        currentIsDeleted = false;
      }
    } else if (line.startsWith('new file mode')) {
      currentIsNew = true;
    } else if (line.startsWith('deleted file mode')) {
      currentIsDeleted = true;
    }
  }

  // Don't forget the last file
  if (currentFilePath && currentFileStart >= 0) {
    files.push({
      path: currentFilePath,
      isNew: currentIsNew,
      isDeleted: currentIsDeleted,
      diffContent: diffLines.slice(currentFileStart).join('\n')
    });
  }

  return files;
}

// ============================================================================
// Patch Applicator Service
// ============================================================================

export class PatchApplicator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly writeGate: WriteGate
  ) {}

  /**
   * Apply a PatchSet to a repository, creating a branch and PR.
   */
  async applyPatches(input: ApplyPatchesInput): Promise<ApplyPatchesResult> {
    const { workflowId, patchSetId, owner, repo, baseBranch } = input;

    // Load the patch set with patches
    const patchSet = await this.prisma.patchSet.findUnique({
      where: { id: patchSetId },
      include: { patches: { orderBy: { createdAt: 'asc' } } }
    });

    if (!patchSet) {
      return {
        success: false,
        branchName: '',
        commitShas: [],
        error: `PatchSet ${patchSetId} not found`
      };
    }

    // Generate branch name
    const branchName = this.generateBranchName(workflowId, patchSetId);
    const commitShas: string[] = [];

    try {
      // T5.2.1: Create branch from base SHA
      await this.writeGate.createBranch(workflowId, {
        owner,
        repo,
        branch: branchName,
        sha: patchSet.baseSha
      });

      // T5.2.2 & T5.2.3: Apply diffs and commit per patch
      for (const patch of patchSet.patches) {
        const fileChanges = extractFileChangesFromDiff(patch.diff);

        for (const change of fileChanges) {
          if (change.isDeleted) {
            // Delete file - get current SHA first
            try {
              const currentFile = await this.writeGate.getFileContents(
                owner,
                repo,
                change.path,
                branchName
              );
              const result = await this.writeGate.deleteFile(workflowId, {
                owner,
                repo,
                path: change.path,
                message: `Delete ${change.path}\n\n${patch.title}`,
                sha: currentFile.sha,
                branch: branchName
              });
              if (result.commitSha && !commitShas.includes(result.commitSha)) {
                commitShas.push(result.commitSha);
              }
            } catch (err) {
              // File might not exist, skip
            }
            continue;
          }

          let newContent: string;
          let fileSha: string | undefined;

          if (change.isNew) {
            // New file - extract content from diff
            newContent = this.extractNewFileContent(change.diffContent);
          } else {
            // Modified file - get current content and apply diff with validation
            try {
              const currentFile = await this.writeGate.getFileContents(
                owner,
                repo,
                change.path,
                branchName
              );

              // Validate and apply diff
              const applyResult = validateAndApplyDiff(currentFile.content, change.diffContent);
              if (!applyResult.success) {
                // Validation failed - return early with error
                return {
                  success: false,
                  branchName,
                  commitShas,
                  error: `Failed to apply diff to ${change.path}: ${applyResult.error}${
                    applyResult.validationErrors
                      ? `\nValidation errors:\n${applyResult.validationErrors.join('\n')}`
                      : ''
                  }`
                };
              }

              newContent = applyResult.content!;
              fileSha = currentFile.sha;
            } catch (err) {
              // File might not exist yet on branch, treat as new
              newContent = this.extractNewFileContent(change.diffContent);
            }
          }

          // Update/create file
          const result = await this.writeGate.updateFile(workflowId, {
            owner,
            repo,
            path: change.path,
            message: `${patch.title}\n\n${patch.summary}`,
            content: Buffer.from(newContent).toString('base64'),
            sha: fileSha,
            branch: branchName
          });

          if (result.commitSha && !commitShas.includes(result.commitSha)) {
            commitShas.push(result.commitSha);
          }
        }
      }

      // T5.2.4: Branch is already pushed via GitHub API operations above

      // T5.2.5: Open PR
      const pr = await this.writeGate.openPullRequest(workflowId, {
        owner,
        repo,
        head: branchName,
        base: baseBranch,
        title: patchSet.title,
        body: this.generatePRBody(patchSet, workflowId)
      });

      // T5.2.6: Record PR in database
      await this.prisma.pullRequest.create({
        data: {
          workflowId,
          number: pr.number,
          url: pr.url,
          branch: branchName,
          status: 'open'
        }
      });

      // Update PatchSet status
      await this.prisma.patchSet.update({
        where: { id: patchSetId },
        data: { status: 'applied' }
      });

      return {
        success: true,
        branchName,
        prNumber: pr.number,
        prUrl: pr.url,
        commitShas
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        branchName,
        commitShas,
        error: errorMsg
      };
    }
  }

  /**
   * Apply a PatchSet to a repository branch without opening a PR.
   * Used for sandbox validation runs.
   */
  async applyPatchesToBranch(input: ApplyPatchesToBranchInput): Promise<ApplyPatchesResult> {
    const { workflowId, patchSetId, owner, repo } = input;

    const patchSet = await this.prisma.patchSet.findUnique({
      where: { id: patchSetId },
      include: { patches: { orderBy: { createdAt: 'asc' } } }
    });

    if (!patchSet) {
      return {
        success: false,
        branchName: '',
        commitShas: [],
        error: `PatchSet ${patchSetId} not found`
      };
    }

    const branchName = input.branchName ?? this.generateBranchName(workflowId, patchSetId);
    const commitShas: string[] = [];

    try {
      await this.writeGate.createBranch(workflowId, {
        owner,
        repo,
        branch: branchName,
        sha: patchSet.baseSha
      });

      for (const patch of patchSet.patches) {
        const fileChanges = extractFileChangesFromDiff(patch.diff);

        for (const change of fileChanges) {
          if (change.isDeleted) {
            try {
              const currentFile = await this.writeGate.getFileContents(
                owner,
                repo,
                change.path,
                branchName
              );
              const result = await this.writeGate.deleteFile(workflowId, {
                owner,
                repo,
                path: change.path,
                message: `Delete ${change.path}\n\n${patch.title}`,
                sha: currentFile.sha,
                branch: branchName
              });
              if (result.commitSha && !commitShas.includes(result.commitSha)) {
                commitShas.push(result.commitSha);
              }
            } catch (err) {
              // File might not exist, skip
            }
            continue;
          }

          let newContent: string;
          let fileSha: string | undefined;

          if (change.isNew) {
            newContent = this.extractNewFileContent(change.diffContent);
          } else {
            try {
              const currentFile = await this.writeGate.getFileContents(
                owner,
                repo,
                change.path,
                branchName
              );

              // Validate and apply diff
              const applyResult = validateAndApplyDiff(currentFile.content, change.diffContent);
              if (!applyResult.success) {
                // Validation failed - return early with error
                return {
                  success: false,
                  branchName,
                  commitShas,
                  error: `Failed to apply diff to ${change.path}: ${applyResult.error}${
                    applyResult.validationErrors
                      ? `\nValidation errors:\n${applyResult.validationErrors.join('\n')}`
                      : ''
                  }`
                };
              }

              newContent = applyResult.content!;
              fileSha = currentFile.sha;
            } catch (err) {
              newContent = this.extractNewFileContent(change.diffContent);
            }
          }

          const result = await this.writeGate.updateFile(workflowId, {
            owner,
            repo,
            path: change.path,
            message: `${patch.title}\n\n${patch.summary}`,
            content: Buffer.from(newContent).toString('base64'),
            sha: fileSha,
            branch: branchName
          });

          if (result.commitSha && !commitShas.includes(result.commitSha)) {
            commitShas.push(result.commitSha);
          }
        }
      }

      return {
        success: true,
        branchName,
        commitShas
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        branchName,
        commitShas,
        error: errorMsg
      };
    }
  }

  /**
   * Generate a branch name for a workflow/patchset.
   */
  private generateBranchName(workflowId: string, patchSetId: string): string {
    const shortWorkflowId = workflowId.slice(0, 8);
    const shortPatchSetId = patchSetId.slice(0, 8);
    const timestamp = Date.now();
    return `arch-orchestrator/${shortWorkflowId}/${shortPatchSetId}-${timestamp}`;
  }

  /**
   * Generate PR body with context about the workflow.
   */
  private generatePRBody(
    patchSet: { title: string; patches: Array<{ title: string; summary: string }> },
    workflowId: string
  ): string {
    const lines = [
      '## Summary',
      '',
      `This PR was created by arch-orchestrator workflow \`${workflowId}\`.`,
      '',
      '## Patches Applied',
      ''
    ];

    for (const patch of patchSet.patches) {
      lines.push(`### ${patch.title}`);
      lines.push('');
      lines.push(patch.summary);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('*Generated by arch-orchestrator*');

    return lines.join('\n');
  }

  /**
   * Extract the content of a new file from its diff.
   */
  private extractNewFileContent(diffContent: string): string {
    const lines = diffContent.split('\n');
    const contentLines: string[] = [];
    let inContent = false;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inContent = true;
        continue;
      }
      if (inContent) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          contentLines.push(line.slice(1));
        } else if (line.startsWith('\\')) {
          // "\ No newline at end of file" - skip
        }
      }
    }

    return contentLines.join('\n');
  }
}
