/**
 * Parses unified diff format and extracts touched file paths.
 * Supports both standard unified diff and git diff formats.
 */
export interface DiffFile {
    path: string;
    oldPath?: string;
    additions: number;
    deletions: number;
    isNew: boolean;
    isDeleted: boolean;
    isRename: boolean;
}
export interface ParsedDiff {
    files: DiffFile[];
}
/**
 * Parse a unified diff string and extract file information.
 */
export declare function parseDiff(diff: string): ParsedDiff;
/**
 * Extract just the file paths from a diff.
 */
export declare function extractTouchedFiles(diff: string): string[];
