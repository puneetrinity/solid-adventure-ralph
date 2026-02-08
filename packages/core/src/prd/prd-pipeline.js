"use strict";
/**
 * PRD-to-Artifacts Pipeline
 *
 * Parses PRD documents and generates SCOPE, PLAN, and QUALITY_GATES artifacts.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRDPipeline = void 0;
exports.parsePRD = parsePRD;
exports.detectPRDFormat = detectPRDFormat;
exports.generateScopeArtifact = generateScopeArtifact;
exports.generatePlanArtifact = generatePlanArtifact;
exports.generateQualityGatesArtifact = generateQualityGatesArtifact;
const crypto = __importStar(require("crypto"));
const template_service_1 = require("./template-service");
// ============================================================================
// PRD Parsers
// ============================================================================
/**
 * Parse raw PRD content into structured document.
 */
function parsePRD(content, format, templateType = 'standard') {
    switch (format) {
        case 'json':
            return parseJSONPRD(content);
        case 'markdown':
            return parseMarkdownPRD(content, templateType);
        case 'text':
            return parseTextPRD(content, templateType);
        default:
            throw new Error(`Unsupported PRD format: ${format}`);
    }
}
/**
 * Parse JSON PRD.
 */
function parseJSONPRD(content) {
    try {
        const parsed = JSON.parse(content);
        // Validate it has required PRD structure
        if (!parsed.templateType || !parsed.sections) {
            throw new Error('Invalid PRD JSON: missing templateType or sections');
        }
        return parsed;
    }
    catch (error) {
        throw new Error(`Failed to parse JSON PRD: ${error.message}`);
    }
}
/**
 * Parse Markdown PRD.
 */
function parseMarkdownPRD(content, templateType) {
    return (0, template_service_1.parseMarkdownToPRD)(content, templateType, 'system');
}
/**
 * Parse plain text PRD (best-effort extraction).
 */
function parseTextPRD(content, templateType) {
    // Wrap in basic markdown structure
    const markdown = `# PRD\n\n${content}`;
    return (0, template_service_1.parseMarkdownToPRD)(markdown, templateType, 'system');
}
/**
 * Detect PRD format from content.
 */
function detectPRDFormat(content) {
    const trimmed = content.trim();
    // Check for JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            JSON.parse(trimmed);
            return 'json';
        }
        catch {
            // Not valid JSON
        }
    }
    // Check for Markdown indicators
    if (trimmed.startsWith('#') ||
        trimmed.includes('\n## ') ||
        trimmed.includes('\n### ') ||
        /^\*\*.*\*\*/.test(trimmed) ||
        /^-\s/.test(trimmed)) {
        return 'markdown';
    }
    return 'text';
}
// ============================================================================
// Artifact Generators
// ============================================================================
/**
 * Extract a field value from a PRD document.
 */
function getFieldValue(document, sectionId, fieldId) {
    const section = document.sections.find(s => s.sectionId === sectionId);
    if (!section)
        return null;
    const field = section.fields.find(f => f.fieldId === fieldId);
    return field?.value ?? null;
}
/**
 * Extract all field values from a section.
 */
function getSectionFields(document, sectionId) {
    const section = document.sections.find(s => s.sectionId === sectionId);
    if (!section)
        return {};
    const result = {};
    for (const field of section.fields) {
        if (field.value !== null && field.value !== undefined) {
            result[field.fieldId] = field.value;
        }
    }
    return result;
}
/**
 * Generate SCOPE artifact from PRD.
 */
function generateScopeArtifact(document) {
    const title = document.title || 'Untitled Project';
    // Extract from different template types
    let summary = '';
    let inScope = [];
    let outOfScope = [];
    let assumptions = [];
    let constraints = [];
    let stakeholders = [];
    switch (document.templateType) {
        case 'standard':
            summary = getFieldValue(document, 'overview', 'summary') || '';
            inScope = extractListItems(getFieldValue(document, 'goals', 'business_goals'));
            outOfScope = extractListItems(getFieldValue(document, 'goals', 'non_goals'));
            constraints = extractListItems(getFieldValue(document, 'requirements', 'constraints'));
            break;
        case 'lean':
            summary = getFieldValue(document, 'summary', 'solution') || '';
            inScope = extractListItems(getFieldValue(document, 'scope', 'in_scope'));
            outOfScope = extractListItems(getFieldValue(document, 'scope', 'out_of_scope'));
            break;
        case 'enterprise':
            summary = getFieldValue(document, 'executive', 'summary') || '';
            stakeholders = extractListItems(getFieldValue(document, 'stakeholders', 'stakeholder_list'));
            constraints = extractListItems(getFieldValue(document, 'compliance', 'regulations'));
            break;
        case 'technical':
            summary = getFieldValue(document, 'overview', 'purpose') || '';
            inScope = extractListItems(getFieldValue(document, 'implementation', 'libraries'));
            break;
        case 'user-story':
            summary = getFieldValue(document, 'epic', 'epic_description') || '';
            break;
    }
    return {
        version: '1.0.0',
        title,
        summary,
        inScope,
        outOfScope,
        assumptions,
        constraints,
        stakeholders,
    };
}
/**
 * Generate PLAN artifact from PRD.
 */
function generatePlanArtifact(document) {
    const title = document.title || 'Untitled Project';
    const phases = [];
    const risks = [];
    let dependencies = [];
    let estimatedEffort = 'Unknown';
    switch (document.templateType) {
        case 'standard': {
            // Extract milestones as phases
            const milestones = extractListItems(getFieldValue(document, 'timeline', 'milestones'));
            dependencies = extractListItems(getFieldValue(document, 'timeline', 'dependencies'));
            // Create phases from milestones
            milestones.forEach((milestone, index) => {
                phases.push({
                    id: `phase-${index + 1}`,
                    name: milestone,
                    description: `Phase ${index + 1}: ${milestone}`,
                    tasks: [{
                            id: `task-${index + 1}-1`,
                            title: milestone,
                            description: `Complete: ${milestone}`,
                            acceptanceCriteria: [],
                            dependencies: index > 0 ? [`phase-${index}`] : [],
                            estimatedComplexity: 'medium',
                        }],
                    order: index + 1,
                });
            });
            // Extract risks
            const riskText = getFieldValue(document, 'timeline', 'risks');
            if (riskText) {
                risks.push({
                    id: 'risk-1',
                    description: riskText,
                    impact: 'medium',
                    probability: 'medium',
                    mitigation: 'See PRD for details',
                });
            }
            break;
        }
        case 'lean': {
            // Create single phase from acceptance criteria
            const criteria = extractListItems(getFieldValue(document, 'acceptance', 'criteria'));
            const tasks = criteria.map((criterion, index) => ({
                id: `task-1-${index + 1}`,
                title: criterion,
                description: criterion,
                acceptanceCriteria: [criterion],
                dependencies: [],
                estimatedComplexity: 'low',
            }));
            phases.push({
                id: 'phase-1',
                name: 'Implementation',
                description: 'Main implementation phase',
                tasks,
                order: 1,
            });
            break;
        }
        case 'enterprise': {
            // Extract from project plan section
            const phaseText = getFieldValue(document, 'timeline', 'phases');
            const milestones = extractListItems(getFieldValue(document, 'timeline', 'milestones'));
            dependencies = extractListItems(getFieldValue(document, 'timeline', 'dependencies'));
            // Create phases
            if (milestones.length > 0) {
                milestones.forEach((milestone, index) => {
                    phases.push({
                        id: `phase-${index + 1}`,
                        name: milestone,
                        description: phaseText || `Phase ${index + 1}`,
                        tasks: [{
                                id: `task-${index + 1}-1`,
                                title: milestone,
                                description: milestone,
                                acceptanceCriteria: [],
                                dependencies: [],
                                estimatedComplexity: 'high',
                            }],
                        order: index + 1,
                    });
                });
            }
            // Extract risks from risk section
            const riskRegister = getFieldValue(document, 'risk', 'risk_register');
            const mitigations = getFieldValue(document, 'risk', 'mitigations');
            if (riskRegister) {
                risks.push({
                    id: 'risk-enterprise-1',
                    description: riskRegister,
                    impact: 'high',
                    probability: 'medium',
                    mitigation: mitigations || 'See risk management plan',
                });
            }
            break;
        }
        case 'technical': {
            // Create phases from technical sections
            const sections = ['interface', 'data', 'implementation', 'testing', 'deployment'];
            sections.forEach((sectionId, index) => {
                const section = document.sections.find(s => s.sectionId === sectionId);
                if (section) {
                    const tasks = section.fields
                        .filter(f => f.value)
                        .map((field, taskIndex) => ({
                        id: `task-${index + 1}-${taskIndex + 1}`,
                        title: field.name,
                        description: typeof field.value === 'string' ? field.value : JSON.stringify(field.value),
                        acceptanceCriteria: [],
                        dependencies: [],
                        estimatedComplexity: 'medium',
                    }));
                    if (tasks.length > 0) {
                        phases.push({
                            id: `phase-${index + 1}`,
                            name: section.name,
                            description: `Technical: ${section.name}`,
                            tasks,
                            order: index + 1,
                        });
                    }
                }
            });
            dependencies = extractListItems(getFieldValue(document, 'implementation', 'libraries'));
            break;
        }
        case 'user-story': {
            // Create phase from stories
            const storyList = getFieldValue(document, 'stories', 'story_list');
            const scenarios = getFieldValue(document, 'acceptance', 'given_when_then');
            const tasks = [];
            if (storyList) {
                // Parse user stories
                const stories = storyList.split('\n').filter(s => s.trim());
                stories.forEach((story, index) => {
                    tasks.push({
                        id: `story-${index + 1}`,
                        title: `User Story ${index + 1}`,
                        description: story,
                        acceptanceCriteria: scenarios ? [scenarios] : [],
                        dependencies: [],
                        estimatedComplexity: 'medium',
                    });
                });
            }
            phases.push({
                id: 'phase-1',
                name: 'User Stories',
                description: getFieldValue(document, 'epic', 'epic_description') || 'User story implementation',
                tasks,
                order: 1,
            });
            // Extract story points for effort estimation
            const storyPoints = getFieldValue(document, 'estimation', 'story_points');
            if (storyPoints) {
                estimatedEffort = `${storyPoints} story points`;
            }
            break;
        }
    }
    // Default phase if none extracted
    if (phases.length === 0) {
        phases.push({
            id: 'phase-1',
            name: 'Implementation',
            description: 'Default implementation phase',
            tasks: [{
                    id: 'task-1-1',
                    title: 'Complete PRD requirements',
                    description: 'Implement all requirements from PRD',
                    acceptanceCriteria: [],
                    dependencies: [],
                    estimatedComplexity: 'medium',
                }],
            order: 1,
        });
    }
    return {
        version: '1.0.0',
        title,
        phases,
        estimatedEffort,
        dependencies,
        risks,
    };
}
/**
 * Generate QUALITY_GATES artifact from PRD.
 */
function generateQualityGatesArtifact(document) {
    const gates = [];
    // Default gates that apply to all projects
    gates.push({
        id: 'gate-ci-pass',
        name: 'CI Must Pass',
        description: 'All CI checks must pass before merge',
        trigger: 'post_ci',
        conditions: [{
                type: 'test_pass',
                operator: 'equals',
                value: true,
                description: 'All tests must pass',
            }],
        action: 'block',
        required: true,
    });
    gates.push({
        id: 'gate-review',
        name: 'Code Review Required',
        description: 'At least one approval required',
        trigger: 'pre_merge',
        conditions: [{
                type: 'review_approved',
                operator: 'equals',
                value: true,
                description: 'Approved by reviewer',
            }],
        action: 'block',
        required: true,
    });
    // Template-specific gates
    switch (document.templateType) {
        case 'enterprise':
            // Security scan required for enterprise
            gates.push({
                id: 'gate-security',
                name: 'Security Scan',
                description: 'Security scan must pass',
                trigger: 'post_ci',
                conditions: [{
                        type: 'security_scan',
                        operator: 'equals',
                        value: true,
                        description: 'No critical vulnerabilities',
                    }],
                action: 'block',
                required: true,
            });
            // Compliance review
            gates.push({
                id: 'gate-compliance',
                name: 'Compliance Review',
                description: 'Compliance team must approve',
                trigger: 'manual',
                conditions: [{
                        type: 'review_approved',
                        operator: 'equals',
                        value: true,
                        description: 'Approved by compliance officer',
                    }],
                action: 'block',
                required: true,
            });
            break;
        case 'technical':
            // Coverage requirement for technical specs
            gates.push({
                id: 'gate-coverage',
                name: 'Test Coverage',
                description: 'Minimum 80% test coverage',
                trigger: 'post_ci',
                conditions: [{
                        type: 'coverage',
                        operator: 'greater_than',
                        value: 80,
                        description: 'Code coverage > 80%',
                    }],
                action: 'warn',
                required: false,
            });
            // Lint check
            gates.push({
                id: 'gate-lint',
                name: 'Linting',
                description: 'No linting errors',
                trigger: 'pre_commit',
                conditions: [{
                        type: 'lint',
                        operator: 'equals',
                        value: true,
                        description: 'Zero lint errors',
                    }],
                action: 'block',
                required: true,
            });
            break;
    }
    // Add human review gate for PRD artifacts
    gates.push({
        id: 'gate-prd-review',
        name: 'PRD Artifacts Review',
        description: 'Human must review generated artifacts before proceeding',
        trigger: 'manual',
        conditions: [{
                type: 'review_approved',
                operator: 'equals',
                value: true,
                description: 'Artifacts approved by stakeholder',
            }],
        action: 'block',
        required: true,
    });
    return {
        version: '1.0.0',
        gates,
        defaultAction: 'warn',
    };
}
/**
 * Helper to extract list items from various formats.
 */
function extractListItems(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value.map(item => String(item));
    }
    if (typeof value === 'string') {
        // Split by newlines and list markers
        return value
            .split(/\n/)
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .filter(line => line.length > 0);
    }
    return [];
}
class PRDPipeline {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Run the full PRD-to-Artifacts pipeline.
     */
    async run(workflowId, prdContent, format, templateType) {
        // Detect format if not provided
        const detectedFormat = format || detectPRDFormat(prdContent);
        const template = templateType || 'standard';
        // Parse PRD
        const prdDocument = parsePRD(prdContent, detectedFormat, template);
        // Generate artifacts
        const scope = generateScopeArtifact(prdDocument);
        const plan = generatePlanArtifact(prdDocument);
        const qualityGates = generateQualityGatesArtifact(prdDocument);
        // Save all artifacts
        const [prdArtifact, scopeArtifact, planArtifact, gatesArtifact] = await Promise.all([
            this.saveArtifact(workflowId, 'PRD', prdDocument),
            this.saveArtifact(workflowId, 'SCOPE', scope),
            this.saveArtifact(workflowId, 'PLAN', plan),
            this.saveArtifact(workflowId, 'QUALITY_GATES', qualityGates),
        ]);
        // Record workflow event
        await this.prisma.workflowEvent.create({
            data: {
                workflowId,
                type: 'ARTIFACTS_GENERATED',
                payload: JSON.parse(JSON.stringify({
                    prdId: prdArtifact.id,
                    scopeId: scopeArtifact.id,
                    planId: planArtifact.id,
                    qualityGatesId: gatesArtifact.id,
                    templateType: prdDocument.templateType,
                })),
            },
        });
        return {
            prdDocument,
            scope,
            plan,
            qualityGates,
            artifactIds: {
                prd: prdArtifact.id,
                scope: scopeArtifact.id,
                plan: planArtifact.id,
                qualityGates: gatesArtifact.id,
            },
            requiresApproval: true, // Always require human approval
        };
    }
    /**
     * Save an artifact to the database.
     */
    async saveArtifact(workflowId, kind, content) {
        const contentStr = JSON.stringify(content);
        const contentSha = crypto.createHash('sha256').update(contentStr).digest('hex').slice(0, 16);
        return this.prisma.artifact.create({
            data: {
                workflowId,
                kind,
                content: contentStr,
                contentSha,
            },
        });
    }
    /**
     * Request human approval for generated artifacts.
     */
    async requestApproval(workflowId, artifactIds) {
        // Create an event requiring human review
        await this.prisma.workflowEvent.create({
            data: {
                workflowId,
                type: 'APPROVAL_REQUIRED',
                payload: JSON.parse(JSON.stringify({
                    reason: 'PRD artifacts require human review',
                    artifactIds,
                    requiredApprovals: ['prd_artifacts'],
                })),
            },
        });
        return {
            approvalRequired: true,
            message: 'PRD artifacts have been generated and require human review before proceeding.',
        };
    }
    /**
     * Check if artifacts have been approved.
     */
    async checkApproval(workflowId) {
        const approval = await this.prisma.approval.findFirst({
            where: {
                workflowId,
                kind: 'prd_artifacts',
            },
        });
        return approval !== null;
    }
    /**
     * Load existing artifacts for a workflow.
     */
    async loadArtifacts(workflowId) {
        const artifacts = await this.prisma.artifact.findMany({
            where: {
                workflowId,
                kind: { in: ['PRD', 'SCOPE', 'PLAN', 'QUALITY_GATES'] },
            },
            orderBy: { createdAt: 'desc' },
        });
        const result = {};
        for (const artifact of artifacts) {
            const content = JSON.parse(artifact.content);
            switch (artifact.kind) {
                case 'PRD':
                    if (!result.prd)
                        result.prd = content;
                    break;
                case 'SCOPE':
                    if (!result.scope)
                        result.scope = content;
                    break;
                case 'PLAN':
                    if (!result.plan)
                        result.plan = content;
                    break;
                case 'QUALITY_GATES':
                    if (!result.qualityGates)
                        result.qualityGates = content;
                    break;
            }
        }
        return result;
    }
}
exports.PRDPipeline = PRDPipeline;
//# sourceMappingURL=prd-pipeline.js.map