/**
 * PRD Template Types
 *
 * Types for structured PRD (Product Requirements Document) templates.
 */
/**
 * Available PRD template types.
 */
export type TemplateType = 'standard' | 'lean' | 'enterprise' | 'technical' | 'user-story';
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
    options?: string[];
    defaultValue?: unknown;
}
/**
 * Supported field types.
 */
export type FieldType = 'text' | 'textarea' | 'markdown' | 'enum' | 'list' | 'boolean' | 'number' | 'date' | 'reference';
/**
 * Field validation rules.
 */
export interface FieldValidation {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
    customValidator?: string;
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
    estimatedCompletionTime?: string;
}
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
export type PRDStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'archived';
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
/**
 * PRD validation result.
 */
export interface PRDValidationResult {
    valid: boolean;
    errors: PRDValidationError[];
    warnings: PRDValidationWarning[];
    completeness: number;
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
