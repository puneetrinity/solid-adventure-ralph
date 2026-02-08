/**
 * PRD Templates
 *
 * Pre-defined PRD templates for different use cases.
 */
import { PRDTemplate, TemplateType } from './types';
export declare const STANDARD_TEMPLATE: PRDTemplate;
export declare const LEAN_TEMPLATE: PRDTemplate;
export declare const ENTERPRISE_TEMPLATE: PRDTemplate;
export declare const TECHNICAL_TEMPLATE: PRDTemplate;
export declare const USER_STORY_TEMPLATE: PRDTemplate;
/**
 * All available templates.
 */
export declare const TEMPLATES: Record<TemplateType, PRDTemplate>;
/**
 * Get template by type.
 */
export declare function getTemplate(type: TemplateType): PRDTemplate;
/**
 * Get all available template types.
 */
export declare function getTemplateTypes(): TemplateType[];
/**
 * Get template metadata for selection UI.
 */
export declare function getTemplateInfo(): Array<{
    type: TemplateType;
    name: string;
    description: string;
    estimatedTime: string | undefined;
}>;
