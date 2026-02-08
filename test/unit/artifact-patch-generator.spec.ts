/**
 * Tests for Artifact and Patch Generators
 */

import {
  ArtifactGenerator,
  PatchGenerator,
  StubLLMProvider,
  LLMRunner,
  decisionOutputSchema,
  planOutputSchema,
  toPrismaPatchData,
  patchAddsTests,
  type Decision,
  type Plan,
  type PatchProposal,
  type ArtifactInput,
  type PatchInput
} from '../../packages/core/src/llm';

describe('ArtifactGenerator', () => {
  let provider: StubLLMProvider;
  let runner: LLMRunner;
  let generator: ArtifactGenerator;

  beforeEach(() => {
    provider = new StubLLMProvider();
    runner = new LLMRunner({ provider });
    generator = new ArtifactGenerator({ runner, useFallback: true });
  });

  const mockInput: ArtifactInput = {
    workflowId: 'wf-123',
    issueContent: 'Add a new feature to improve user authentication',
    repoContext: {
      owner: 'test-owner',
      repo: 'test-repo',
      baseSha: 'abc123'
    }
  };

  describe('generateDecision', () => {
    it('should generate decision from valid LLM response', async () => {
      const mockDecision: Decision = {
        recommendation: 'PROCEED',
        summary: 'This is a well-scoped feature request for authentication improvements',
        rationale: 'The request is clear and aligns with security best practices',
        concerns: ['May require additional testing'],
        estimatedComplexity: 'medium'
      };

      provider.setResponse('architect', JSON.stringify(mockDecision));

      const result = await generator.generateDecision(mockInput);

      expect(result.success).toBe(true);
      expect(result.artifact).toEqual(mockDecision);
      expect(result.markdown).toContain('# Decision');
      expect(result.markdown).toContain('PROCEED');
      expect(result.metadata?.usedFallback).toBe(false);
    });

    it('should use fallback when LLM returns invalid response', async () => {
      provider.setResponse('architect', 'invalid json');

      const result = await generator.generateDecision(mockInput);

      expect(result.success).toBe(true);
      expect(result.artifact?.recommendation).toBe('DEFER');
      expect(result.metadata?.usedFallback).toBe(true);
    });

    it('should fail without fallback when LLM fails', async () => {
      const noFallbackGenerator = new ArtifactGenerator({ runner, useFallback: false });
      provider.setResponse('architect', 'invalid json');

      const result = await noFallbackGenerator.generateDecision(mockInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PARSE_ERROR');
    });

    it('should include concerns in markdown output', async () => {
      const mockDecision: Decision = {
        recommendation: 'CLARIFY',
        summary: 'Need more details about the requirements',
        rationale: 'The issue lacks specific acceptance criteria',
        concerns: ['Scope unclear', 'No timeline specified'],
        prerequisites: ['Define acceptance criteria'],
        estimatedComplexity: 'high'
      };

      provider.setResponse('architect', JSON.stringify(mockDecision));

      const result = await generator.generateDecision(mockInput);

      expect(result.markdown).toContain('## Concerns');
      expect(result.markdown).toContain('Scope unclear');
      expect(result.markdown).toContain('## Prerequisites');
    });
  });

  describe('generatePlan', () => {
    const mockDecision: Decision = {
      recommendation: 'PROCEED',
      summary: 'Approved for implementation',
      rationale: 'Clear requirements',
      concerns: [],
      estimatedComplexity: 'low'
    };

    it('should generate plan from valid LLM response', async () => {
      const mockPlan: Plan = {
        title: 'Authentication Improvements Plan',
        overview: 'This plan covers the implementation of new auth features',
        tasks: [
          {
            id: 'T1',
            title: 'Add OAuth provider',
            description: 'Implement OAuth2 authentication',
            type: 'feature',
            files: ['src/auth/oauth.ts'],
            acceptanceCriteria: ['OAuth flow works', 'Tokens stored securely']
          }
        ],
        dependencies: [],
        risks: [
          {
            description: 'OAuth provider may change API',
            severity: 'low',
            mitigation: 'Use well-documented provider'
          }
        ]
      };

      provider.setResponse('architect', JSON.stringify(mockPlan));

      const result = await generator.generatePlan(mockInput, mockDecision);

      expect(result.success).toBe(true);
      expect(result.artifact).toEqual(mockPlan);
      expect(result.markdown).toContain('Authentication Improvements Plan');
      expect(result.markdown).toContain('## Tasks');
      expect(result.markdown).toContain('## Risks');
    });

    it('should use fallback when LLM fails', async () => {
      provider.setResponse('architect', 'invalid');

      const result = await generator.generatePlan(mockInput, mockDecision);

      expect(result.success).toBe(true);
      expect(result.artifact?.title).toContain('Fallback Plan');
      expect(result.metadata?.usedFallback).toBe(true);
    });
  });
});

describe('PatchGenerator', () => {
  let provider: StubLLMProvider;
  let runner: LLMRunner;
  let generator: PatchGenerator;

  beforeEach(() => {
    provider = new StubLLMProvider();
    runner = new LLMRunner({ provider });
    generator = new PatchGenerator({ runner, useFallback: true });
  });

  const mockPlan: Plan = {
    title: 'Test Plan',
    overview: 'Test overview',
    tasks: [
      {
        id: 'T1',
        title: 'Add feature',
        description: 'Add a new feature',
        type: 'feature',
        files: ['src/feature.ts'],
        acceptanceCriteria: ['Feature works']
      }
    ],
    dependencies: [],
    risks: []
  };

  const mockInput: PatchInput = {
    workflowId: 'wf-123',
    task: mockPlan.tasks[0],
    plan: mockPlan,
    repoContext: {
      owner: 'test-owner',
      repo: 'test-repo',
      baseSha: 'abc123',
      existingFiles: [
        { path: 'src/feature.ts', content: 'export const old = 1;' }
      ]
    }
  };

  describe('generatePatch', () => {
    it('should generate patch from valid LLM response', async () => {
      const mockProposal: PatchProposal = {
        taskId: 'T1',
        title: 'Add new feature',
        summary: 'Implements the requested feature',
        files: [
          {
            path: 'src/feature.ts',
            action: 'modify',
            content: 'export const newFeature = 1;\nexport const old = 1;',
            additions: 0,
            deletions: 0
          }
        ],
        testSuggestions: ['Add unit test for newFeature'],
        riskLevel: 'low',
        proposedCommands: ['npm test']
      };

      provider.setResponse('coder', JSON.stringify(mockProposal));

      const result = await generator.generatePatch(mockInput);

      expect(result.success).toBe(true);
      expect(result.proposal?.taskId).toBe('T1');
      expect(result.diff).toContain('diff --git');
      expect(result.metadata?.usedFallback).toBe(false);
    });

    it('should generate unified diff for modified files', async () => {
      const mockProposal: PatchProposal = {
        taskId: 'T1',
        title: 'Modify feature',
        summary: 'Updates the feature',
        files: [
          {
            path: 'src/feature.ts',
            action: 'modify',
            content: 'export const newValue = 2;',
            additions: 0,
            deletions: 0
          }
        ],
        testSuggestions: [],
        riskLevel: 'low',
        proposedCommands: []
      };

      provider.setResponse('coder', JSON.stringify(mockProposal));

      const result = await generator.generatePatch(mockInput);

      expect(result.success).toBe(true);
      expect(result.diff).toContain('-export const old = 1;');
      expect(result.diff).toContain('+export const newValue = 2;');
    });

    it('should use fallback when LLM fails', async () => {
      provider.setResponse('coder', 'invalid json');

      const result = await generator.generatePatch(mockInput);

      expect(result.success).toBe(true);
      expect(result.proposal?.title).toContain('Fallback');
      expect(result.proposal?.files[0].path).toBe('TODO.md');
      expect(result.metadata?.usedFallback).toBe(true);
    });

    it('should handle new file creation', async () => {
      const mockProposal: PatchProposal = {
        taskId: 'T1',
        title: 'Create new file',
        summary: 'Creates a new file',
        files: [
          {
            path: 'src/new-file.ts',
            action: 'create',
            content: 'export const newFile = true;',
            additions: 0,
            deletions: 0
          }
        ],
        testSuggestions: [],
        riskLevel: 'low',
        proposedCommands: []
      };

      provider.setResponse('coder', JSON.stringify(mockProposal));

      const result = await generator.generatePatch(mockInput);

      expect(result.success).toBe(true);
      expect(result.diff).toContain('src/new-file.ts');
      expect(result.proposal?.files[0].additions).toBeGreaterThan(0);
    });
  });

  describe('generatePatchesForPlan', () => {
    it('should generate patches for all tasks', async () => {
      const multiTaskPlan: Plan = {
        title: 'Multi-task Plan',
        overview: 'Plan with multiple tasks',
        tasks: [
          { id: 'T1', title: 'Task 1', description: 'First task', type: 'feature', files: [], acceptanceCriteria: [] },
          { id: 'T2', title: 'Task 2', description: 'Second task', type: 'feature', files: [], acceptanceCriteria: [] }
        ],
        dependencies: [],
        risks: []
      };

      // Use fallback for simplicity
      provider.setResponse('coder', 'invalid');

      const results = await generator.generatePatchesForPlan(
        'wf-123',
        multiTaskPlan,
        {
          owner: 'owner',
          repo: 'repo',
          baseSha: 'sha',
          existingFiles: []
        }
      );

      expect(results.length).toBe(2);
      expect(results[0].proposal?.taskId).toBe('T1');
      expect(results[1].proposal?.taskId).toBe('T2');
    });
  });
});

describe('toPrismaPatchData', () => {
  it('should convert patch proposal to Prisma format', () => {
    const proposal: PatchProposal = {
      taskId: 'T1',
      title: 'Test Patch',
      summary: 'Test summary',
      files: [
        { path: 'a.ts', action: 'modify', diff: 'diff content', additions: 5, deletions: 2 },
        { path: 'b.ts', action: 'create', diff: 'new file', additions: 10, deletions: 0 }
      ],
      testSuggestions: ['Add test'],
      riskLevel: 'medium',
      proposedCommands: ['npm test']
    };

    const result = toPrismaPatchData(proposal);

    expect(result.taskId).toBe('T1');
    expect(result.title).toBe('Test Patch');
    expect(result.summary).toBe('Test summary');
    expect(result.diff).toContain('diff content');
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual({ path: 'a.ts', additions: 5, deletions: 2 });
    expect(result.addsTests).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.proposedCommands).toEqual(['npm test']);
  });
});

describe('patchAddsTests', () => {
  it('should detect test files', () => {
    const withTests: PatchProposal = {
      taskId: 'T1',
      title: 'Test',
      summary: 'Test',
      files: [
        { path: 'src/feature.test.ts', action: 'create', additions: 10, deletions: 0 }
      ],
      testSuggestions: [],
      riskLevel: 'low',
      proposedCommands: []
    };

    expect(patchAddsTests(withTests)).toBe(true);
  });

  it('should detect spec files', () => {
    const withSpecs: PatchProposal = {
      taskId: 'T1',
      title: 'Test',
      summary: 'Test',
      files: [
        { path: 'src/feature.spec.ts', action: 'create', additions: 10, deletions: 0 }
      ],
      testSuggestions: [],
      riskLevel: 'low',
      proposedCommands: []
    };

    expect(patchAddsTests(withSpecs)).toBe(true);
  });

  it('should detect __tests__ directory', () => {
    const withTestDir: PatchProposal = {
      taskId: 'T1',
      title: 'Test',
      summary: 'Test',
      files: [
        { path: 'src/__tests__/feature.ts', action: 'create', additions: 10, deletions: 0 }
      ],
      testSuggestions: [],
      riskLevel: 'low',
      proposedCommands: []
    };

    expect(patchAddsTests(withTestDir)).toBe(true);
  });

  it('should detect test/ directory', () => {
    const withTestDir: PatchProposal = {
      taskId: 'T1',
      title: 'Test',
      summary: 'Test',
      files: [
        { path: 'test/unit/feature.ts', action: 'create', additions: 10, deletions: 0 }
      ],
      testSuggestions: [],
      riskLevel: 'low',
      proposedCommands: []
    };

    expect(patchAddsTests(withTestDir)).toBe(true);
  });

  it('should return false for non-test files', () => {
    const noTests: PatchProposal = {
      taskId: 'T1',
      title: 'Test',
      summary: 'Test',
      files: [
        { path: 'src/feature.ts', action: 'create', additions: 10, deletions: 0 }
      ],
      testSuggestions: [],
      riskLevel: 'low',
      proposedCommands: []
    };

    expect(patchAddsTests(noTests)).toBe(false);
  });
});

describe('Schema Validation', () => {
  describe('decisionOutputSchema', () => {
    it('should validate valid decision', () => {
      const valid: Decision = {
        recommendation: 'PROCEED',
        summary: 'This is a valid summary text',
        rationale: 'This is a valid rationale text',
        concerns: ['concern 1'],
        estimatedComplexity: 'medium'
      };

      const result = decisionOutputSchema.validate(valid);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid recommendation', () => {
      const invalid = {
        recommendation: 'INVALID',
        summary: 'Valid summary text here',
        rationale: 'Valid rationale text here',
        concerns: [],
        estimatedComplexity: 'medium'
      };

      const result = decisionOutputSchema.validate(invalid);
      expect(result.valid).toBe(false);
    });

    it('should parse from JSON string', () => {
      const json = JSON.stringify({
        recommendation: 'PROCEED',
        summary: 'Valid summary text here',
        rationale: 'Valid rationale text here',
        concerns: [],
        estimatedComplexity: 'low'
      });

      const result = decisionOutputSchema.parse(json);
      expect(result?.recommendation).toBe('PROCEED');
    });
  });

  describe('planOutputSchema', () => {
    it('should validate valid plan', () => {
      const valid: Plan = {
        title: 'Valid Plan Title',
        overview: 'This is a valid overview text',
        tasks: [
          {
            id: 'T1',
            title: 'Task',
            description: 'Description',
            type: 'feature',
            files: [],
            acceptanceCriteria: []
          }
        ],
        dependencies: [],
        risks: []
      };

      const result = planOutputSchema.validate(valid);
      expect(result.valid).toBe(true);
    });
  });
});
