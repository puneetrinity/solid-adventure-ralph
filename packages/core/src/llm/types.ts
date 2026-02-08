/**
 * LLM Types
 *
 * Core types for the LLM Runner Layer.
 */

// ============================================================================
// Role Types
// ============================================================================

/**
 * Agent roles define specialized LLM behaviors.
 */
export type AgentRole =
  | 'architect'    // High-level design, task decomposition
  | 'coder'        // Code generation, implementation
  | 'reviewer'     // Code review, quality assessment
  | 'tester'       // Test generation, verification
  | 'diagnoser'    // Error analysis, debugging
  | 'documenter';  // Documentation generation

/**
 * Role configuration including system prompt and constraints.
 */
export interface RoleConfig {
  role: AgentRole;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  constraints: string[];
}

// ============================================================================
// Input/Output Types
// ============================================================================

/**
 * Input to an LLM call.
 */
export interface LLMInput {
  role: AgentRole;
  promptVersion: string;
  messages: LLMMessage[];
  context?: LLMContext;
  budget?: TokenBudget;
}

/**
 * Individual message in conversation.
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Context data for LLM call.
 */
export interface LLMContext {
  workflowId?: string;
  taskId?: string;
  files?: FileContext[];
  artifacts?: ArtifactContext[];
}

/**
 * File context for code-related tasks.
 */
export interface FileContext {
  path: string;
  content: string;
  language?: string;
}

/**
 * Artifact context from workflow.
 */
export interface ArtifactContext {
  kind: string;
  content: string;
}

/**
 * Token budget for cost control.
 */
export interface TokenBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalCost: number; // in cents
}

/**
 * LLM response.
 */
export interface LLMResponse<T = unknown> {
  success: boolean;
  data?: T;
  rawContent?: string;
  error?: string;
  usage: TokenUsage;
  metadata: ResponseMetadata;
}

/**
 * Token usage tracking.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in cents
}

/**
 * Response metadata for audit.
 */
export interface ResponseMetadata {
  requestId: string;
  model: string;
  promptVersion: string;
  role: AgentRole;
  latencyMs: number;
  retryCount: number;
  timestamp: Date;
}

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Output schema definition for structured outputs.
 */
export interface OutputSchema<T> {
  name: string;
  version: string;
  description: string;
  schema: JSONSchema;
  validate: (data: unknown) => ValidationResult<T>;
  parse: (rawContent: string) => T | null;
}

/**
 * JSON Schema type (simplified).
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

/**
 * Schema validation result.
 */
export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Schema validation error.
 */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn: RetryCondition[];
}

/**
 * Conditions that trigger retry.
 */
export type RetryCondition =
  | 'rate_limit'
  | 'timeout'
  | 'server_error'
  | 'invalid_response'
  | 'parse_error';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * LLM Provider interface for multiple backends.
 */
export interface LLMProvider {
  name: string;
  modelId: string;
  call(input: LLMInput): Promise<LLMResponse>;
  estimateTokens(text: string): number;
}

/**
 * Provider configuration.
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  modelId: string;
  timeout?: number;
}
