"use strict";
/**
 * Output Schemas
 *
 * Strict JSON schemas for LLM outputs with validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosisSchema = exports.codeReviewSchema = exports.codeGenerationSchema = exports.taskDecompositionSchema = void 0;
exports.validateSchema = validateSchema;
exports.parseJSON = parseJSON;
exports.getSchema = getSchema;
exports.registerSchema = registerSchema;
exports.listSchemas = listSchemas;
// ============================================================================
// Schema Validation
// ============================================================================
/**
 * Validate data against a JSON schema.
 */
function validateSchema(data, schema, path = '') {
    const errors = [];
    if (data === null || data === undefined) {
        errors.push({
            path: path || 'root',
            message: 'Value is null or undefined',
            expected: schema.type,
            received: 'null/undefined'
        });
        return { valid: false, errors };
    }
    // Type checking
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (schema.type !== actualType) {
        errors.push({
            path: path || 'root',
            message: `Expected ${schema.type}, got ${actualType}`,
            expected: schema.type,
            received: actualType
        });
        return { valid: false, errors };
    }
    // Object validation
    if (schema.type === 'object' && schema.properties) {
        const obj = data;
        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in obj)) {
                    errors.push({
                        path: path ? `${path}.${field}` : field,
                        message: `Required field missing: ${field}`,
                        expected: 'defined',
                        received: 'undefined'
                    });
                }
            }
        }
        // Validate each property
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in obj) {
                const result = validateSchema(obj[key], propSchema, path ? `${path}.${key}` : key);
                if (!result.valid && result.errors) {
                    errors.push(...result.errors);
                }
            }
        }
    }
    // Array validation
    if (schema.type === 'array' && schema.items) {
        const arr = data;
        for (let i = 0; i < arr.length; i++) {
            const result = validateSchema(arr[i], schema.items, `${path}[${i}]`);
            if (!result.valid && result.errors) {
                errors.push(...result.errors);
            }
        }
    }
    // String validation
    if (schema.type === 'string') {
        const str = data;
        if (schema.minLength !== undefined && str.length < schema.minLength) {
            errors.push({
                path,
                message: `String too short: min ${schema.minLength}, got ${str.length}`,
                expected: `>= ${schema.minLength} chars`,
                received: `${str.length} chars`
            });
        }
        if (schema.maxLength !== undefined && str.length > schema.maxLength) {
            errors.push({
                path,
                message: `String too long: max ${schema.maxLength}, got ${str.length}`,
                expected: `<= ${schema.maxLength} chars`,
                received: `${str.length} chars`
            });
        }
        if (schema.enum && !schema.enum.includes(str)) {
            errors.push({
                path,
                message: `Value not in enum: ${str}`,
                expected: schema.enum.join(' | '),
                received: str
            });
        }
    }
    // Number validation
    if (schema.type === 'number') {
        const num = data;
        if (schema.minimum !== undefined && num < schema.minimum) {
            errors.push({
                path,
                message: `Number too small: min ${schema.minimum}, got ${num}`,
                expected: `>= ${schema.minimum}`,
                received: `${num}`
            });
        }
        if (schema.maximum !== undefined && num > schema.maximum) {
            errors.push({
                path,
                message: `Number too large: max ${schema.maximum}, got ${num}`,
                expected: `<= ${schema.maximum}`,
                received: `${num}`
            });
        }
    }
    if (errors.length > 0) {
        return { valid: false, errors };
    }
    return { valid: true, data: data };
}
/**
 * Parse JSON from raw LLM output, handling markdown code blocks.
 */
function parseJSON(rawContent) {
    // Try direct parse first
    try {
        return JSON.parse(rawContent);
    }
    catch {
        // Try extracting from markdown code block
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
exports.taskDecompositionSchema = {
    name: 'task_decomposition',
    version: 'v1',
    description: 'Structured task breakdown from architect role',
    schema: {
        type: 'object',
        required: ['summary', 'tasks'],
        properties: {
            summary: { type: 'string', minLength: 10 },
            tasks: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['id', 'title', 'description'],
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        dependencies: { type: 'array', items: { type: 'string' } },
                        estimatedComplexity: { type: 'string', enum: ['low', 'medium', 'high'] }
                    }
                }
            },
            risks: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['description', 'severity'],
                    properties: {
                        description: { type: 'string' },
                        mitigation: { type: 'string' },
                        severity: { type: 'string', enum: ['low', 'medium', 'high'] }
                    }
                }
            }
        }
    },
    validate: (data) => validateSchema(data, exports.taskDecompositionSchema.schema),
    parse: (rawContent) => parseJSON(rawContent)
};
exports.codeGenerationSchema = {
    name: 'code_generation',
    version: 'v1',
    description: 'Code generation output from coder role',
    schema: {
        type: 'object',
        required: ['files', 'explanation'],
        properties: {
            files: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['path', 'content', 'action'],
                    properties: {
                        path: { type: 'string' },
                        content: { type: 'string' },
                        action: { type: 'string', enum: ['create', 'modify', 'delete'] },
                        diff: { type: 'string' }
                    }
                }
            },
            explanation: { type: 'string', minLength: 10 },
            testSuggestions: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    },
    validate: (data) => validateSchema(data, exports.codeGenerationSchema.schema),
    parse: (rawContent) => parseJSON(rawContent)
};
exports.codeReviewSchema = {
    name: 'code_review',
    version: 'v1',
    description: 'Code review output from reviewer role',
    schema: {
        type: 'object',
        required: ['summary', 'approved', 'issues'],
        properties: {
            summary: { type: 'string', minLength: 10 },
            approved: { type: 'boolean' },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['severity', 'file', 'message'],
                    properties: {
                        severity: { type: 'string', enum: ['critical', 'major', 'minor', 'suggestion'] },
                        file: { type: 'string' },
                        line: { type: 'number' },
                        message: { type: 'string' },
                        suggestedFix: { type: 'string' }
                    }
                }
            },
            strengths: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    },
    validate: (data) => validateSchema(data, exports.codeReviewSchema.schema),
    parse: (rawContent) => parseJSON(rawContent)
};
exports.diagnosisSchema = {
    name: 'diagnosis',
    version: 'v1',
    description: 'Error diagnosis output from diagnoser role',
    schema: {
        type: 'object',
        required: ['summary', 'rootCause', 'suggestedFixes'],
        properties: {
            summary: { type: 'string', minLength: 10 },
            rootCause: {
                type: 'object',
                required: ['description', 'confidence', 'evidence'],
                properties: {
                    description: { type: 'string' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    evidence: { type: 'array', items: { type: 'string' } }
                }
            },
            suggestedFixes: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['description', 'priority', 'effort'],
                    properties: {
                        description: { type: 'string' },
                        priority: { type: 'number', minimum: 1, maximum: 10 },
                        effort: { type: 'string', enum: ['trivial', 'small', 'medium', 'large'] }
                    }
                }
            },
            relatedIssues: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    },
    validate: (data) => validateSchema(data, exports.diagnosisSchema.schema),
    parse: (rawContent) => parseJSON(rawContent)
};
// ============================================================================
// Schema Registry
// ============================================================================
const schemaRegistry = new Map();
// Register built-in schemas
schemaRegistry.set('task_decomposition', exports.taskDecompositionSchema);
schemaRegistry.set('code_generation', exports.codeGenerationSchema);
schemaRegistry.set('code_review', exports.codeReviewSchema);
schemaRegistry.set('diagnosis', exports.diagnosisSchema);
/**
 * Get a schema by name.
 */
function getSchema(name) {
    return schemaRegistry.get(name);
}
/**
 * Register a custom schema.
 */
function registerSchema(schema) {
    schemaRegistry.set(schema.name, schema);
}
/**
 * List all registered schemas.
 */
function listSchemas() {
    return Array.from(schemaRegistry.keys());
}
//# sourceMappingURL=schemas.js.map