/**
 * PRD-to-Artifacts Pipeline Unit Tests
 */

import {
  parsePRD,
  detectPRDFormat,
  generateScopeArtifact,
  generatePlanArtifact,
  generateQualityGatesArtifact,
  PRDPipeline,
  ScopeArtifact,
  PlanArtifact,
  QualityGatesArtifact,
} from '../../packages/core/src/prd/prd-pipeline';

import { PRDDocument, TemplateType } from '../../packages/core/src/prd/types';
import { TemplateService } from '../../packages/core/src/prd/template-service';

// ============================================================================
// PRD Parsing Tests
// ============================================================================

describe('PRD Parsers', () => {
  describe('detectPRDFormat', () => {
    it('should detect JSON format', () => {
      const json = '{"templateType": "standard", "sections": []}';
      expect(detectPRDFormat(json)).toBe('json');
    });

    it('should detect Markdown format from heading', () => {
      const markdown = '# Project PRD\n\n## Overview\n\nSome content';
      expect(detectPRDFormat(markdown)).toBe('markdown');
    });

    it('should detect Markdown format from subheading', () => {
      const markdown = 'Content here\n\n## Section\n\nMore content';
      expect(detectPRDFormat(markdown)).toBe('markdown');
    });

    it('should detect Markdown format from bold', () => {
      const markdown = '**Title**: Some description';
      expect(detectPRDFormat(markdown)).toBe('markdown');
    });

    it('should detect Markdown format from list', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      expect(detectPRDFormat(markdown)).toBe('markdown');
    });

    it('should default to text for plain content', () => {
      const text = 'This is just plain text without any formatting markers.';
      expect(detectPRDFormat(text)).toBe('text');
    });

    it('should detect text for invalid JSON', () => {
      const invalid = '{ this is not valid json }';
      expect(detectPRDFormat(invalid)).toBe('text');
    });
  });

  describe('parsePRD', () => {
    it('should parse JSON PRD', () => {
      const mockPrisma = {} as any;
      const service = new TemplateService(mockPrisma);
      const doc = service.createDocument('lean', 'Test PRD', 'user');

      const json = JSON.stringify(doc);
      const parsed = parsePRD(json, 'json');

      expect(parsed.title).toBe('Test PRD');
      expect(parsed.templateType).toBe('lean');
    });

    it('should parse Markdown PRD', () => {
      const markdown = `# My Feature PRD

## Summary

This is a feature description.
`;

      const parsed = parsePRD(markdown, 'markdown', 'standard');

      expect(parsed.title).toBe('My Feature PRD');
      expect(parsed.templateType).toBe('standard');
    });

    it('should parse text PRD', () => {
      const text = 'Build a new user authentication system with OAuth support.';

      const parsed = parsePRD(text, 'text', 'lean');

      expect(parsed.templateType).toBe('lean');
    });

    it('should throw for invalid JSON', () => {
      expect(() => parsePRD('{ invalid json', 'json')).toThrow('Failed to parse JSON PRD');
    });

    it('should throw for unsupported format', () => {
      expect(() => parsePRD('content', 'xml' as any)).toThrow('Unsupported PRD format');
    });
  });
});

// ============================================================================
// SCOPE Artifact Generation Tests
// ============================================================================

describe('generateScopeArtifact', () => {
  const mockPrisma = {} as any;
  const service = new TemplateService(mockPrisma);

  it('should generate SCOPE from standard template', () => {
    let doc = service.createDocument('standard', 'Auth Feature', 'user');
    doc = service.updateField(doc, 'overview', 'summary', 'Implement user authentication');
    doc = service.updateField(doc, 'goals', 'business_goals', ['Secure user data', 'Reduce fraud']);
    doc = service.updateField(doc, 'goals', 'non_goals', ['Social login', 'Biometrics']);

    const scope = generateScopeArtifact(doc);

    expect(scope.version).toBe('1.0.0');
    expect(scope.title).toBe('Auth Feature');
    expect(scope.summary).toBe('Implement user authentication');
    expect(scope.inScope).toContain('Secure user data');
    expect(scope.outOfScope).toContain('Social login');
  });

  it('should generate SCOPE from lean template', () => {
    let doc = service.createDocument('lean', 'Quick Feature', 'user');
    doc = service.updateField(doc, 'summary', 'solution', 'Simple fix');
    doc = service.updateField(doc, 'scope', 'in_scope', ['API change', 'Unit tests']);
    doc = service.updateField(doc, 'scope', 'out_of_scope', ['UI updates']);

    const scope = generateScopeArtifact(doc);

    expect(scope.summary).toBe('Simple fix');
    expect(scope.inScope).toEqual(['API change', 'Unit tests']);
    expect(scope.outOfScope).toEqual(['UI updates']);
  });

  it('should generate SCOPE from enterprise template', () => {
    let doc = service.createDocument('enterprise', 'Enterprise Project', 'user');
    doc = service.updateField(doc, 'executive', 'summary', 'Major initiative');
    doc = service.updateField(doc, 'stakeholders', 'stakeholder_list', ['CTO', 'Security Team']);
    doc = service.updateField(doc, 'compliance', 'regulations', ['SOC2', 'GDPR']);

    const scope = generateScopeArtifact(doc);

    expect(scope.summary).toBe('Major initiative');
    expect(scope.stakeholders).toContain('CTO');
    expect(scope.constraints).toContain('SOC2');
  });

  it('should handle empty fields gracefully', () => {
    const doc = service.createDocument('standard', 'Empty PRD', 'user');

    const scope = generateScopeArtifact(doc);

    expect(scope.title).toBe('Empty PRD');
    expect(scope.summary).toBe('');
    expect(scope.inScope).toEqual([]);
  });
});

// ============================================================================
// PLAN Artifact Generation Tests
// ============================================================================

describe('generatePlanArtifact', () => {
  const mockPrisma = {} as any;
  const service = new TemplateService(mockPrisma);

  it('should generate PLAN from standard template', () => {
    let doc = service.createDocument('standard', 'Feature Plan', 'user');
    doc = service.updateField(doc, 'timeline', 'milestones', [
      'Design complete',
      'Implementation done',
      'Testing finished',
    ]);
    doc = service.updateField(doc, 'timeline', 'dependencies', ['Auth service', 'Database']);

    const plan = generatePlanArtifact(doc);

    expect(plan.version).toBe('1.0.0');
    expect(plan.title).toBe('Feature Plan');
    expect(plan.phases).toHaveLength(3);
    expect(plan.phases[0].name).toBe('Design complete');
    expect(plan.dependencies).toContain('Auth service');
  });

  it('should generate PLAN from lean template', () => {
    let doc = service.createDocument('lean', 'Quick Fix', 'user');
    doc = service.updateField(doc, 'acceptance', 'criteria', [
      'API returns 200',
      'Tests pass',
      'No regressions',
    ]);

    const plan = generatePlanArtifact(doc);

    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].name).toBe('Implementation');
    expect(plan.phases[0].tasks).toHaveLength(3);
    expect(plan.phases[0].tasks[0].title).toBe('API returns 200');
  });

  it('should generate PLAN from user-story template', () => {
    let doc = service.createDocument('user-story', 'User Stories', 'user');
    doc = service.updateField(doc, 'epic', 'epic_description', 'User management epic');
    doc = service.updateField(doc, 'stories', 'story_list',
      'As a user, I want to login\nAs a user, I want to logout'
    );
    doc = service.updateField(doc, 'estimation', 'story_points', 8);

    const plan = generatePlanArtifact(doc);

    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].tasks).toHaveLength(2);
    expect(plan.estimatedEffort).toBe('8 story points');
  });

  it('should create default phase when none extracted', () => {
    const doc = service.createDocument('standard', 'No Milestones', 'user');

    const plan = generatePlanArtifact(doc);

    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].name).toBe('Implementation');
    expect(plan.phases[0].tasks[0].title).toBe('Complete PRD requirements');
  });

  it('should extract risks from standard template', () => {
    let doc = service.createDocument('standard', 'Risky Project', 'user');
    doc = service.updateField(doc, 'timeline', 'milestones', ['Phase 1']);
    doc = service.updateField(doc, 'timeline', 'risks', 'Third-party API may be unavailable');

    const plan = generatePlanArtifact(doc);

    expect(plan.risks).toHaveLength(1);
    expect(plan.risks[0].description).toContain('Third-party API');
  });
});

// ============================================================================
// QUALITY_GATES Artifact Generation Tests
// ============================================================================

describe('generateQualityGatesArtifact', () => {
  const mockPrisma = {} as any;
  const service = new TemplateService(mockPrisma);

  it('should generate default gates for all templates', () => {
    const doc = service.createDocument('standard', 'Project', 'user');

    const gates = generateQualityGatesArtifact(doc);

    expect(gates.version).toBe('1.0.0');
    // Should have CI pass, review, and PRD review gates
    expect(gates.gates.length).toBeGreaterThanOrEqual(3);
    expect(gates.gates.find(g => g.id === 'gate-ci-pass')).toBeDefined();
    expect(gates.gates.find(g => g.id === 'gate-review')).toBeDefined();
    expect(gates.gates.find(g => g.id === 'gate-prd-review')).toBeDefined();
  });

  it('should add security gates for enterprise template', () => {
    const doc = service.createDocument('enterprise', 'Enterprise', 'user');

    const gates = generateQualityGatesArtifact(doc);

    const securityGate = gates.gates.find(g => g.id === 'gate-security');
    const complianceGate = gates.gates.find(g => g.id === 'gate-compliance');

    expect(securityGate).toBeDefined();
    expect(securityGate!.action).toBe('block');
    expect(complianceGate).toBeDefined();
    expect(complianceGate!.trigger).toBe('manual');
  });

  it('should add coverage gate for technical template', () => {
    const doc = service.createDocument('technical', 'Tech Spec', 'user');

    const gates = generateQualityGatesArtifact(doc);

    const coverageGate = gates.gates.find(g => g.id === 'gate-coverage');
    const lintGate = gates.gates.find(g => g.id === 'gate-lint');

    expect(coverageGate).toBeDefined();
    expect(coverageGate!.conditions[0].value).toBe(80);
    expect(lintGate).toBeDefined();
    expect(lintGate!.trigger).toBe('pre_commit');
  });

  it('should always require PRD artifacts review', () => {
    const doc = service.createDocument('lean', 'Quick', 'user');

    const gates = generateQualityGatesArtifact(doc);

    const prdGate = gates.gates.find(g => g.id === 'gate-prd-review');
    expect(prdGate).toBeDefined();
    expect(prdGate!.required).toBe(true);
    expect(prdGate!.trigger).toBe('manual');
  });
});

// ============================================================================
// Pipeline Service Tests
// ============================================================================

describe('PRDPipeline', () => {
  const mockPrisma = {
    artifact: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    workflowEvent: {
      create: jest.fn(),
    },
    approval: {
      findFirst: jest.fn(),
    },
  } as any;

  let pipeline: PRDPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new PRDPipeline(mockPrisma);
  });

  describe('run', () => {
    it('should run full pipeline and create artifacts', async () => {
      mockPrisma.artifact.create
        .mockResolvedValueOnce({ id: 'prd-1' })
        .mockResolvedValueOnce({ id: 'scope-1' })
        .mockResolvedValueOnce({ id: 'plan-1' })
        .mockResolvedValueOnce({ id: 'gates-1' });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });

      const markdown = `# Test PRD

## Summary
Build a feature.
`;

      const result = await pipeline.run('workflow-123', markdown, 'markdown', 'lean');

      expect(result.prdDocument).toBeDefined();
      expect(result.scope).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.qualityGates).toBeDefined();
      expect(result.artifactIds).toEqual({
        prd: 'prd-1',
        scope: 'scope-1',
        plan: 'plan-1',
        qualityGates: 'gates-1',
      });
      expect(result.requiresApproval).toBe(true);
      expect(mockPrisma.artifact.create).toHaveBeenCalledTimes(4);
      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: 'workflow-123',
          type: 'ARTIFACTS_GENERATED',
        }),
      });
    });

    it('should auto-detect format when not provided', async () => {
      mockPrisma.artifact.create.mockResolvedValue({ id: 'artifact-1' });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });

      const json = JSON.stringify({
        templateType: 'lean',
        sections: [],
        title: 'JSON PRD',
        id: 'prd-test',
        templateId: 'lean-v1',
        version: '1.0.0',
        status: 'draft',
        metadata: { createdBy: 'test', createdAt: new Date(), updatedAt: new Date() },
      });

      const result = await pipeline.run('workflow-123', json);

      expect(result.prdDocument.title).toBe('JSON PRD');
    });
  });

  describe('requestApproval', () => {
    it('should create approval event', async () => {
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });

      const result = await pipeline.requestApproval('workflow-123', {
        prd: 'prd-1',
        scope: 'scope-1',
        plan: 'plan-1',
        qualityGates: 'gates-1',
      });

      expect(result.approvalRequired).toBe(true);
      expect(result.message).toContain('require human review');
      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'APPROVAL_REQUIRED',
        }),
      });
    });
  });

  describe('checkApproval', () => {
    it('should return true when approval exists', async () => {
      mockPrisma.approval.findFirst.mockResolvedValue({ id: 'approval-1' });

      const approved = await pipeline.checkApproval('workflow-123');

      expect(approved).toBe(true);
      expect(mockPrisma.approval.findFirst).toHaveBeenCalledWith({
        where: {
          workflowId: 'workflow-123',
          kind: 'prd_artifacts',
        },
      });
    });

    it('should return false when no approval', async () => {
      mockPrisma.approval.findFirst.mockResolvedValue(null);

      const approved = await pipeline.checkApproval('workflow-123');

      expect(approved).toBe(false);
    });
  });

  describe('loadArtifacts', () => {
    it('should load all artifact types', async () => {
      const mockService = new TemplateService({} as any);
      const mockDoc = mockService.createDocument('lean', 'Test', 'user');

      mockPrisma.artifact.findMany.mockResolvedValue([
        { kind: 'PRD', content: JSON.stringify(mockDoc) },
        { kind: 'SCOPE', content: JSON.stringify({ version: '1.0.0', title: 'Test' }) },
        { kind: 'PLAN', content: JSON.stringify({ version: '1.0.0', phases: [] }) },
        { kind: 'QUALITY_GATES', content: JSON.stringify({ version: '1.0.0', gates: [] }) },
      ]);

      const artifacts = await pipeline.loadArtifacts('workflow-123');

      expect(artifacts.prd).toBeDefined();
      expect(artifacts.scope).toBeDefined();
      expect(artifacts.plan).toBeDefined();
      expect(artifacts.qualityGates).toBeDefined();
    });

    it('should return empty object when no artifacts', async () => {
      mockPrisma.artifact.findMany.mockResolvedValue([]);

      const artifacts = await pipeline.loadArtifacts('workflow-123');

      expect(artifacts).toEqual({});
    });
  });
});

// ============================================================================
// List Item Extraction Tests
// ============================================================================

describe('List Item Extraction', () => {
  const mockPrisma = {} as any;
  const service = new TemplateService(mockPrisma);

  it('should extract array items', () => {
    let doc = service.createDocument('lean', 'Test', 'user');
    doc = service.updateField(doc, 'scope', 'in_scope', ['Item 1', 'Item 2']);

    const scope = generateScopeArtifact(doc);

    expect(scope.inScope).toEqual(['Item 1', 'Item 2']);
  });

  it('should extract items from string with newlines', () => {
    let doc = service.createDocument('standard', 'Test', 'user');
    doc = service.updateField(doc, 'goals', 'business_goals', 'Goal 1\nGoal 2\nGoal 3');

    const scope = generateScopeArtifact(doc);

    expect(scope.inScope).toEqual(['Goal 1', 'Goal 2', 'Goal 3']);
  });

  it('should strip list markers', () => {
    let doc = service.createDocument('standard', 'Test', 'user');
    doc = service.updateField(doc, 'goals', 'business_goals', '- Item A\n* Item B\n• Item C');

    const scope = generateScopeArtifact(doc);

    expect(scope.inScope).toEqual(['Item A', 'Item B', 'Item C']);
  });
});

// ============================================================================
// End-to-End Test
// ============================================================================

describe('End-to-End: PRD → Artifacts → Approval Gate', () => {
  it('should process PRD through full pipeline', async () => {
    const mockPrisma = {
      artifact: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `artifact-${data.kind}`,
        })),
      },
      workflowEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      approval: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;

    const pipeline = new PRDPipeline(mockPrisma);

    // 1. Create PRD content
    const prdMarkdown = `# User Authentication Feature

## Overview
Implement secure user authentication with OAuth 2.0 support.

## Goals
- Secure login flow
- OAuth integration
- Session management

## Requirements
Users should be able to login with email/password or OAuth providers.
`;

    // 2. Run pipeline
    const result = await pipeline.run('workflow-test', prdMarkdown, 'markdown', 'standard');

    // 3. Verify artifacts generated
    expect(result.prdDocument.title).toBe('User Authentication Feature');
    expect(result.scope.title).toBe('User Authentication Feature');
    expect(result.plan.title).toBe('User Authentication Feature');
    expect(result.qualityGates.gates.length).toBeGreaterThan(0);

    // 4. Check approval requirement
    expect(result.requiresApproval).toBe(true);

    // 5. Request approval
    const approvalResult = await pipeline.requestApproval('workflow-test', result.artifactIds);
    expect(approvalResult.approvalRequired).toBe(true);

    // 6. Check approval status (should be false initially)
    const approved = await pipeline.checkApproval('workflow-test');
    expect(approved).toBe(false);
  });
});
