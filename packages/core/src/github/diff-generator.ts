/**
 * Diff Generator
 *
 * Generates proper unified diffs with context lines and minimal hunks.
 * Uses the 'diff' library for accurate diff generation.
 */

import { createTwoFilesPatch, structuredPatch, type Hunk } from 'diff';

export interface DiffOptions {
  contextLines?: number; // Number of context lines (default: 3)
}

export interface GeneratedDiff {
  patch: string;
  additions: number;
  deletions: number;
  hunks: number;
}

/**
 * Generate a unified diff between old and new content.
 * Produces minimal hunks with context lines for better reviewability.
 */
export function generateUnifiedDiff(
  path: string,
  oldContent: string,
  newContent: string,
  action: 'create' | 'modify' | 'delete',
  options: DiffOptions = {}
): GeneratedDiff {
  const contextLines = options.contextLines ?? 3;

  if (action === 'create') {
    return generateCreateDiff(path, newContent, contextLines);
  }

  if (action === 'delete') {
    return generateDeleteDiff(path, oldContent, contextLines);
  }

  // Modify action - use structuredPatch for better control
  const structured = structuredPatch(
    `a/${path}`,
    `b/${path}`,
    oldContent,
    newContent,
    '',
    '',
    { context: contextLines }
  );

  // Calculate additions and deletions from hunks
  let additions = 0;
  let deletions = 0;
  for (const hunk of structured.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  // Build the patch string
  const patch = createTwoFilesPatch(
    `a/${path}`,
    `b/${path}`,
    oldContent,
    newContent,
    '',
    '',
    { context: contextLines }
  );

  // Add git diff header for compatibility
  const gitPatch = `diff --git a/${path} b/${path}\n${patch}`;

  return {
    patch: gitPatch,
    additions,
    deletions,
    hunks: structured.hunks.length
  };
}

/**
 * Generate a diff for a new file creation.
 */
function generateCreateDiff(path: string, content: string, contextLines: number): GeneratedDiff {
  const lines = content.split('\n');
  const additions = lines.length;

  const diffLines = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${additions} @@`
  ];

  for (const line of lines) {
    diffLines.push(`+${line}`);
  }

  return {
    patch: diffLines.join('\n'),
    additions,
    deletions: 0,
    hunks: 1
  };
}

/**
 * Generate a diff for file deletion.
 */
function generateDeleteDiff(path: string, content: string, contextLines: number): GeneratedDiff {
  const lines = content.split('\n');
  const deletions = lines.length;

  const diffLines = [
    `diff --git a/${path} b/${path}`,
    'deleted file mode 100644',
    'index 1111111..0000000',
    `--- a/${path}`,
    '+++ /dev/null',
    `@@ -1,${deletions} +0,0 @@`
  ];

  for (const line of lines) {
    diffLines.push(`-${line}`);
  }

  return {
    patch: diffLines.join('\n'),
    additions: 0,
    deletions,
    hunks: 1
  };
}

/**
 * Apply a str_replace operation and generate the resulting diff.
 * Returns null if the find string doesn't match exactly once.
 */
export function generateReplaceActionDiff(
  path: string,
  originalContent: string,
  find: string,
  replace: string,
  options: DiffOptions = {}
): { diff: GeneratedDiff; newContent: string } | { error: string } {
  // Count occurrences of the find string
  const occurrences = countOccurrences(originalContent, find);

  if (occurrences === 0) {
    return { error: `Find string not found in file '${path}'. The exact text does not exist.` };
  }

  if (occurrences > 1) {
    return {
      error: `Find string matches ${occurrences} times in file '${path}'. Must match exactly once for safe replacement. Add more context to make the match unique.`
    };
  }

  // Perform the replacement
  const newContent = originalContent.replace(find, replace);

  // Generate the diff
  const diff = generateUnifiedDiff(path, originalContent, newContent, 'modify', options);

  return { diff, newContent };
}

/**
 * Count occurrences of a substring in a string.
 */
function countOccurrences(str: string, substr: string): number {
  if (!substr) return 0;

  let count = 0;
  let pos = 0;

  while ((pos = str.indexOf(substr, pos)) !== -1) {
    count++;
    pos += substr.length;
  }

  return count;
}

/**
 * Validate a diff can be applied to the given content.
 * Checks that context lines in hunks match the original content.
 */
export interface DiffValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDiffContext(
  originalContent: string,
  diffContent: string
): DiffValidationResult {
  const errors: string[] = [];
  const originalLines = originalContent.split('\n');
  const diffLines = diffContent.split('\n');

  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];

    // Find hunk headers
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1], 10) - 1; // Convert to 0-indexed
      let originalIdx = oldStart;

      i++; // Move past hunk header

      // Process hunk content
      while (i < diffLines.length && !diffLines[i].startsWith('@@') && !diffLines[i].startsWith('diff --git')) {
        const hunkLine = diffLines[i];

        if (hunkLine.startsWith(' ')) {
          // Context line - must match original
          const expectedLine = hunkLine.slice(1);
          const actualLine = originalLines[originalIdx];

          if (actualLine !== expectedLine) {
            errors.push(
              `Context mismatch at line ${originalIdx + 1}: expected "${expectedLine.substring(0, 50)}..." but found "${(actualLine || '').substring(0, 50)}..."`
            );
          }
          originalIdx++;
        } else if (hunkLine.startsWith('-') && !hunkLine.startsWith('---')) {
          // Deleted line - must match original
          const expectedLine = hunkLine.slice(1);
          const actualLine = originalLines[originalIdx];

          if (actualLine !== expectedLine) {
            errors.push(
              `Deletion mismatch at line ${originalIdx + 1}: expected "${expectedLine.substring(0, 50)}..." but found "${(actualLine || '').substring(0, 50)}..."`
            );
          }
          originalIdx++;
        }
        // Added lines (+) don't advance the original index

        i++;
      }
      continue; // Don't increment i again
    }

    i++;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
