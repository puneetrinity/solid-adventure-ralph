/**
 * Tests for LLM Runner Layer
 */

import {
  LLMRunner,
  StubLLMProvider,
  calculateCost,
  getPrompt,
  getCurrentVersion,
  getAvailableVersions,
  getRoleConfig,
  registerPromptVersion,
  setCurrentVersion,
  validateSchema,
  parseJSON,
  taskDecompositionSchema,
  codeGenerationSchema,
  codeReviewSchema,
  diagnosisSchema,
  getSchema,
  registerSchema,
  listSchemas,
  type AgentRole,
  type OutputSchema,
  type JSONSchema,
  type TokenBudget
} from '../../packages/core/src/llm';

describe('Role-Based Prompts', () => {
  const roles: AgentRole[] = ['architect', 'coder', 'reviewer', 'tester', 'diagnoser', 'documenter'];

  describe('getPrompt', () => {
    it('should return prompts for all roles', () => {
      for (const role of roles) {
        const prompt = getPrompt(role);
        expect(prompt).toBeTruthy();
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(100);
      }
    });

    it('should include JSON output instruction', () => {
      for (const role of roles) {
        const prompt = getPrompt(role);
        expect(prompt).toContain('JSON');
      }
    });

    it('should throw for unknown version', () => {
      expect(() => getPrompt('architect', 'v999')).toThrow('Unknown prompt version');
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version for all roles', () => {
      for (const role of roles) {
        const version = getCurrentVersion(role);
        expect(version).toBe('v1');
      }
    });
  });

  describe('getAvailableVersions', () => {
    it('should list available versions', () => {
      const versions = getAvailableVersions('architect');
      expect(versions).toContain('v1');
    });
  });

  describe('getRoleConfig', () => {
    it('should return config for all roles', () => {
      for (const role of roles) {
        const config = getRoleConfig(role);
        expect(config.role).toBe(role);
        expect(config.systemPrompt).toBeTruthy();
        expect(config.temperature).toBeGreaterThanOrEqual(0);
        expect(config.temperature).toBeLessThanOrEqual(1);
        expect(config.maxTokens).toBeGreaterThan(0);
        expect(Array.isArray(config.constraints)).toBe(true);
      }
    });

    it('should have lower temperature for coder role', () => {
      const coderConfig = getRoleConfig('coder');
      const documenterConfig = getRoleConfig('documenter');
      expect(coderConfig.temperature).toBeLessThan(documenterConfig.temperature);
    });
  });

  describe('prompt versioning', () => {
    it('should register new version', () => {
      const originalVersions = getAvailableVersions('architect');
      registerPromptVersion('architect', 'v2-test', 'Test prompt v2');
      const newVersions = getAvailableVersions('architect');
      expect(newVersions.length).toBe(originalVersions.length + 1);
      expect(getPrompt('architect', 'v2-test')).toBe('Test prompt v2');
    });

    it('should set current version', () => {
      registerPromptVersion('reviewer', 'v2-test', 'Test prompt v2');
      setCurrentVersion('reviewer', 'v2-test');
      expect(getCurrentVersion('reviewer')).toBe('v2-test');
      // Reset
      setCurrentVersion('reviewer', 'v1');
    });

    it('should throw when setting nonexistent version', () => {
      expect(() => setCurrentVersion('coder', 'v999')).toThrow('Version v999 not found');
    });
  });
});

describe('Output Schemas', () => {
  describe('validateSchema', () => {
    it('should validate simple object', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      };
      const result = validateSchema({ name: 'test' }, schema);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should reject missing required field', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      };
      const result = validateSchema({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('Required field missing');
    });

    it('should validate string constraints', () => {
      const schema: JSONSchema = {
        type: 'string',
        minLength: 5,
        maxLength: 10
      };

      expect(validateSchema('hello', schema).valid).toBe(true);
      expect(validateSchema('hi', schema).valid).toBe(false);
      expect(validateSchema('hello world!', schema).valid).toBe(false);
    });

    it('should validate number constraints', () => {
      const schema: JSONSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100
      };

      expect(validateSchema(50, schema).valid).toBe(true);
      expect(validateSchema(-1, schema).valid).toBe(false);
      expect(validateSchema(101, schema).valid).toBe(false);
    });

    it('should validate enum values', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['low', 'medium', 'high']
      };

      expect(validateSchema('medium', schema).valid).toBe(true);
      expect(validateSchema('invalid', schema).valid).toBe(false);
    });

    it('should validate nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['user'],
        properties: {
          user: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' }
            }
          }
        }
      };

      expect(validateSchema({ user: { name: 'John' } }, schema).valid).toBe(true);
      expect(validateSchema({ user: {} }, schema).valid).toBe(false);
    });

    it('should validate arrays', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' }
      };

      expect(validateSchema(['a', 'b', 'c'], schema).valid).toBe(true);
      expect(validateSchema([1, 2, 3], schema).valid).toBe(false);
    });

    it('should reject null/undefined', () => {
      const schema: JSONSchema = { type: 'string' };
      expect(validateSchema(null, schema).valid).toBe(false);
      expect(validateSchema(undefined, schema).valid).toBe(false);
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      const result = parseJSON<{ foo: string }>('{"foo": "bar"}');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should extract JSON from markdown code block', () => {
      const markdown = '```json\n{"foo": "bar"}\n```';
      const result = parseJSON<{ foo: string }>(markdown);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should extract JSON from generic code block', () => {
      const markdown = '```\n{"foo": "bar"}\n```';
      const result = parseJSON<{ foo: string }>(markdown);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return null for invalid JSON', () => {
      expect(parseJSON('not json')).toBeNull();
      expect(parseJSON('{"broken')).toBeNull();
    });
  });

  describe('taskDecompositionSchema', () => {
    it('should validate valid task decomposition', () => {
      const data = {
        summary: 'This is a summary of the task decomposition',
        tasks: [
          {
            id: 'task-1',
            title: 'First task',
            description: 'Do something',
            dependencies: [],
            estimatedComplexity: 'low'
          }
        ],
        risks: [
          {
            description: 'Risk 1',
            mitigation: 'Mitigation 1',
            severity: 'low'
          }
        ]
      };

      const result = taskDecompositionSchema.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should reject short summary', () => {
      const data = {
        summary: 'Short',
        tasks: []
      };

      const result = taskDecompositionSchema.validate(data);
      expect(result.valid).toBe(false);
    });
  });

  describe('codeGenerationSchema', () => {
    it('should validate valid code generation', () => {
      const data = {
        files: [
          {
            path: 'src/index.ts',
            content: 'export const foo = 1;',
            action: 'create'
          }
        ],
        explanation: 'Created a new index file with foo constant'
      };

      const result = codeGenerationSchema.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('codeReviewSchema', () => {
    it('should validate valid code review', () => {
      const data = {
        summary: 'Overall the code looks good with minor issues',
        approved: true,
        issues: [
          {
            severity: 'minor',
            file: 'src/utils.ts',
            line: 10,
            message: 'Consider using const instead of let'
          }
        ]
      };

      const result = codeReviewSchema.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('diagnosisSchema', () => {
    it('should validate valid diagnosis', () => {
      const data = {
        summary: 'The error is caused by a null pointer exception',
        rootCause: {
          description: 'Undefined value passed to function',
          confidence: 'high',
          evidence: ['Stack trace shows null at line 42', 'No input validation']
        },
        suggestedFixes: [
          {
            description: 'Add null check',
            priority: 1,
            effort: 'trivial'
          }
        ]
      };

      const result = diagnosisSchema.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('schema registry', () => {
    it('should get registered schemas', () => {
      expect(getSchema('task_decomposition')).toBeTruthy();
      expect(getSchema('code_generation')).toBeTruthy();
      expect(getSchema('code_review')).toBeTruthy();
      expect(getSchema('diagnosis')).toBeTruthy();
    });

    it('should return undefined for unknown schema', () => {
      expect(getSchema('unknown_schema')).toBeUndefined();
    });

    it('should register custom schema', () => {
      const customSchema: OutputSchema<{ test: string }> = {
        name: 'custom_test',
        version: 'v1',
        description: 'Test schema',
        schema: {
          type: 'object',
          required: ['test'],
          properties: { test: { type: 'string' } }
        },
        validate: (data) => validateSchema<{ test: string }>(data, customSchema.schema),
        parse: (raw) => parseJSON<{ test: string }>(raw)
      };

      registerSchema(customSchema);
      expect(getSchema('custom_test')).toBeTruthy();
    });

    it('should list all schemas', () => {
      const schemas = listSchemas();
      expect(schemas).toContain('task_decomposition');
      expect(schemas).toContain('code_generation');
      expect(schemas).toContain('code_review');
      expect(schemas).toContain('diagnosis');
    });
  });
});

describe('LLM Runner', () => {
  let provider: StubLLMProvider;
  let runner: LLMRunner;

  beforeEach(() => {
    provider = new StubLLMProvider();
    runner = new LLMRunner({ provider });
  });

  describe('basic execution', () => {
    it('should run without schema', async () => {
      provider.setResponse('architect', '{"result": "test"}');

      const response = await runner.run('architect', 'Test prompt');

      expect(response.success).toBe(true);
      expect(response.rawContent).toBe('{"result": "test"}');
      expect(response.metadata.role).toBe('architect');
      expect(response.metadata.promptVersion).toBe('v1');
    });

    it('should run with schema validation', async () => {
      const validResponse = JSON.stringify({
        summary: 'Task decomposition summary here',
        tasks: [
          {
            id: 't1',
            title: 'Task 1',
            description: 'Description',
            dependencies: [],
            estimatedComplexity: 'low'
          }
        ],
        risks: []
      });

      provider.setResponse('architect', validResponse);

      const response = await runner.run('architect', 'Decompose task', {
        schema: taskDecompositionSchema
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeTruthy();
      expect((response.data as any).summary).toContain('Task decomposition');
    });

    it('should fail on invalid schema', async () => {
      provider.setResponse('architect', '{"invalid": "data"}');

      const response = await runner.run('architect', 'Test', {
        schema: taskDecompositionSchema
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('VALIDATION_ERROR');
    });

    it('should fail on unparseable response', async () => {
      provider.setResponse('coder', 'Not valid JSON at all');

      const response = await runner.run('coder', 'Test', {
        schema: codeGenerationSchema
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('PARSE_ERROR');
    });
  });

  describe('budget control', () => {
    it('should track session usage', async () => {
      await runner.run('architect', 'Test 1');
      await runner.run('coder', 'Test 2');

      const usage = runner.getSessionUsage();
      expect(usage.totalTokens).toBeGreaterThan(0);
    });

    it('should reset session usage', async () => {
      await runner.run('architect', 'Test');
      runner.resetSessionUsage();

      const usage = runner.getSessionUsage();
      expect(usage.totalTokens).toBe(0);
    });

    it('should check budget', async () => {
      expect(runner.isWithinBudget()).toBe(true);

      const tinyBudget: TokenBudget = {
        maxInputTokens: 1,
        maxOutputTokens: 1,
        maxTotalCost: 1
      };

      await runner.run('architect', 'Test');
      expect(runner.isWithinBudget(tinyBudget)).toBe(false);
    });
  });

  describe('metadata recording', () => {
    it('should include all metadata', async () => {
      const response = await runner.run('reviewer', 'Review this');

      expect(response.metadata.requestId).toBeTruthy();
      expect(response.metadata.model).toBe('stub-model');
      expect(response.metadata.role).toBe('reviewer');
      expect(response.metadata.promptVersion).toBe('v1');
      expect(response.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(response.metadata.retryCount).toBe(0);
      expect(response.metadata.timestamp).toBeInstanceOf(Date);
    });

    it('should include usage info', async () => {
      const response = await runner.run('architect', 'Test');

      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
      expect(response.usage.totalTokens).toBe(
        response.usage.inputTokens + response.usage.outputTokens
      );
    });
  });
});

describe('StubLLMProvider', () => {
  it('should return default response', async () => {
    const provider = new StubLLMProvider();
    const response = await provider.call({
      role: 'architect',
      promptVersion: 'v1',
      messages: [{ role: 'user', content: 'test' }]
    });

    expect(response.rawContent).toBe('{"message": "stub response"}');
  });

  it('should return role-specific response', async () => {
    const provider = new StubLLMProvider();
    provider.setResponse('coder', '{"code": "test"}');

    const response = await provider.call({
      role: 'coder',
      promptVersion: 'v1',
      messages: [{ role: 'user', content: 'test' }]
    });

    expect(response.rawContent).toBe('{"code": "test"}');
  });

  it('should estimate tokens', () => {
    const provider = new StubLLMProvider();
    const estimate = provider.estimateTokens('This is a test string');

    expect(estimate).toBeGreaterThan(0);
    // ~4 chars per token
    expect(estimate).toBe(Math.ceil(21 / 4));
  });
});

describe('calculateCost', () => {
  it('should calculate cost for known models', () => {
    // GPT-4: 3000/6000 cents per 1M tokens
    const cost = calculateCost(1000, 500, 'gpt-4');
    expect(cost).toBeGreaterThan(0);
  });

  it('should use default pricing for unknown models', () => {
    const cost = calculateCost(1000, 500, 'unknown-model');
    expect(cost).toBeGreaterThan(0);
  });

  it('should return higher cost for more tokens', () => {
    // Use larger token counts to get meaningful cost differences
    const lowCost = calculateCost(10000, 5000, 'gpt-4');
    const highCost = calculateCost(100000, 50000, 'gpt-4');
    expect(highCost).toBeGreaterThan(lowCost);
  });
});
