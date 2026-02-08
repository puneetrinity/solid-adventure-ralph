/**
 * PRD Templates Unit Tests
 */

import {
  TEMPLATES,
  STANDARD_TEMPLATE,
  LEAN_TEMPLATE,
  ENTERPRISE_TEMPLATE,
  TECHNICAL_TEMPLATE,
  USER_STORY_TEMPLATE,
  getTemplate,
  getTemplateTypes,
  getTemplateInfo,
} from '../../packages/core/src/prd/templates';

import {
  TemplateService,
  renderDocumentToMarkdown,
  parseMarkdownToPRD,
} from '../../packages/core/src/prd/template-service';

import {
  TemplateType,
  PRDDocument,
  PRDTemplate,
} from '../../packages/core/src/prd/types';

// ============================================================================
// Template Structure Tests
// ============================================================================

describe('PRD Templates', () => {
  describe('Template Registry', () => {
    it('should have all 5 template types', () => {
      const types = getTemplateTypes();
      expect(types).toHaveLength(5);
      expect(types).toContain('standard');
      expect(types).toContain('lean');
      expect(types).toContain('enterprise');
      expect(types).toContain('technical');
      expect(types).toContain('user-story');
    });

    it('should return template by type', () => {
      const standard = getTemplate('standard');
      expect(standard).toBe(STANDARD_TEMPLATE);
      expect(standard.type).toBe('standard');
    });

    it('should throw for unknown template type', () => {
      expect(() => getTemplate('unknown' as TemplateType)).toThrow(
        'Unknown template type: unknown'
      );
    });

    it('should return template info for selection', () => {
      const info = getTemplateInfo();
      expect(info).toHaveLength(5);
      for (const item of info) {
        expect(item.type).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.description).toBeDefined();
      }
    });
  });

  describe('Standard Template', () => {
    it('should have required sections', () => {
      expect(STANDARD_TEMPLATE.sections.length).toBeGreaterThanOrEqual(5);
      const sectionIds = STANDARD_TEMPLATE.sections.map((s) => s.id);
      expect(sectionIds).toContain('overview');
      expect(sectionIds).toContain('goals');
      expect(sectionIds).toContain('requirements');
    });

    it('should have version and metadata', () => {
      expect(STANDARD_TEMPLATE.version).toBe('1.0.0');
      expect(STANDARD_TEMPLATE.metadata.tags).toContain('general');
    });

    it('should have required fields in overview', () => {
      const overview = STANDARD_TEMPLATE.sections.find((s) => s.id === 'overview');
      expect(overview).toBeDefined();
      const requiredFields = overview!.fields.filter((f) => f.required);
      expect(requiredFields.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Lean Template', () => {
    it('should have minimal sections', () => {
      expect(LEAN_TEMPLATE.sections.length).toBeLessThanOrEqual(4);
    });

    it('should have quick completion time', () => {
      expect(LEAN_TEMPLATE.metadata.estimatedCompletionTime).toContain('minutes');
    });

    it('should include scope section', () => {
      const scope = LEAN_TEMPLATE.sections.find((s) => s.id === 'scope');
      expect(scope).toBeDefined();
      expect(scope!.fields.some((f) => f.id === 'in_scope')).toBe(true);
      expect(scope!.fields.some((f) => f.id === 'out_of_scope')).toBe(true);
    });
  });

  describe('Enterprise Template', () => {
    it('should have compliance section', () => {
      const compliance = ENTERPRISE_TEMPLATE.sections.find(
        (s) => s.id === 'compliance'
      );
      expect(compliance).toBeDefined();
      expect(compliance!.fields.some((f) => f.id === 'regulations')).toBe(true);
      expect(compliance!.fields.some((f) => f.id === 'data_classification')).toBe(
        true
      );
    });

    it('should have security section', () => {
      const security = ENTERPRISE_TEMPLATE.sections.find(
        (s) => s.id === 'security'
      );
      expect(security).toBeDefined();
      expect(security!.fields.some((f) => f.id === 'threat_model')).toBe(true);
    });

    it('should have stakeholder section', () => {
      const stakeholders = ENTERPRISE_TEMPLATE.sections.find(
        (s) => s.id === 'stakeholders'
      );
      expect(stakeholders).toBeDefined();
      expect(stakeholders!.fields.some((f) => f.id === 'approval_chain')).toBe(
        true
      );
    });

    it('should target executives and compliance officers', () => {
      expect(ENTERPRISE_TEMPLATE.metadata.targetAudience).toContain('executives');
      expect(ENTERPRISE_TEMPLATE.metadata.targetAudience).toContain(
        'compliance-officers'
      );
    });
  });

  describe('Technical Template', () => {
    it('should have interface design section', () => {
      const interface_ = TECHNICAL_TEMPLATE.sections.find(
        (s) => s.id === 'interface'
      );
      expect(interface_).toBeDefined();
      expect(interface_!.fields.some((f) => f.id === 'api_endpoints')).toBe(true);
    });

    it('should have data model section', () => {
      const data = TECHNICAL_TEMPLATE.sections.find((s) => s.id === 'data');
      expect(data).toBeDefined();
      expect(data!.fields.some((f) => f.id === 'entities')).toBe(true);
    });

    it('should have deployment section', () => {
      const deployment = TECHNICAL_TEMPLATE.sections.find(
        (s) => s.id === 'deployment'
      );
      expect(deployment).toBeDefined();
      expect(deployment!.fields.some((f) => f.id === 'rollout')).toBe(true);
      expect(deployment!.fields.some((f) => f.id === 'rollback')).toBe(true);
    });

    it('should target engineers', () => {
      expect(TECHNICAL_TEMPLATE.metadata.targetAudience).toContain('engineers');
    });
  });

  describe('User Story Template', () => {
    it('should have epic section', () => {
      const epic = USER_STORY_TEMPLATE.sections.find((s) => s.id === 'epic');
      expect(epic).toBeDefined();
      expect(epic!.fields.some((f) => f.id === 'user_persona')).toBe(true);
    });

    it('should have stories section', () => {
      const stories = USER_STORY_TEMPLATE.sections.find((s) => s.id === 'stories');
      expect(stories).toBeDefined();
      expect(stories!.fields.some((f) => f.id === 'story_list')).toBe(true);
    });

    it('should have acceptance criteria section', () => {
      const acceptance = USER_STORY_TEMPLATE.sections.find(
        (s) => s.id === 'acceptance'
      );
      expect(acceptance).toBeDefined();
      expect(acceptance!.fields.some((f) => f.id === 'given_when_then')).toBe(
        true
      );
    });

    it('should have estimation section with priority', () => {
      const estimation = USER_STORY_TEMPLATE.sections.find(
        (s) => s.id === 'estimation'
      );
      expect(estimation).toBeDefined();
      const priority = estimation!.fields.find((f) => f.id === 'priority');
      expect(priority).toBeDefined();
      expect(priority!.options).toContain('Critical');
      expect(priority!.options).toContain('High');
    });

    it('should be tagged as agile', () => {
      expect(USER_STORY_TEMPLATE.metadata.tags).toContain('agile');
    });
  });
});

// ============================================================================
// Template Service Tests
// ============================================================================

describe('TemplateService', () => {
  const mockPrisma = {
    artifact: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    workflow: {
      create: jest.fn(),
    },
  } as any;

  let service: TemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TemplateService(mockPrisma);
  });

  describe('getAvailableTemplates', () => {
    it('should return all templates', () => {
      const templates = service.getAvailableTemplates();
      expect(templates).toHaveLength(5);
    });
  });

  describe('suggestTemplate', () => {
    it('should suggest enterprise for compliance projects', () => {
      expect(service.suggestTemplate({ hasCompliance: true })).toBe('enterprise');
    });

    it('should suggest technical for technical specs', () => {
      expect(service.suggestTemplate({ isTechnicalSpec: true })).toBe('technical');
    });

    it('should suggest user-story for agile', () => {
      expect(service.suggestTemplate({ isAgile: true })).toBe('user-story');
    });

    it('should suggest lean for quick iterations', () => {
      expect(service.suggestTemplate({ isQuickIteration: true })).toBe('lean');
    });

    it('should default to standard', () => {
      expect(service.suggestTemplate({})).toBe('standard');
    });
  });

  describe('createDocument', () => {
    it('should create document from template', () => {
      const doc = service.createDocument('lean', 'Test PRD', 'user@test.com');

      expect(doc.templateType).toBe('lean');
      expect(doc.title).toBe('Test PRD');
      expect(doc.status).toBe('draft');
      expect(doc.metadata.createdBy).toBe('user@test.com');
    });

    it('should include workflow ID if provided', () => {
      const doc = service.createDocument(
        'standard',
        'Test PRD',
        'user@test.com',
        'workflow-123'
      );

      expect(doc.metadata.workflowId).toBe('workflow-123');
    });

    it('should create empty sections from template', () => {
      const doc = service.createDocument('lean', 'Test', 'user');

      expect(doc.sections.length).toBe(LEAN_TEMPLATE.sections.length);
      for (const section of doc.sections) {
        expect(section.fields.length).toBeGreaterThan(0);
      }
    });
  });

  describe('updateField', () => {
    it('should update field value', () => {
      const doc = service.createDocument('lean', 'Test', 'user');
      const updated = service.updateField(doc, 'summary', 'title', 'New Title');

      const summarySection = updated.sections.find(
        (s) => s.sectionId === 'summary'
      );
      const titleField = summarySection?.fields.find(
        (f) => f.fieldId === 'title'
      );

      expect(titleField?.value).toBe('New Title');
    });

    it('should update metadata timestamp', () => {
      const doc = service.createDocument('lean', 'Test', 'user');
      const originalTime = doc.metadata.updatedAt;

      // Small delay to ensure time difference
      const updated = service.updateField(doc, 'summary', 'title', 'New Title');

      expect(updated.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalTime.getTime()
      );
    });
  });

  describe('validateDocument', () => {
    it('should validate complete document', () => {
      const doc = service.createDocument('lean', 'Test', 'user');

      // Fill required fields
      let updated = service.updateField(doc, 'summary', 'title', 'Feature X');
      updated = service.updateField(updated, 'summary', 'problem', 'Users need X');
      updated = service.updateField(
        updated,
        'summary',
        'solution',
        'Build feature X'
      );
      updated = service.updateField(updated, 'scope', 'in_scope', ['Item 1']);
      updated = service.updateField(updated, 'scope', 'out_of_scope', ['Item 2']);
      updated = service.updateField(updated, 'acceptance', 'criteria', [
        'Works correctly',
      ]);

      const result = service.validateDocument(updated);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required fields', () => {
      const doc = service.createDocument('lean', 'Test', 'user');
      const result = service.validateDocument(doc);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === 'REQUIRED_FIELD_EMPTY')).toBe(
        true
      );
    });

    it('should calculate completeness percentage', () => {
      const doc = service.createDocument('lean', 'Test', 'user');
      let updated = service.updateField(doc, 'summary', 'title', 'Test');

      const result = service.validateDocument(updated);

      expect(result.completeness).toBeGreaterThan(0);
      expect(result.completeness).toBeLessThan(100);
    });
  });

  describe('saveAsArtifact', () => {
    it('should save document as artifact', async () => {
      mockPrisma.artifact.create.mockResolvedValue({ id: 'artifact-123' });

      const doc = service.createDocument('lean', 'Test', 'user');
      const artifactId = await service.saveAsArtifact(doc, 'workflow-123');

      expect(artifactId).toBe('artifact-123');
      expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'PRD',
          workflowId: 'workflow-123',
        }),
      });
    });
  });

  describe('loadFromArtifact', () => {
    it('should load document from artifact', async () => {
      const doc = service.createDocument('lean', 'Test', 'user');
      mockPrisma.artifact.findUnique.mockResolvedValue({
        id: 'artifact-123',
        kind: 'PRD',
        content: JSON.stringify(doc),
      });

      const loaded = await service.loadFromArtifact('artifact-123');

      expect(loaded).toBeDefined();
      expect(loaded?.title).toBe('Test');
      expect(loaded?.templateType).toBe('lean');
    });

    it('should return null for non-PRD artifact', async () => {
      mockPrisma.artifact.findUnique.mockResolvedValue({
        id: 'artifact-123',
        kind: 'SCOPE',
        content: '{}',
      });

      const loaded = await service.loadFromArtifact('artifact-123');

      expect(loaded).toBeNull();
    });
  });

  describe('createWorkflowWithTemplate', () => {
    it('should create workflow and PRD document', async () => {
      mockPrisma.workflow.create.mockResolvedValue({ id: 'workflow-123' });
      mockPrisma.artifact.create.mockResolvedValue({ id: 'artifact-123' });

      const result = await service.createWorkflowWithTemplate(
        'owner/repo',
        'PRD content',
        'standard',
        'user@test.com'
      );

      expect(result.workflowId).toBe('workflow-123');
      expect(result.documentId).toBe('artifact-123');
      expect(mockPrisma.workflow.create).toHaveBeenCalledWith({
        data: {
          state: 'PENDING',
        },
      });
      // Repo info stored in artifact metadata, not workflow
      expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'PRD',
          workflowId: 'workflow-123',
        }),
      });
    });
  });
});

// ============================================================================
// Markdown Rendering Tests
// ============================================================================

describe('renderDocumentToMarkdown', () => {
  it('should render document to markdown', () => {
    const mockPrisma = {} as any;
    const service = new TemplateService(mockPrisma);
    const doc = service.createDocument('lean', 'Test PRD', 'user');

    let updated = service.updateField(doc, 'summary', 'title', 'Feature X');
    updated = service.updateField(updated, 'summary', 'problem', 'Problem description');

    const markdown = renderDocumentToMarkdown(updated);

    expect(markdown).toContain('# Test PRD');
    expect(markdown).toContain('**Template:** lean');
    expect(markdown).toContain('**Feature Title:**');
    expect(markdown).toContain('Feature X');
    expect(markdown).toContain('Problem description');
  });

  it('should render arrays as lists', () => {
    const mockPrisma = {} as any;
    const service = new TemplateService(mockPrisma);
    const doc = service.createDocument('lean', 'Test', 'user');

    const updated = service.updateField(doc, 'scope', 'in_scope', [
      'Item 1',
      'Item 2',
      'Item 3',
    ]);

    const markdown = renderDocumentToMarkdown(updated);

    expect(markdown).toContain('- Item 1');
    expect(markdown).toContain('- Item 2');
    expect(markdown).toContain('- Item 3');
  });
});

describe('parseMarkdownToPRD', () => {
  it('should extract title from markdown', () => {
    const markdown = `# My Feature PRD

## Summary
Some content here
`;

    const doc = parseMarkdownToPRD(markdown, 'lean', 'user@test.com');

    expect(doc.title).toBe('My Feature PRD');
    expect(doc.templateType).toBe('lean');
    expect(doc.metadata.createdBy).toBe('user@test.com');
  });

  it('should create empty sections from template', () => {
    const markdown = '# Test PRD';
    const doc = parseMarkdownToPRD(markdown, 'standard', 'user');

    expect(doc.sections.length).toBe(STANDARD_TEMPLATE.sections.length);
  });
});

// ============================================================================
// Field Type Tests
// ============================================================================

describe('Field Types', () => {
  it('should have enum fields with options', () => {
    const classification = ENTERPRISE_TEMPLATE.sections
      .flatMap((s) => s.fields)
      .find((f) => f.id === 'data_classification');

    expect(classification).toBeDefined();
    expect(classification!.type).toBe('enum');
    expect(classification!.options).toContain('Confidential');
  });

  it('should have number fields', () => {
    const storyPoints = USER_STORY_TEMPLATE.sections
      .flatMap((s) => s.fields)
      .find((f) => f.id === 'story_points');

    expect(storyPoints).toBeDefined();
    expect(storyPoints!.type).toBe('number');
  });

  it('should have list fields', () => {
    const milestones = STANDARD_TEMPLATE.sections
      .flatMap((s) => s.fields)
      .find((f) => f.id === 'milestones');

    expect(milestones).toBeDefined();
    expect(milestones!.type).toBe('list');
  });
});
