/**
 * Groq LLM Provider
 *
 * Implementation of LLMProvider for Groq API with Llama models.
 */

import type { LLMProvider, LLMInput, LLMResponse, TokenUsage } from './types';
import { randomUUID } from 'crypto';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq pricing (approximate, in cents per 1M tokens)
const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  'llama-3.3-70b-versatile': { input: 59, output: 79 },
  'llama-3.1-8b-instant': { input: 5, output: 8 },
  'llama3-70b-8192': { input: 59, output: 79 },
  'llama3-8b-8192': { input: 5, output: 8 },
  'mixtral-8x7b-32768': { input: 24, output: 24 },
};

interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqLLMProvider implements LLMProvider {
  name = 'groq';
  modelId: string;

  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: { apiKey: string; modelId?: string; timeout?: number }) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'llama-3.3-70b-versatile';
    this.timeout = config.timeout ?? 60000;
  }

  async call(input: LLMInput): Promise<LLMResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: input.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: 0.7,
          max_tokens: input.budget?.maxOutputTokens ?? 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as GroqResponse;
      const usage = this.calculateUsage(data.usage);

      return {
        success: true,
        rawContent: data.choices[0]?.message?.content ?? '',
        usage,
        metadata: {
          requestId,
          model: this.modelId,
          promptVersion: input.promptVersion,
          role: input.role,
          latencyMs: Date.now() - startTime,
          retryCount: 0,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        },
        metadata: {
          requestId,
          model: this.modelId,
          promptVersion: input.promptVersion,
          role: input.role,
          latencyMs: Date.now() - startTime,
          retryCount: 0,
          timestamp: new Date(),
        },
      };
    }
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  private calculateUsage(groqUsage: GroqResponse['usage']): TokenUsage {
    const pricing = GROQ_PRICING[this.modelId] ?? { input: 59, output: 79 };
    const inputCost = (groqUsage.prompt_tokens / 1_000_000) * pricing.input;
    const outputCost = (groqUsage.completion_tokens / 1_000_000) * pricing.output;

    return {
      inputTokens: groqUsage.prompt_tokens,
      outputTokens: groqUsage.completion_tokens,
      totalTokens: groqUsage.total_tokens,
      estimatedCost: Math.ceil((inputCost + outputCost) * 100), // Convert to cents
    };
  }
}

/**
 * Create a Groq provider from environment variables.
 */
export function createGroqProvider(): GroqLLMProvider | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GroqLLMProvider({
    apiKey,
    modelId: process.env.GROQ_MODEL_ID ?? 'llama-3.3-70b-versatile',
  });
}
