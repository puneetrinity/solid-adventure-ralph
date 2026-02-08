/**
 * PRD Template Service
 *
 * Handles template selection, validation, and document creation.
 */

import { PrismaClient } from '@prisma/client';
import {
  TemplateType,
  PRDTemplate,
  PRDDocument,
  PRDStatus,
  FilledSection,
  FilledField,
  PRDValidationResult,
  PRDValidationError,
  PRDValidationWarning,
  TemplateField,
  TemplateSection,
} from './types';
import { TEMPLATES, getTemplate, getTemplateTypes } from './templates';

// ============================================================================
// Template Service
// ============================================================================

export class TemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  // --------------------------------------------------------------------------
  // Template Selection
  // --------------------------------------------------------------------------

  /**
   * Get all available templates.
   */
  getAvailableTemplates(): PRDTemplate[] {
    return Object.values(TEMPLATES);
  }

  /**
   * Get template by type.
   */
  getTemplate(type: TemplateType): PRDTemplate {
    return getTemplate(type);
  }

  /**
   * Get template types.
   */
  getTemplateTypes(): TemplateType[] {
    return getTemplateTypes();
  }

  /**
   * Suggest a template based on project characteristics.
   */
  suggestTemplate(options: {
    hasCompliance?: boolean;
    isQuickIteration?: boolean;
    isTechnicalSpec?: boolean;
    isAgile?: boolean;
  }): TemplateType {
    if (options.hasCompliance) {
      return 'enterprise';
    }
    if (options.isTechnicalSpec) {
      return 'technical';
    }
    if (options.isAgile) {
      return 'user-story';
    }
    if (options.isQuickIteration) {
      return 'lean';
    }
    return 'standard';
  }

  // --------------------------------------------------------------------------
  // Document Creation
  // --------------------------------------------------------------------------

  /**
   * Create a new PRD document from a template.
   */
  createDocument(
    templateType: TemplateType,
    title: string,
    createdBy: string,
    workflowId?: string
  ): PRDDocument {
    const template = getTemplate(templateType);
    const now = new Date();

    const sections = template.sections.map((section) =>
      this.createEmptySection(section)
    );

    return {
      id: `prd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      templateId: template.id,
      templateType: template.type,
      title,
      version: '1.0.0',
      status: 'draft' as PRDStatus,
      sections,
      metadata: {
        createdBy,
        createdAt: now,
        updatedAt: now,
        workflowId,
      },
    };
  }

  /**
   * Create an empty section from template.
   */
  private createEmptySection(templateSection: TemplateSection): FilledSection {
    const fields = templateSection.fields.map((field) => ({
      fieldId: field.id,
      name: field.name,
      value: field.defaultValue ?? null,
    }));

    const subsections = templateSection.subsections?.map((sub) =>
      this.createEmptySection(sub)
    );

    return {
      sectionId: templateSection.id,
      name: templateSection.name,
      fields,
      subsections,
    };
  }

  /**
   * Update a field in a document.
   */
  updateField(
    document: PRDDocument,
    sectionId: string,
    fieldId: string,
    value: unknown
  ): PRDDocument {
    const updatedSections = document.sections.map((section) => {
      if (section.sectionId === sectionId) {
        return {
          ...section,
          fields: section.fields.map((field) => {
            if (field.fieldId === fieldId) {
              return { ...field, value };
            }
            return field;
          }),
        };
      }
      return section;
    });

    return {
      ...document,
      sections: updatedSections,
      metadata: {
        ...document.metadata,
        updatedAt: new Date(),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validate a PRD document against its template.
   */
  validateDocument(document: PRDDocument): PRDValidationResult {
    const template = getTemplate(document.templateType);
    const errors: PRDValidationError[] = [];
    const warnings: PRDValidationWarning[] = [];
    let totalFields = 0;
    let filledFields = 0;

    for (const templateSection of template.sections) {
      const docSection = document.sections.find(
        (s) => s.sectionId === templateSection.id
      );

      if (!docSection && templateSection.required) {
        errors.push({
          sectionId: templateSection.id,
          message: `Required section "${templateSection.name}" is missing`,
          code: 'MISSING_SECTION',
        });
        continue;
      }

      if (!docSection) continue;

      for (const templateField of templateSection.fields) {
        totalFields++;
        const docField = docSection.fields.find(
          (f) => f.fieldId === templateField.id
        );

        if (!docField) {
          if (templateField.required) {
            errors.push({
              sectionId: templateSection.id,
              fieldId: templateField.id,
              message: `Required field "${templateField.name}" is missing`,
              code: 'MISSING_FIELD',
            });
          }
          continue;
        }

        const fieldErrors = this.validateField(
          templateField,
          docField,
          templateSection.id
        );
        errors.push(...fieldErrors.errors);
        warnings.push(...fieldErrors.warnings);

        if (this.isFieldFilled(docField.value)) {
          filledFields++;
        }
      }
    }

    const completeness =
      totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      completeness,
    };
  }

  /**
   * Validate a single field.
   */
  private validateField(
    templateField: TemplateField,
    docField: FilledField,
    sectionId: string
  ): { errors: PRDValidationError[]; warnings: PRDValidationWarning[] } {
    const errors: PRDValidationError[] = [];
    const warnings: PRDValidationWarning[] = [];
    const value = docField.value;

    // Check required
    if (templateField.required && !this.isFieldFilled(value)) {
      errors.push({
        sectionId,
        fieldId: templateField.id,
        message: `Field "${templateField.name}" is required`,
        code: 'REQUIRED_FIELD_EMPTY',
      });
      return { errors, warnings };
    }

    if (!this.isFieldFilled(value)) {
      return { errors, warnings };
    }

    // Type-specific validation
    const validation = templateField.validation;
    if (!validation) {
      return { errors, warnings };
    }

    // String length validation
    if (typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        errors.push({
          sectionId,
          fieldId: templateField.id,
          message: `Field "${templateField.name}" must be at least ${validation.minLength} characters`,
          code: 'MIN_LENGTH',
        });
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        errors.push({
          sectionId,
          fieldId: templateField.id,
          message: `Field "${templateField.name}" must be at most ${validation.maxLength} characters`,
          code: 'MAX_LENGTH',
        });
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        errors.push({
          sectionId,
          fieldId: templateField.id,
          message: `Field "${templateField.name}" does not match required pattern`,
          code: 'PATTERN_MISMATCH',
        });
      }
    }

    // Number validation
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        errors.push({
          sectionId,
          fieldId: templateField.id,
          message: `Field "${templateField.name}" must be at least ${validation.min}`,
          code: 'MIN_VALUE',
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        errors.push({
          sectionId,
          fieldId: templateField.id,
          message: `Field "${templateField.name}" must be at most ${validation.max}`,
          code: 'MAX_VALUE',
        });
      }
    }

    // Enum validation
    if (templateField.options && !templateField.options.includes(value as string)) {
      errors.push({
        sectionId,
        fieldId: templateField.id,
        message: `Field "${templateField.name}" must be one of: ${templateField.options.join(', ')}`,
        code: 'INVALID_OPTION',
      });
    }

    return { errors, warnings };
  }

  /**
   * Check if a field has a value.
   */
  private isFieldFilled(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  // --------------------------------------------------------------------------
  // Document Persistence
  // --------------------------------------------------------------------------

  /**
   * Save a PRD document as an artifact.
   */
  async saveAsArtifact(
    document: PRDDocument,
    workflowId: string
  ): Promise<string> {
    const artifact = await this.prisma.artifact.create({
      data: {
        kind: 'PRD',
        workflowId,
        content: JSON.stringify(document),
        contentSha: this.hashDocument(document),
      },
    });

    return artifact.id;
  }

  /**
   * Load a PRD document from an artifact.
   */
  async loadFromArtifact(artifactId: string): Promise<PRDDocument | null> {
    const artifact = await this.prisma.artifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact || artifact.kind !== 'PRD') {
      return null;
    }

    return JSON.parse(artifact.content) as PRDDocument;
  }

  /**
   * Generate a hash for document content.
   */
  private hashDocument(document: PRDDocument): string {
    const crypto = require('crypto');
    const content = JSON.stringify(document.sections);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  // --------------------------------------------------------------------------
  // Workflow Integration
  // --------------------------------------------------------------------------

  /**
   * Create a workflow with a PRD template.
   */
  async createWorkflowWithTemplate(
    repoFullName: string,
    prdContent: string,
    templateType: TemplateType,
    createdBy: string
  ): Promise<{ workflowId: string; documentId: string }> {
    // Create workflow with PENDING state
    // Note: repoFullName and prdContent stored in artifact, not workflow
    const workflow = await this.prisma.workflow.create({
      data: {
        state: 'PENDING',
      },
    });

    // Create PRD document with repo info in title
    const document = this.createDocument(
      templateType,
      `PRD for ${repoFullName}`,
      createdBy,
      workflow.id
    );

    // Store original PRD content in document metadata
    (document.metadata as any).originalContent = prdContent;
    (document.metadata as any).repoFullName = repoFullName;

    // Save as artifact
    const artifactId = await this.saveAsArtifact(document, workflow.id);

    return {
      workflowId: workflow.id,
      documentId: artifactId,
    };
  }

  /**
   * Get the template type for a workflow.
   */
  async getWorkflowTemplateType(workflowId: string): Promise<TemplateType | null> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        workflowId,
        kind: 'PRD',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!artifact) {
      return null;
    }

    const document = JSON.parse(artifact.content) as PRDDocument;
    return document.templateType;
  }
}

// ============================================================================
// Template Renderer
// ============================================================================

/**
 * Render PRD document to markdown.
 */
export function renderDocumentToMarkdown(document: PRDDocument): string {
  const lines: string[] = [];

  lines.push(`# ${document.title}`);
  lines.push('');
  lines.push(`**Template:** ${document.templateType}`);
  lines.push(`**Version:** ${document.version}`);
  lines.push(`**Status:** ${document.status}`);
  lines.push(`**Created:** ${document.metadata.createdAt}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const section of document.sections) {
    lines.push(...renderSection(section, 2));
  }

  return lines.join('\n');
}

function renderSection(section: FilledSection, level: number): string[] {
  const lines: string[] = [];
  const prefix = '#'.repeat(level);

  lines.push(`${prefix} ${section.name}`);
  lines.push('');

  for (const field of section.fields) {
    if (field.value !== null && field.value !== undefined) {
      lines.push(`**${field.name}:**`);
      if (typeof field.value === 'string' && field.value.includes('\n')) {
        lines.push('');
        lines.push(field.value);
      } else if (Array.isArray(field.value)) {
        lines.push('');
        for (const item of field.value) {
          lines.push(`- ${item}`);
        }
      } else {
        lines.push(`${field.value}`);
      }
      lines.push('');
    }
  }

  if (section.subsections) {
    for (const sub of section.subsections) {
      lines.push(...renderSection(sub, level + 1));
    }
  }

  return lines;
}

/**
 * Parse markdown PRD to document structure.
 */
export function parseMarkdownToPRD(
  markdown: string,
  templateType: TemplateType,
  createdBy: string
): PRDDocument {
  const template = getTemplate(templateType);
  const lines = markdown.split('\n');

  // Extract title from first heading
  let title = 'Untitled PRD';
  const titleMatch = lines.find(l => l.startsWith('# '));
  if (titleMatch) {
    title = titleMatch.slice(2).trim();
  }

  // Create document with empty sections
  const document: PRDDocument = {
    id: `prd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    templateId: template.id,
    templateType: template.type,
    title,
    version: '1.0.0',
    status: 'draft',
    sections: template.sections.map(s => ({
      sectionId: s.id,
      name: s.name,
      fields: s.fields.map(f => ({
        fieldId: f.id,
        name: f.name,
        value: null,
      })),
    })),
    metadata: {
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  // TODO: Implement actual markdown parsing to fill fields
  // This would use the template structure to match headings
  // to sections and extract field values

  return document;
}
