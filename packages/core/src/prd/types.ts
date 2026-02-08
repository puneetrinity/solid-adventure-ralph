/**
 * PRD Template Types
 *
 * Types for structured PRD (Product Requirements Document) templates.
 */

// ============================================================================
// Template Schema Types
// ============================================================================

/**
 * Available PRD template types.
 */
export type TemplateType =
  | 'standard'     // Full-featured PRD for most projects
  | 'lean'         // Minimal PRD for quick iterations
  | 'enterprise'   // Comprehensive PRD with compliance/security
  | 'technical'    // Developer-focused technical spec
  | 'user-story';  // User-story driven format

/**
 * PRD template definition.
 */
export interface PRDTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  version: string;
  sections: TemplateSection[];
  metadata: TemplateMetadata;
}

/**
 * Section within a PRD template.
 */
export interface TemplateSection {
  id: string;
  name: string;
  description: string;
  required: boolean;
  order: number;
  fields: TemplateField[];
  subsections?: TemplateSection[];
}

/**
 * Field within a section.
 */
export interface TemplateField {
  id: string;
  name: string;
  type: FieldType;
  description: string;
  required: boolean;
  placeholder?: string;
  validation?: FieldValidation;
  options?: string[];  // For enum/select types
  defaultValue?: unknown;
}

/**
 * Supported field types.
 */
export type FieldType =
  | 'text'         // Single line text
  | 'textarea'     // Multi-line text
  | 'markdown'     // Markdown content
  | 'enum'         // Select from options
  | 'list'         // Array of items
  | 'boolean'      // Yes/no
  | 'number'       // Numeric value
  | 'date'         // Date value
  | 'reference';   // Reference to another artifact

/**
 * Field validation rules.
 */
export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  customValidator?: string;  // Reference to validator function
}

/**
 * Template metadata.
 */
export interface TemplateMetadata {
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  targetAudience: string[];
  estimatedCompletionTime?: string;  // e.g., "30 minutes"
}

// ============================================================================
// PRD Document Types
// ============================================================================

/**
 * A filled-out PRD document.
 */
export interface PRDDocument {
  id: string;
  templateId: string;
  templateType: TemplateType;
  title: string;
  version: string;
  status: PRDStatus;
  sections: FilledSection[];
  metadata: DocumentMetadata;
}

/**
 * PRD document status.
 */
export type PRDStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'archived';

/**
 * A filled-out section.
 */
export interface FilledSection {
  sectionId: string;
  name: string;
  fields: FilledField[];
  subsections?: FilledSection[];
}

/**
 * A filled-out field.
 */
export interface FilledField {
  fieldId: string;
  name: string;
  value: unknown;
}

/**
 * Document metadata.
 */
export interface DocumentMetadata {
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  reviewers?: string[];
  approvedBy?: string;
  approvedAt?: Date;
  workflowId?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * PRD validation result.
 */
export interface PRDValidationResult {
  valid: boolean;
  errors: PRDValidationError[];
  warnings: PRDValidationWarning[];
  completeness: number;  // 0-100 percentage
}

/**
 * Validation error.
 */
export interface PRDValidationError {
  sectionId: string;
  fieldId?: string;
  message: string;
  code: string;
}

/**
 * Validation warning.
 */
export interface PRDValidationWarning {
  sectionId: string;
  fieldId?: string;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Template Registry Types
// ============================================================================

/**
 * Template registry entry.
 */
export interface TemplateRegistryEntry {
  template: PRDTemplate;
  isDefault: boolean;
  usageCount: number;
  lastUsed?: Date;
}

/**
 * Template query options.
 */
export interface TemplateQueryOptions {
  type?: TemplateType;
  tags?: string[];
  audience?: string[];
}
