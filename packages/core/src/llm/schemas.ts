/**
 * Output Schemas
 *
 * Strict JSON schemas for LLM outputs with validation.
 */

import type { OutputSchema, ValidationResult, ValidationError, JSONSchema } from './types';

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Validate data against a JSON schema.
 */
export function validateSchema<T>(
  data: unknown,
  schema: JSONSchema,
  path = ''
): ValidationResult<T> {
  const errors: ValidationError[] = [];

  if (data === null || data === undefined) {
    errors.push({
      path: path || 'root',
      message: 'Value is null or undefined',
      expected: schema.type,
      received: 'null/undefined'
    });
    return { valid: false, errors };
  }

  // Type checking
  const actualType = Array.isArray(data) ? 'array' : typeof data;
  if (schema.type !== actualType) {
    errors.push({
      path: path || 'root',
      message: `Expected ${schema.type}, got ${actualType}`,
      expected: schema.type,
      received: actualType
    });
    return { valid: false, errors };
  }

  // Object validation
  if (schema.type === 'object' && schema.properties) {
    const obj = data as Record<string, unknown>;

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push({
            path: path ? `${path}.${field}` : field,
            message: `Required field missing: ${field}`,
            expected: 'defined',
            received: 'undefined'
          });
        }
      }
    }

    // Validate each property
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        const result = validateSchema(
          obj[key],
          propSchema,
          path ? `${path}.${key}` : key
        );
        if (!result.valid && result.errors) {
          errors.push(...result.errors);
        }
      }
    }
  }

  // Array validation
  if (schema.type === 'array' && schema.items) {
    const arr = data as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const result = validateSchema(
        arr[i],
        schema.items,
        `${path}[${i}]`
      );
      if (!result.valid && result.errors) {
        errors.push(...result.errors);
      }
    }
  }

  // String validation
  if (schema.type === 'string') {
    const str = data as string;
    if (schema.minLength !== undefined && str.length < schema.minLength) {
      errors.push({
        path,
        message: `String too short: min ${schema.minLength}, got ${str.length}`,
        expected: `>= ${schema.minLength} chars`,
        received: `${str.length} chars`
      });
    }
    if (schema.maxLength !== undefined && str.length > schema.maxLength) {
      errors.push({
        path,
        message: `String too long: max ${schema.maxLength}, got ${str.length}`,
        expected: `<= ${schema.maxLength} chars`,
        received: `${str.length} chars`
      });
    }
    if (schema.enum && !schema.enum.includes(str)) {
      errors.push({
        path,
        message: `Value not in enum: ${str}`,
        expected: schema.enum.join(' | '),
        received: str
      });
    }
  }

  // Number validation
  if (schema.type === 'number') {
    const num = data as number;
    if (schema.minimum !== undefined && num < schema.minimum) {
      errors.push({
        path,
        message: `Number too small: min ${schema.minimum}, got ${num}`,
        expected: `>= ${schema.minimum}`,
        received: `${num}`
      });
    }
    if (schema.maximum !== undefined && num > schema.maximum) {
      errors.push({
        path,
        message: `Number too large: max ${schema.maximum}, got ${num}`,
        expected: `<= ${schema.maximum}`,
        received: `${num}`
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: data as T };
}

/**
 * Parse JSON from raw LLM output, handling markdown code blocks.
 */
export function parseJSON<T>(rawContent: string): T | null {
  // Try direct parse first
  try {
    return JSON.parse(rawContent) as T;
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ============================================================================
// Pre-defined Output Schemas
// ============================================================================

/**
 * Task decomposition schema for architect role.
 */
export interface TaskDecomposition {
  summary: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    dependencies: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
  }>;
  risks: Array<{
    description: string;
    mitigation: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export const taskDecompositionSchema: OutputSchema<TaskDecomposition> = {
  name: 'task_decomposition',
  version: 'v1',
  description: 'Structured task breakdown from architect role',
  schema: {
    type: 'object',
    required: ['summary', 'tasks'],
    properties: {
      summary: { type: 'string', minLength: 10 },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'title', 'description'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } },
            estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] }
          }
        }
      },
      risks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['description', 'severity'],
          properties: {
            description: { type: 'string' },
            mitigation: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] }
          }
        }
      }
    }
  },
  validate: (data: unknown) => validateSchema<TaskDecomposition>(data, taskDecompositionSchema.schema),
  parse: (rawContent: string) => parseJSON<TaskDecomposition>(rawContent)
};

/**
 * Code generation schema for coder role.
 */
export interface CodeGeneration {
  files: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    diff?: string;
  }>;
  explanation: string;
  testSuggestions?: string[];
}

export const codeGenerationSchema: OutputSchema<CodeGeneration> = {
  name: 'code_generation',
  version: 'v1',
  description: 'Code generation output from coder role',
  schema: {
    type: 'object',
    required: ['files', 'explanation'],
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'content', 'action'],
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            action: { type: 'string', enum: ['create', 'modify', 'delete'] },
            diff: { type: 'string' }
          }
        }
      },
      explanation: { type: 'string', minLength: 10 },
      testSuggestions: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  validate: (data: unknown) => validateSchema<CodeGeneration>(data, codeGenerationSchema.schema),
  parse: (rawContent: string) => parseJSON<CodeGeneration>(rawContent)
};

/**
 * Code review schema for reviewer role.
 */
export interface CodeReview {
  summary: string;
  approved: boolean;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    file: string;
    line?: number;
    message: string;
    suggestedFix?: string;
  }>;
  strengths?: string[];
}

export const codeReviewSchema: OutputSchema<CodeReview> = {
  name: 'code_review',
  version: 'v1',
  description: 'Code review output from reviewer role',
  schema: {
    type: 'object',
    required: ['summary', 'approved', 'issues'],
    properties: {
      summary: { type: 'string', minLength: 10 },
      approved: { type: 'boolean' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['severity', 'file', 'message'],
          properties: {
            severity: { type: 'string', enum: ['critical', 'major', 'minor', 'suggestion'] },
            file: { type: 'string' },
            line: { type: 'number' },
            message: { type: 'string' },
            suggestedFix: { type: 'string' }
          }
        }
      },
      strengths: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  validate: (data: unknown) => validateSchema<CodeReview>(data, codeReviewSchema.schema),
  parse: (rawContent: string) => parseJSON<CodeReview>(rawContent)
};

/**
 * Diagnosis schema for diagnoser role.
 */
export interface Diagnosis {
  summary: string;
  rootCause: {
    description: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
  };
  suggestedFixes: Array<{
    description: string;
    priority: number;
    effort: 'trivial' | 'small' | 'medium' | 'large';
  }>;
  relatedIssues?: string[];
}

export const diagnosisSchema: OutputSchema<Diagnosis> = {
  name: 'diagnosis',
  version: 'v1',
  description: 'Error diagnosis output from diagnoser role',
  schema: {
    type: 'object',
    required: ['summary', 'rootCause', 'suggestedFixes'],
    properties: {
      summary: { type: 'string', minLength: 10 },
      rootCause: {
        type: 'object',
        required: ['description', 'confidence', 'evidence'],
        properties: {
          description: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'array', items: { type: 'string' } }
        }
      },
      suggestedFixes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['description', 'priority', 'effort'],
          properties: {
            description: { type: 'string' },
            priority: { type: 'number', minimum: 1, maximum: 10 },
            effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] }
          }
        }
      },
      relatedIssues: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  },
  validate: (data: unknown) => validateSchema<Diagnosis>(data, diagnosisSchema.schema),
  parse: (rawContent: string) => parseJSON<Diagnosis>(rawContent)
};

// ============================================================================
// Schema Registry
// ============================================================================

const schemaRegistry = new Map<string, OutputSchema<unknown>>();

// Register built-in schemas
schemaRegistry.set('task_decomposition', taskDecompositionSchema);
schemaRegistry.set('code_generation', codeGenerationSchema);
schemaRegistry.set('code_review', codeReviewSchema);
schemaRegistry.set('diagnosis', diagnosisSchema);

/**
 * Get a schema by name.
 */
export function getSchema<T>(name: string): OutputSchema<T> | undefined {
  return schemaRegistry.get(name) as OutputSchema<T> | undefined;
}

/**
 * Register a custom schema.
 */
export function registerSchema<T>(schema: OutputSchema<T>): void {
  schemaRegistry.set(schema.name, schema as OutputSchema<unknown>);
}

/**
 * List all registered schemas.
 */
export function listSchemas(): string[] {
  return Array.from(schemaRegistry.keys());
}
