/**
 * PRD-to-Artifacts Pipeline
 *
 * Parses PRD documents and generates SCOPE, PLAN, and QUALITY_GATES artifacts.
 */
import { PrismaClient } from '@prisma/client';
import { PRDDocument, TemplateType } from './types';
/**
 * SCOPE artifact - defines project boundaries.
 */
export interface ScopeArtifact {
    version: string;
    title: string;
    summary: string;
    inScope: string[];
    outOfScope: string[];
    assumptions: string[];
    constraints: string[];
    stakeholders: string[];
}
/**
 * PLAN artifact - task breakdown.
 * Note: Prefixed with PRD to avoid conflicts with llm/artifact-generator types.
 */
export interface PlanArtifact {
    version: string;
    title: string;
    phases: PRDPlanPhase[];
    estimatedEffort: string;
    dependencies: string[];
    risks: PRDPlanRisk[];
}
export interface PRDPlanPhase {
    id: string;
    name: string;
    description: string;
    tasks: PRDPlanTask[];
    order: number;
}
export interface PRDPlanTask {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    dependencies: string[];
    estimatedComplexity: 'low' | 'medium' | 'high';
}
export interface PRDPlanRisk {
    id: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    probability: 'low' | 'medium' | 'high';
    mitigation: string;
}
/**
 * QUALITY_GATES artifact - quality checkpoints.
 * Note: Prefixed with PRD to avoid conflicts with policy/gate3 types.
 */
export interface QualityGatesArtifact {
    version: string;
    gates: PRDQualityGate[];
    defaultAction: 'block' | 'warn';
}
export interface PRDQualityGate {
    id: string;
    name: string;
    description: string;
    trigger: GateTrigger;
    conditions: GateCondition[];
    action: 'block' | 'warn' | 'pass';
    required: boolean;
}
export type GateTrigger = 'pre_commit' | 'post_commit' | 'pre_merge' | 'post_ci' | 'manual';
export interface GateCondition {
    type: 'test_pass' | 'coverage' | 'lint' | 'security_scan' | 'review_approved' | 'custom';
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
    value: string | number | boolean;
    description?: string;
}
/**
 * Parse raw PRD content into structured document.
 */
export declare function parsePRD(content: string, format: 'markdown' | 'json' | 'text', templateType?: TemplateType): PRDDocument;
/**
 * Detect PRD format from content.
 */
export declare function detectPRDFormat(content: string): 'markdown' | 'json' | 'text';
/**
 * Generate SCOPE artifact from PRD.
 */
export declare function generateScopeArtifact(document: PRDDocument): ScopeArtifact;
/**
 * Generate PLAN artifact from PRD.
 */
export declare function generatePlanArtifact(document: PRDDocument): PlanArtifact;
/**
 * Generate QUALITY_GATES artifact from PRD.
 */
export declare function generateQualityGatesArtifact(document: PRDDocument): QualityGatesArtifact;
export interface PipelineResult {
    prdDocument: PRDDocument;
    scope: ScopeArtifact;
    plan: PlanArtifact;
    qualityGates: QualityGatesArtifact;
    artifactIds: {
        prd: string;
        scope: string;
        plan: string;
        qualityGates: string;
    };
    requiresApproval: boolean;
}
export declare class PRDPipeline {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /**
     * Run the full PRD-to-Artifacts pipeline.
     */
    run(workflowId: string, prdContent: string, format?: 'markdown' | 'json' | 'text', templateType?: TemplateType): Promise<PipelineResult>;
    /**
     * Save an artifact to the database.
     */
    private saveArtifact;
    /**
     * Request human approval for generated artifacts.
     */
    requestApproval(workflowId: string, artifactIds: PipelineResult['artifactIds']): Promise<{
        approvalRequired: boolean;
        message: string;
    }>;
    /**
     * Check if artifacts have been approved.
     */
    checkApproval(workflowId: string): Promise<boolean>;
    /**
     * Load existing artifacts for a workflow.
     */
    loadArtifacts(workflowId: string): Promise<{
        prd?: PRDDocument;
        scope?: ScopeArtifact;
        plan?: PlanArtifact;
        qualityGates?: QualityGatesArtifact;
    }>;
}
