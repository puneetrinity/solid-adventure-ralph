/**
 * Anthropic LLM Provider
 *
 * Implementation of LLMProvider for Anthropic API (Claude models).
 */

import type { LLMProvider, LLMInput, LLMResponse, TokenUsage } from './types';
import { randomUUID } from 'crypto';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Anthropic pricing (in cents per 1M tokens)
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 500, output: 2500 },
  'claude-opus-4-5-20250514': { input: 500, output: 2500 },
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
  'claude-3-5-haiku-20241022': { input: 100, output: 500 },
  'claude-3-opus-20240229': { input: 1500, output: 7500 },
  'claude-3-sonnet-20240229': { input: 300, output: 1500 },
  'claude-3-haiku-20240307': { input: 25, output: 125 },
};

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: {
    type: string;
    text: string;
  }[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicLLMProvider implements LLMProvider {
  name = 'anthropic';
  modelId: string;

  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: { apiKey: string; modelId?: string; timeout?: number }) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'claude-3-5-sonnet-20241022';
    this.timeout = config.timeout ?? 120000;
  }

  async call(input: LLMInput): Promise<LLMResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Anthropic requires system message separately
      const systemMessage = input.messages.find((m) => m.role === 'system');
      const otherMessages = input.messages.filter((m) => m.role !== 'system');

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: input.budget?.maxOutputTokens ?? 4096,
          system: systemMessage?.content ?? '',
          messages: otherMessages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const usage = this.calculateUsage(data.usage);

      // Extract text content from response
      const textContent = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        success: true,
        rawContent: textContent,
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

  private calculateUsage(anthropicUsage: AnthropicResponse['usage']): TokenUsage {
    const pricing = ANTHROPIC_PRICING[this.modelId] ?? { input: 300, output: 1500 };
    // Pricing is in cents per 1M tokens, so result is already in cents
    const inputCost = (anthropicUsage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (anthropicUsage.output_tokens / 1_000_000) * pricing.output;

    return {
      inputTokens: anthropicUsage.input_tokens,
      outputTokens: anthropicUsage.output_tokens,
      totalTokens: anthropicUsage.input_tokens + anthropicUsage.output_tokens,
      estimatedCost: Math.ceil(inputCost + outputCost),
    };
  }
}

/**
 * Create an Anthropic provider from environment variables.
 */
export function createAnthropicProvider(): AnthropicLLMProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new AnthropicLLMProvider({
    apiKey,
    modelId: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
  });
}
