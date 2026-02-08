"use strict";
/**
 * PRD Templates
 *
 * Pre-defined PRD templates for different use cases.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATES = exports.USER_STORY_TEMPLATE = exports.TECHNICAL_TEMPLATE = exports.ENTERPRISE_TEMPLATE = exports.LEAN_TEMPLATE = exports.STANDARD_TEMPLATE = void 0;
exports.getTemplate = getTemplate;
exports.getTemplateTypes = getTemplateTypes;
exports.getTemplateInfo = getTemplateInfo;
// ============================================================================
// Helper Functions
// ============================================================================
function createField(id, name, type, description, required, options) {
    return {
        id,
        name,
        type,
        description,
        required,
        ...options,
    };
}
function createSection(id, name, description, order, fields, required = true, subsections) {
    return {
        id,
        name,
        description,
        required,
        order,
        fields,
        subsections,
    };
}
// ============================================================================
// Standard Template
// ============================================================================
exports.STANDARD_TEMPLATE = {
    id: 'standard-v1',
    type: 'standard',
    name: 'Standard PRD Template',
    description: 'Full-featured PRD template suitable for most software projects.',
    version: '1.0.0',
    sections: [
        createSection('overview', 'Overview', 'High-level project summary', 1, [
            createField('title', 'Project Title', 'text', 'Name of the project or feature', true),
            createField('summary', 'Executive Summary', 'textarea', 'Brief description of what this PRD covers', true),
            createField('problem', 'Problem Statement', 'markdown', 'The problem being solved', true),
            createField('solution', 'Proposed Solution', 'markdown', 'High-level solution approach', true),
        ]),
        createSection('goals', 'Goals & Objectives', 'What success looks like', 2, [
            createField('business_goals', 'Business Goals', 'list', 'Business objectives this addresses', true),
            createField('success_metrics', 'Success Metrics', 'list', 'Measurable success criteria', true),
            createField('non_goals', 'Non-Goals', 'list', 'What is explicitly out of scope', false),
        ]),
        createSection('requirements', 'Requirements', 'Detailed requirements', 3, [
            createField('functional', 'Functional Requirements', 'markdown', 'What the system must do', true),
            createField('non_functional', 'Non-Functional Requirements', 'markdown', 'Performance, security, etc.', false),
            createField('constraints', 'Constraints', 'list', 'Technical or business constraints', false),
        ]),
        createSection('design', 'Design', 'Technical design overview', 4, [
            createField('architecture', 'Architecture Overview', 'markdown', 'High-level architecture', false),
            createField('data_model', 'Data Model', 'markdown', 'Key data structures', false),
            createField('api_design', 'API Design', 'markdown', 'API endpoints and contracts', false),
        ], false),
        createSection('timeline', 'Timeline & Milestones', 'Project schedule', 5, [
            createField('milestones', 'Milestones', 'list', 'Key project milestones', true),
            createField('dependencies', 'Dependencies', 'list', 'External dependencies', false),
            createField('risks', 'Risks & Mitigations', 'markdown', 'Known risks and how to address them', false),
        ]),
        createSection('appendix', 'Appendix', 'Additional information', 6, [
            createField('references', 'References', 'list', 'Related documents and links', false),
            createField('glossary', 'Glossary', 'markdown', 'Term definitions', false),
        ], false),
    ],
    metadata: {
        createdAt: new Date('2026-02-06'),
        updatedAt: new Date('2026-02-06'),
        tags: ['general', 'full-featured'],
        targetAudience: ['product-managers', 'engineers', 'stakeholders'],
        estimatedCompletionTime: '2-4 hours',
    },
};
// ============================================================================
// Lean Template
// ============================================================================
exports.LEAN_TEMPLATE = {
    id: 'lean-v1',
    type: 'lean',
    name: 'Lean PRD Template',
    description: 'Minimal PRD template for quick iterations and small features.',
    version: '1.0.0',
    sections: [
        createSection('summary', 'Summary', 'Quick overview', 1, [
            createField('title', 'Feature Title', 'text', 'Name of the feature', true),
            createField('problem', 'Problem', 'textarea', 'What problem does this solve?', true),
            createField('solution', 'Solution', 'textarea', 'How will we solve it?', true),
        ]),
        createSection('scope', 'Scope', 'What we will and will not do', 2, [
            createField('in_scope', 'In Scope', 'list', 'What is included', true),
            createField('out_of_scope', 'Out of Scope', 'list', 'What is excluded', true),
        ]),
        createSection('acceptance', 'Acceptance Criteria', 'Definition of done', 3, [
            createField('criteria', 'Acceptance Criteria', 'list', 'Conditions for completion', true),
        ]),
    ],
    metadata: {
        createdAt: new Date('2026-02-06'),
        updatedAt: new Date('2026-02-06'),
        tags: ['lean', 'quick', 'minimal'],
        targetAudience: ['engineers', 'product-managers'],
        estimatedCompletionTime: '15-30 minutes',
    },
};
// ============================================================================
// Enterprise Template
// ============================================================================
exports.ENTERPRISE_TEMPLATE = {
    id: 'enterprise-v1',
    type: 'enterprise',
    name: 'Enterprise PRD Template',
    description: 'Comprehensive PRD template with compliance, security, and governance sections.',
    version: '1.0.0',
    sections: [
        createSection('executive', 'Executive Summary', 'Leadership overview', 1, [
            createField('title', 'Project Title', 'text', 'Official project name', true),
            createField('sponsor', 'Executive Sponsor', 'text', 'Project sponsor name', true),
            createField('summary', 'Executive Summary', 'markdown', 'High-level summary for leadership', true),
            createField('business_case', 'Business Case', 'markdown', 'Business justification', true),
            createField('roi', 'Expected ROI', 'textarea', 'Return on investment analysis', false),
        ]),
        createSection('stakeholders', 'Stakeholders', 'Project stakeholders', 2, [
            createField('owner', 'Product Owner', 'text', 'Primary product owner', true),
            createField('stakeholder_list', 'Stakeholder List', 'list', 'All stakeholders and their roles', true),
            createField('approval_chain', 'Approval Chain', 'list', 'Required approvals', true),
        ]),
        createSection('requirements', 'Requirements', 'Detailed requirements', 3, [
            createField('business_requirements', 'Business Requirements', 'markdown', 'Business-level requirements', true),
            createField('functional_requirements', 'Functional Requirements', 'markdown', 'System capabilities', true),
            createField('non_functional', 'Non-Functional Requirements', 'markdown', 'Quality attributes', true),
        ]),
        createSection('compliance', 'Compliance & Governance', 'Regulatory requirements', 4, [
            createField('regulations', 'Applicable Regulations', 'list', 'GDPR, SOC2, HIPAA, etc.', true),
            createField('data_classification', 'Data Classification', 'enum', 'Data sensitivity level', true, {
                options: ['Public', 'Internal', 'Confidential', 'Restricted'],
            }),
            createField('audit_requirements', 'Audit Requirements', 'markdown', 'Audit trail needs', false),
            createField('retention_policy', 'Data Retention Policy', 'textarea', 'How long data is kept', false),
        ]),
        createSection('security', 'Security', 'Security requirements', 5, [
            createField('threat_model', 'Threat Model', 'markdown', 'Security threat analysis', true),
            createField('auth_requirements', 'Authentication Requirements', 'markdown', 'Auth mechanisms', true),
            createField('encryption', 'Encryption Requirements', 'markdown', 'Data encryption needs', true),
            createField('access_control', 'Access Control', 'markdown', 'Authorization model', true),
        ]),
        createSection('design', 'Technical Design', 'Architecture and design', 6, [
            createField('architecture', 'System Architecture', 'markdown', 'Architecture diagrams and description', true),
            createField('integration', 'Integration Points', 'list', 'External system integrations', true),
            createField('data_flow', 'Data Flow', 'markdown', 'How data moves through the system', true),
            createField('disaster_recovery', 'Disaster Recovery', 'markdown', 'DR plan', true),
        ]),
        createSection('timeline', 'Project Plan', 'Schedule and resources', 7, [
            createField('phases', 'Project Phases', 'markdown', 'Phase breakdown', true),
            createField('milestones', 'Key Milestones', 'list', 'Critical dates', true),
            createField('resources', 'Resource Requirements', 'markdown', 'Team and budget needs', true),
            createField('dependencies', 'Dependencies', 'list', 'External dependencies', true),
        ]),
        createSection('risk', 'Risk Management', 'Risk assessment', 8, [
            createField('risk_register', 'Risk Register', 'markdown', 'Identified risks with impact/probability', true),
            createField('mitigations', 'Mitigation Strategies', 'markdown', 'How risks will be addressed', true),
            createField('contingency', 'Contingency Plans', 'markdown', 'Fallback options', false),
        ]),
    ],
    metadata: {
        createdAt: new Date('2026-02-06'),
        updatedAt: new Date('2026-02-06'),
        tags: ['enterprise', 'compliance', 'security', 'governance'],
        targetAudience: ['executives', 'compliance-officers', 'security-teams', 'architects'],
        estimatedCompletionTime: '1-2 weeks',
    },
};
// ============================================================================
// Technical Template
// ============================================================================
exports.TECHNICAL_TEMPLATE = {
    id: 'technical-v1',
    type: 'technical',
    name: 'Technical Specification Template',
    description: 'Developer-focused technical specification for implementation.',
    version: '1.0.0',
    sections: [
        createSection('overview', 'Technical Overview', 'System context', 1, [
            createField('title', 'Component/Feature Name', 'text', 'Technical component name', true),
            createField('purpose', 'Purpose', 'textarea', 'Why this component exists', true),
            createField('context', 'System Context', 'markdown', 'Where this fits in the system', true),
        ]),
        createSection('interface', 'Interface Design', 'API and interfaces', 2, [
            createField('api_endpoints', 'API Endpoints', 'markdown', 'REST/GraphQL endpoints', true),
            createField('request_response', 'Request/Response Schemas', 'markdown', 'Data schemas', true),
            createField('error_codes', 'Error Codes', 'markdown', 'Error handling', true),
            createField('events', 'Events/Webhooks', 'markdown', 'Async communication', false),
        ]),
        createSection('data', 'Data Model', 'Database and storage', 3, [
            createField('entities', 'Entities', 'markdown', 'Database entities/tables', true),
            createField('relationships', 'Relationships', 'markdown', 'Entity relationships', true),
            createField('indexes', 'Indexes', 'markdown', 'Performance indexes', false),
            createField('migrations', 'Migration Strategy', 'markdown', 'Data migration plan', false),
        ]),
        createSection('implementation', 'Implementation Details', 'How to build it', 4, [
            createField('algorithms', 'Algorithms', 'markdown', 'Key algorithms and logic', false),
            createField('libraries', 'Libraries & Dependencies', 'list', 'External dependencies', true),
            createField('code_structure', 'Code Structure', 'markdown', 'File/module organization', true),
            createField('patterns', 'Design Patterns', 'list', 'Patterns to use', false),
        ]),
        createSection('testing', 'Testing Strategy', 'Quality assurance', 5, [
            createField('unit_tests', 'Unit Tests', 'markdown', 'Unit test requirements', true),
            createField('integration_tests', 'Integration Tests', 'markdown', 'Integration test plan', true),
            createField('performance_tests', 'Performance Tests', 'markdown', 'Load/stress tests', false),
            createField('test_data', 'Test Data', 'markdown', 'Test fixtures and mocks', false),
        ]),
        createSection('deployment', 'Deployment', 'How to deploy', 6, [
            createField('environment', 'Environment Config', 'markdown', 'Environment variables', true),
            createField('infrastructure', 'Infrastructure', 'markdown', 'Required infrastructure', true),
            createField('rollout', 'Rollout Plan', 'markdown', 'Deployment strategy', true),
            createField('rollback', 'Rollback Plan', 'markdown', 'How to revert', true),
        ]),
        createSection('observability', 'Observability', 'Monitoring and debugging', 7, [
            createField('logging', 'Logging', 'markdown', 'What to log', true),
            createField('metrics', 'Metrics', 'list', 'Key metrics to track', true),
            createField('alerts', 'Alerts', 'list', 'Alert conditions', false),
            createField('dashboards', 'Dashboards', 'markdown', 'Monitoring dashboards', false),
        ], false),
    ],
    metadata: {
        createdAt: new Date('2026-02-06'),
        updatedAt: new Date('2026-02-06'),
        tags: ['technical', 'engineering', 'implementation'],
        targetAudience: ['engineers', 'architects', 'devops'],
        estimatedCompletionTime: '4-8 hours',
    },
};
// ============================================================================
// User Story Template
// ============================================================================
exports.USER_STORY_TEMPLATE = {
    id: 'user-story-v1',
    type: 'user-story',
    name: 'User Story Template',
    description: 'User-story driven format for agile development.',
    version: '1.0.0',
    sections: [
        createSection('epic', 'Epic', 'Parent epic information', 1, [
            createField('epic_title', 'Epic Title', 'text', 'Name of the epic', true),
            createField('epic_description', 'Epic Description', 'textarea', 'What this epic achieves', true),
            createField('user_persona', 'Target Persona', 'text', 'Who is this for', true),
        ]),
        createSection('stories', 'User Stories', 'Individual stories', 2, [
            createField('story_list', 'Stories', 'markdown', 'User stories in "As a... I want... So that..." format', true, {
                placeholder: 'As a [user type], I want [action] so that [benefit].',
            }),
        ]),
        createSection('acceptance', 'Acceptance Criteria', 'Story validation', 3, [
            createField('given_when_then', 'Scenarios', 'markdown', 'Given/When/Then scenarios', true, {
                placeholder: 'Given [context], When [action], Then [expected result].',
            }),
        ]),
        createSection('design', 'UI/UX', 'User experience design', 4, [
            createField('wireframes', 'Wireframes', 'markdown', 'Links to wireframes or descriptions', false),
            createField('user_flow', 'User Flow', 'markdown', 'Step-by-step user journey', true),
            createField('edge_cases', 'Edge Cases', 'list', 'Unusual scenarios to handle', false),
        ], false),
        createSection('technical', 'Technical Notes', 'Implementation guidance', 5, [
            createField('tech_notes', 'Technical Considerations', 'markdown', 'Engineering notes', false),
            createField('dependencies', 'Dependencies', 'list', 'Blockers or prerequisites', false),
        ], false),
        createSection('estimation', 'Estimation', 'Effort estimation', 6, [
            createField('story_points', 'Story Points', 'number', 'Estimated effort', false),
            createField('priority', 'Priority', 'enum', 'Story priority', true, {
                options: ['Critical', 'High', 'Medium', 'Low'],
            }),
            createField('sprint', 'Target Sprint', 'text', 'When to implement', false),
        ]),
    ],
    metadata: {
        createdAt: new Date('2026-02-06'),
        updatedAt: new Date('2026-02-06'),
        tags: ['agile', 'user-stories', 'scrum'],
        targetAudience: ['product-owners', 'scrum-masters', 'engineers'],
        estimatedCompletionTime: '30-60 minutes',
    },
};
// ============================================================================
// Template Registry
// ============================================================================
/**
 * All available templates.
 */
exports.TEMPLATES = {
    standard: exports.STANDARD_TEMPLATE,
    lean: exports.LEAN_TEMPLATE,
    enterprise: exports.ENTERPRISE_TEMPLATE,
    technical: exports.TECHNICAL_TEMPLATE,
    'user-story': exports.USER_STORY_TEMPLATE,
};
/**
 * Get template by type.
 */
function getTemplate(type) {
    const template = exports.TEMPLATES[type];
    if (!template) {
        throw new Error(`Unknown template type: ${type}`);
    }
    return template;
}
/**
 * Get all available template types.
 */
function getTemplateTypes() {
    return Object.keys(exports.TEMPLATES);
}
/**
 * Get template metadata for selection UI.
 */
function getTemplateInfo() {
    return Object.values(exports.TEMPLATES).map((t) => ({
        type: t.type,
        name: t.name,
        description: t.description,
        estimatedTime: t.metadata.estimatedCompletionTime,
    }));
}
//# sourceMappingURL=templates.js.map