/**
 * OpenAI LLM Provider
 *
 * Implementation of LLMProvider for OpenAI API (GPT models).
 */

import type { LLMProvider, LLMInput, LLMResponse, TokenUsage } from './types';
import { randomUUID } from 'crypto';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// OpenAI pricing (in cents per 1M tokens)
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'gpt-4-turbo': { input: 1000, output: 3000 },
  'gpt-4': { input: 3000, output: 6000 },
  'gpt-3.5-turbo': { input: 50, output: 150 },
  'o1': { input: 1500, output: 6000 },
  'o1-mini': { input: 300, output: 1200 },
};

interface OpenAIResponse {
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

export class OpenAILLMProvider implements LLMProvider {
  name = 'openai';
  modelId: string;

  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: { apiKey: string; modelId?: string; timeout?: number }) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'gpt-4o';
    this.timeout = config.timeout ?? 120000;
  }

  async call(input: LLMInput): Promise<LLMResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as OpenAIResponse;
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

  private calculateUsage(openaiUsage: OpenAIResponse['usage']): TokenUsage {
    const pricing = OPENAI_PRICING[this.modelId] ?? { input: 250, output: 1000 };
    const inputCost = (openaiUsage.prompt_tokens / 1_000_000) * pricing.input;
    const outputCost = (openaiUsage.completion_tokens / 1_000_000) * pricing.output;

    return {
      inputTokens: openaiUsage.prompt_tokens,
      outputTokens: openaiUsage.completion_tokens,
      totalTokens: openaiUsage.total_tokens,
      estimatedCost: Math.ceil(inputCost + outputCost), // Pricing is in cents per 1M tokens
    };
  }
}

/**
 * Create an OpenAI provider from environment variables.
 */
export function createOpenAIProvider(): OpenAILLMProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAILLMProvider({
    apiKey,
    modelId: process.env.OPENAI_MODEL ?? 'gpt-4o',
  });
}
