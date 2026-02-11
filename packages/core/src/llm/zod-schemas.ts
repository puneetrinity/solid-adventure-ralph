/**
 * Zod Schemas for LLM Response Validation
 *
 * Type-safe validation with automatic parsing and retry support.
 */

import { z } from 'zod';

// ============================================================================
// Feasibility Analysis Schema
// ============================================================================

export const FeasibilityAnalysisSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters'),
  feasible: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  estimatedEffort: z.enum(['trivial', 'small', 'medium', 'large', 'epic']),
  risks: z.array(z.object({
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string().optional()
  })).default([]),
  prerequisites: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  recommendation: z.enum(['proceed', 'proceed_with_caution', 'needs_clarification', 'not_recommended'])
});

export type FeasibilityAnalysis = z.infer<typeof FeasibilityAnalysisSchema>;

// ============================================================================
// Architecture Analysis Schema
// ============================================================================

export const ArchitectureDecisionSchema = z.object({
  area: z.string(),
  decision: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.object({
    option: z.string(),
    proscons: z.string()
  })).default([]),
  tradeoffs: z.array(z.string()).default([])
});

export const ArchitectureAnalysisSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters'),
  approach: z.string(),
  components: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    dependencies: z.array(z.string()).default([])
  })).default([]),
  decisions: z.array(ArchitectureDecisionSchema).default([]),
  patterns: z.array(z.string()).default([]),
  dataFlow: z.string().optional(),
  securityConsiderations: z.array(z.string()).default([]),
  testingStrategy: z.string().optional()
});

export type ArchitectureAnalysis = z.infer<typeof ArchitectureAnalysisSchema>;

// ============================================================================
// Timeline Analysis Schema
// ============================================================================

export const TimelineTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedHours: z.number().min(0).optional(),
  dependencies: z.array(z.string()).default([]),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  skills: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

export const TimelineMilestoneSchema = z.object({
  name: z.string(),
  tasks: z.array(z.string()),
  deliverables: z.array(z.string()).default([])
});

export const TimelineAnalysisSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters'),
  tasks: z.array(TimelineTaskSchema).min(1, 'At least one task is required'),
  milestones: z.array(TimelineMilestoneSchema).default([]),
  criticalPath: z.array(z.string()).default([]),
  parallelizable: z.array(z.array(z.string())).default([]),
  totalEstimatedHours: z.number().min(0).optional()
});

export type TimelineAnalysis = z.infer<typeof TimelineAnalysisSchema>;
export type TimelineTask = z.infer<typeof TimelineTaskSchema>;

// ============================================================================
// Summary Analysis Schema
// ============================================================================

export const SummaryAnalysisSchema = z.object({
  overview: z.string().min(10, 'Overview must be at least 10 characters'),
  scope: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  recommendation: z.enum(['proceed', 'hold'])
});

export type SummaryAnalysis = z.infer<typeof SummaryAnalysisSchema>;

// ============================================================================
// Patch Generation Schema
// ============================================================================

// Maximum lines of content allowed per file to prevent full-file rewrites
const MAX_CONTENT_LINES = 200;

export const FileChangeSchema = z.object({
  path: z.string().min(1, 'File path is required'),
  action: z.enum(['create', 'modify', 'delete', 'replace']),
  // For create/modify: full file content
  content: z.string().optional(),
  // For replace action: targeted string replacement
  find: z.string().optional(),
  replace: z.string().optional(),
  // Required rationale for modify action (full-file rewrite)
  rationale: z.string().optional(),
  summary: z.string().optional()
}).refine(
  (data) => {
    // delete needs nothing
    if (data.action === 'delete') return true;
    // replace needs find and replace strings
    if (data.action === 'replace') {
      return data.find && data.find.length > 0 && data.replace !== undefined;
    }
    // create/modify need content
    return data.content && data.content.length > 0;
  },
  { message: 'Content required for create/modify; find+replace required for replace action' }
).refine(
  (data) => {
    // Enforce max lines for modify action (full-file rewrites)
    if (data.action === 'modify' && data.content) {
      const lines = data.content.split('\n').length;
      return lines <= MAX_CONTENT_LINES;
    }
    return true;
  },
  { message: `Full-file modify exceeds ${MAX_CONTENT_LINES} lines. Use 'replace' action for targeted edits instead.` }
).refine(
  (data) => {
    // Require rationale for modify action (discourages full rewrites)
    if (data.action === 'modify') {
      return data.rationale && data.rationale.length >= 10;
    }
    return true;
  },
  { message: "Modify action requires a 'rationale' field explaining why replace action cannot be used" }
);

export const PatchGenerationSchema = z.object({
  title: z.string().max(100, 'Title must be 100 characters or less'),
  summary: z.string(),
  files: z.array(FileChangeSchema).min(1, 'At least one file change is required').max(5, 'Maximum 5 files per patch')
});

export type PatchGeneration = z.infer<typeof PatchGenerationSchema>;
export type ZodFileChange = z.infer<typeof FileChangeSchema>;

// ============================================================================
// Task Decomposition Schema (for TaskList artifact)
// ============================================================================

export const TaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['feature', 'bugfix', 'refactor', 'test', 'docs', 'config']).default('feature'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  estimatedComplexity: z.enum(['trivial', 'small', 'medium', 'large']).default('medium'),
  dependencies: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([])
});

export const TaskDecompositionSchema = z.object({
  summary: z.string().min(10),
  tasks: z.array(TaskItemSchema).min(1, 'At least one task is required'),
  risks: z.array(z.object({
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    mitigation: z.string().optional()
  })).default([])
});

export type ZodTaskDecomposition = z.infer<typeof TaskDecompositionSchema>;
export type ZodTaskItem = z.infer<typeof TaskItemSchema>;

// ============================================================================
// Code Review Schema
// ============================================================================

export const ReviewIssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
  file: z.string(),
  line: z.number().optional(),
  message: z.string(),
  suggestedFix: z.string().optional()
});

export const CodeReviewSchema = z.object({
  summary: z.string().min(10),
  approved: z.boolean(),
  issues: z.array(ReviewIssueSchema).default([]),
  strengths: z.array(z.string()).default([])
});

export type ZodCodeReview = z.infer<typeof CodeReviewSchema>;

// ============================================================================
// Parsing Utilities
// ============================================================================

/**
 * Extract JSON from raw LLM output, handling markdown code blocks.
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();

  // Check for markdown code block
  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1].trim();
    }
  }

  // Find JSON object boundaries
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

/**
 * Sanitize JSON string by removing control characters.
 */
export function sanitizeJson(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

/**
 * Safe parse result type.
 */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: z.ZodIssue[] };

/**
 * Safely parse and validate LLM output against a Zod schema.
 */
export function safeParseLLMResponse<T>(
  raw: string,
  schema: z.ZodSchema<T>
): SafeParseResult<T> {
  // Extract JSON
  const jsonContent = extractJson(raw);
  if (!jsonContent) {
    return {
      success: false,
      error: 'No JSON object found in response'
    };
  }

  // Sanitize
  const sanitized = sanitizeJson(jsonContent);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitized);
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${(err as Error).message}`
    };
  }

  // Validate with Zod
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: `Validation error: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      issues: result.error.issues
    };
  }

  return { success: true, data: result.data };
}

/**
 * Format Zod errors for LLM retry prompt.
 */
export function formatZodErrorsForRetry(issues: z.ZodIssue[]): string {
  return issues.map(i => {
    const path = i.path.length > 0 ? `Field "${i.path.join('.')}"` : 'Root';
    return `- ${path}: ${i.message}`;
  }).join('\n');
}

/**
 * Build a retry prompt when validation fails.
 */
export function buildRetryPrompt<T>(
  original: string,
  parseResult: SafeParseResult<T>,
  schemaDescription: string
): string {
  const errorDetails = parseResult.success ? '' :
    parseResult.issues ?
      `Validation errors:\n${formatZodErrorsForRetry(parseResult.issues)}` :
      `Error: ${parseResult.error}`;

  return [
    'Your previous response was invalid.',
    '',
    errorDetails,
    '',
    `Please return a valid JSON object matching this schema:`,
    schemaDescription,
    '',
    'Return ONLY the JSON object. No markdown, no commentary.',
    '',
    'Your previous response:',
    '```',
    original.slice(0, 2000),
    '```'
  ].join('\n');
}

// ============================================================================
// Schema Registry
// ============================================================================

export const SCHEMAS = {
  feasibility: FeasibilityAnalysisSchema,
  architecture: ArchitectureAnalysisSchema,
  timeline: TimelineAnalysisSchema,
  summary: SummaryAnalysisSchema,
  patch: PatchGenerationSchema,
  taskDecomposition: TaskDecompositionSchema,
  codeReview: CodeReviewSchema
} as const;

export type SchemaName = keyof typeof SCHEMAS;

/**
 * Get schema by name with type inference.
 */
export function getZodSchema<K extends SchemaName>(name: K): typeof SCHEMAS[K] {
  return SCHEMAS[name];
}

// ============================================================================
// Schema Descriptions for Prompts
// ============================================================================

export const SCHEMA_DESCRIPTIONS: Record<SchemaName, string> = {
  feasibility: `{
  "summary": "Brief summary of feasibility analysis",
  "feasible": true/false,
  "confidence": "high" | "medium" | "low",
  "estimatedEffort": "trivial" | "small" | "medium" | "large" | "epic",
  "risks": [{ "description": "...", "severity": "low|medium|high|critical", "mitigation": "..." }],
  "prerequisites": ["string"],
  "blockers": ["string"],
  "recommendation": "proceed" | "proceed_with_caution" | "needs_clarification" | "not_recommended"
}`,

  architecture: `{
  "summary": "Brief summary of architecture approach",
  "approach": "Description of overall approach",
  "components": [{ "name": "...", "purpose": "...", "dependencies": ["..."] }],
  "decisions": [{ "area": "...", "decision": "...", "rationale": "...", "alternatives": [...], "tradeoffs": [...] }],
  "patterns": ["pattern names"],
  "securityConsiderations": ["..."],
  "testingStrategy": "..."
}`,

  timeline: `{
  "summary": "Brief summary of timeline",
  "tasks": [{
    "id": "T001",
    "title": "Task title",
    "description": "Task description",
    "estimatedHours": 4,
    "dependencies": ["T000"],
    "priority": "high" | "medium" | "low" | "critical",
    "skills": ["skill"],
    "risks": ["risk"]
  }],
  "milestones": [{ "name": "...", "tasks": ["T001"], "deliverables": ["..."] }],
  "criticalPath": ["T001", "T002"],
  "parallelizable": [["T003", "T004"]]
}`,

  summary: `{
  "overview": "High-level summary before patch generation",
  "scope": ["file/area to change", "..."],
  "risks": ["risk 1", "risk 2"],
  "tests": ["test plan item", "..."],
  "dependencies": ["dependency or external service", "..."],
  "pros": ["benefit 1", "..."],
  "cons": ["drawback 1", "..."],
  "links": ["https://...", "..."],
  "recommendation": "proceed" | "hold"
}`,

  patch: `{
  "title": "Short title for the change (max 100 chars)",
  "summary": "Brief description of what this change does",
  "files": [{
    "path": "relative/path/to/file.ts",
    "action": "replace" | "create" | "modify" | "delete",

    // For "replace" action (PREFERRED for existing files):
    "find": "exact string to find (must match exactly once)",
    "replace": "string to replace it with",

    // For "create" action (new files only):
    "content": "complete file content",

    // For "modify" action (DISCOURAGED - use replace instead):
    "content": "complete new file content (max 200 lines)",
    "rationale": "Why replace action cannot be used (required)"

    // For "delete" action: no additional fields needed
  }]
}

IMPORTANT:
- Use "replace" action for existing files (safer, surgical edits)
- The "find" string must match EXACTLY ONCE in the file
- Only use "modify" when replacing large sections (>50% of file)
- Maximum 5 files per patch`,

  taskDecomposition: `{
  "summary": "Brief summary of task breakdown",
  "tasks": [{
    "id": "T001",
    "title": "Task title",
    "description": "What needs to be done",
    "type": "feature" | "bugfix" | "refactor" | "test" | "docs" | "config",
    "priority": "critical" | "high" | "medium" | "low",
    "estimatedComplexity": "trivial" | "small" | "medium" | "large",
    "dependencies": ["T000"],
    "files": ["path/to/file.ts"],
    "acceptanceCriteria": ["Criterion 1"]
  }],
  "risks": [{ "description": "...", "severity": "low|medium|high", "mitigation": "..." }]
}`,

  codeReview: `{
  "summary": "Brief summary of code review",
  "approved": true/false,
  "issues": [{
    "severity": "critical" | "major" | "minor" | "suggestion",
    "file": "path/to/file.ts",
    "line": 42,
    "message": "Issue description",
    "suggestedFix": "How to fix"
  }],
  "strengths": ["What's good about this code"]
}`
};
