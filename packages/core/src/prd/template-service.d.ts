/**
 * PRD Template Service
 *
 * Handles template selection, validation, and document creation.
 */
import { PrismaClient } from '@prisma/client';
import { TemplateType, PRDTemplate, PRDDocument, PRDValidationResult } from './types';
export declare class TemplateService {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /**
     * Get all available templates.
     */
    getAvailableTemplates(): PRDTemplate[];
    /**
     * Get template by type.
     */
    getTemplate(type: TemplateType): PRDTemplate;
    /**
     * Get template types.
     */
    getTemplateTypes(): TemplateType[];
    /**
     * Suggest a template based on project characteristics.
     */
    suggestTemplate(options: {
        hasCompliance?: boolean;
        isQuickIteration?: boolean;
        isTechnicalSpec?: boolean;
        isAgile?: boolean;
    }): TemplateType;
    /**
     * Create a new PRD document from a template.
     */
    createDocument(templateType: TemplateType, title: string, createdBy: string, workflowId?: string): PRDDocument;
    /**
     * Create an empty section from template.
     */
    private createEmptySection;
    /**
     * Update a field in a document.
     */
    updateField(document: PRDDocument, sectionId: string, fieldId: string, value: unknown): PRDDocument;
    /**
     * Validate a PRD document against its template.
     */
    validateDocument(document: PRDDocument): PRDValidationResult;
    /**
     * Validate a single field.
     */
    private validateField;
    /**
     * Check if a field has a value.
     */
    private isFieldFilled;
    /**
     * Save a PRD document as an artifact.
     */
    saveAsArtifact(document: PRDDocument, workflowId: string): Promise<string>;
    /**
     * Load a PRD document from an artifact.
     */
    loadFromArtifact(artifactId: string): Promise<PRDDocument | null>;
    /**
     * Generate a hash for document content.
     */
    private hashDocument;
    /**
     * Create a workflow with a PRD template.
     */
    createWorkflowWithTemplate(repoFullName: string, prdContent: string, templateType: TemplateType, createdBy: string): Promise<{
        workflowId: string;
        documentId: string;
    }>;
    /**
     * Get the template type for a workflow.
     */
    getWorkflowTemplateType(workflowId: string): Promise<TemplateType | null>;
}
/**
 * Render PRD document to markdown.
 */
export declare function renderDocumentToMarkdown(document: PRDDocument): string;
/**
 * Parse markdown PRD to document structure.
 */
export declare function parseMarkdownToPRD(markdown: string, templateType: TemplateType, createdBy: string): PRDDocument;
