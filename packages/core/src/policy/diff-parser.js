"use strict";
/**
 * Parses unified diff format and extracts touched file paths.
 * Supports both standard unified diff and git diff formats.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDiff = parseDiff;
exports.extractTouchedFiles = extractTouchedFiles;
/**
 * Parse a unified diff string and extract file information.
 */
function parseDiff(diff) {
    const files = [];
    const lines = diff.split('\n');
    let currentFile = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Git diff header: diff --git a/path b/path
        const gitDiffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (gitDiffMatch) {
            if (currentFile && currentFile.path) {
                files.push(finalizeFile(currentFile));
            }
            currentFile = {
                path: gitDiffMatch[2],
                oldPath: gitDiffMatch[1] !== gitDiffMatch[2] ? gitDiffMatch[1] : undefined,
                additions: 0,
                deletions: 0,
                isNew: false,
                isDeleted: false,
                isRename: gitDiffMatch[1] !== gitDiffMatch[2]
            };
            continue;
        }
        // Standard unified diff header: --- a/path or +++ b/path
        const minusMatch = line.match(/^--- (?:a\/)?(.+)$/);
        const plusMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
        if (minusMatch) {
            if (!currentFile) {
                currentFile = {
                    path: '',
                    additions: 0,
                    deletions: 0,
                    isNew: false,
                    isDeleted: false,
                    isRename: false
                };
            }
            if (minusMatch[1] === '/dev/null') {
                currentFile.isNew = true;
            }
            else if (!currentFile.oldPath && !currentFile.path) {
                // Only set oldPath if no path is set yet (from git header)
                // This is a non-git diff where we get path from --- line
                currentFile.oldPath = minusMatch[1];
            }
            continue;
        }
        if (plusMatch && currentFile) {
            if (plusMatch[1] === '/dev/null') {
                currentFile.isDeleted = true;
                // For deleted files, use the path from git header or oldPath
                if (!currentFile.path && currentFile.oldPath) {
                    currentFile.path = currentFile.oldPath;
                }
            }
            else {
                // Only override path if not already set by git header
                if (!currentFile.path) {
                    currentFile.path = plusMatch[1];
                }
                if (currentFile.oldPath && currentFile.oldPath !== currentFile.path) {
                    currentFile.isRename = true;
                }
            }
            continue;
        }
        // New file mode indicator
        if (line.startsWith('new file mode') && currentFile) {
            currentFile.isNew = true;
            continue;
        }
        // Deleted file mode indicator
        if (line.startsWith('deleted file mode') && currentFile) {
            currentFile.isDeleted = true;
            continue;
        }
        // Count additions and deletions in diff hunks
        if (currentFile) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                currentFile.additions = (currentFile.additions || 0) + 1;
            }
            else if (line.startsWith('-') && !line.startsWith('---')) {
                currentFile.deletions = (currentFile.deletions || 0) + 1;
            }
        }
    }
    // Don't forget the last file
    if (currentFile && currentFile.path) {
        files.push(finalizeFile(currentFile));
    }
    return { files };
}
function finalizeFile(partial) {
    return {
        path: partial.path || '',
        oldPath: partial.oldPath,
        additions: partial.additions || 0,
        deletions: partial.deletions || 0,
        isNew: partial.isNew || false,
        isDeleted: partial.isDeleted || false,
        isRename: partial.isRename || false
    };
}
/**
 * Extract just the file paths from a diff.
 */
function extractTouchedFiles(diff) {
    const parsed = parseDiff(diff);
    const paths = new Set();
    for (const file of parsed.files) {
        paths.add(file.path);
        if (file.oldPath) {
            paths.add(file.oldPath);
        }
    }
    return Array.from(paths);
}
//# sourceMappingURL=diff-parser.js.map