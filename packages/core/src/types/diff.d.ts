declare module 'diff' {
  export interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }

  export interface ParsedDiff {
    oldFileName?: string;
    newFileName?: string;
    oldHeader?: string;
    newHeader?: string;
    hunks: Hunk[];
  }

  export interface PatchOptions {
    context?: number;
  }

  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions
  ): string;

  export function structuredPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions
  ): ParsedDiff;

  export function applyPatch(
    source: string,
    patch: string | ParsedDiff,
    options?: { fuzzFactor?: number }
  ): string | false;

  export function parsePatch(diffStr: string): ParsedDiff[];
}
