/**
 * LLM Provider Factory
 *
 * Selects the appropriate LLM provider based on stage and environment configuration.
 *
 * Environment Variables:
 *   LLM_PROVIDER          - Default provider (groq|openai|anthropic), defaults to 'groq'
 *   LLM_PROVIDER_CONTEXT  - Provider for context/ingest stage
 *   LLM_PROVIDER_FEASIBILITY - Provider for feasibility analysis
 *   LLM_PROVIDER_ARCHITECTURE - Provider for architecture analysis
 *   LLM_PROVIDER_TIMELINE - Provider for timeline analysis
 *   LLM_PROVIDER_SUMMARY  - Provider for summary generation
 *   LLM_PROVIDER_PATCHES  - Provider for patch generation
 *   LLM_PROVIDER_POLICY   - Provider for policy evaluation
 *
 * API Keys (required for each provider you use):
 *   GROQ_API_KEY
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 */

import type { LLMProvider } from './types';
import { createGroqProvider, GroqLLMProvider } from './groq-provider';
import { createOpenAIProvider, OpenAILLMProvider } from './openai-provider';
import { createAnthropicProvider, AnthropicLLMProvider } from './anthropic-provider';
import { StubLLMProvider } from './runner';

export type ProviderType = 'groq' | 'openai' | 'anthropic';

export type Stage =
  | 'context'
  | 'feasibility'
  | 'architecture'
  | 'timeline'
  | 'summary'
  | 'patches'
  | 'policy'
  | 'refresh';

/**
 * Get the provider type for a given stage.
 * Checks stage-specific env var first, then falls back to default.
 */
export function getProviderType(stage?: Stage): ProviderType {
  if (stage) {
    const stageEnvVar = `LLM_PROVIDER_${stage.toUpperCase()}`;
    const stageProvider = process.env[stageEnvVar];
    if (stageProvider && isValidProvider(stageProvider)) {
      return stageProvider as ProviderType;
    }
  }

  const defaultProvider = process.env.LLM_PROVIDER;
  if (defaultProvider && isValidProvider(defaultProvider)) {
    return defaultProvider as ProviderType;
  }

  return 'groq'; // Default to groq
}

function isValidProvider(provider: string): boolean {
  return ['groq', 'openai', 'anthropic'].includes(provider.toLowerCase());
}

/**
 * Create an LLM provider for a given stage.
 * Returns null if the required API key is not set.
 */
export function createProvider(stage?: Stage): LLMProvider | null {
  const providerType = getProviderType(stage);

  switch (providerType) {
    case 'openai':
      return createOpenAIProvider();

    case 'anthropic':
      return createAnthropicProvider();

    case 'groq':
    default:
      return createGroqProvider();
  }
}

/**
 * Create an LLM provider for a given stage, with fallback to stub.
 * Never returns null - falls back to StubLLMProvider if no API key is available.
 */
export function createProviderWithFallback(stage?: Stage): LLMProvider {
  const provider = createProvider(stage);
  if (provider) {
    return provider;
  }

  // Log warning and fall back to stub
  const providerType = getProviderType(stage);
  console.warn(
    `[LLM] No API key found for ${providerType} provider (stage: ${stage ?? 'default'}). ` +
    `Set ${getEnvVarName(providerType)} or use a different provider.`
  );

  return new StubLLMProvider();
}

function getEnvVarName(providerType: ProviderType): string {
  switch (providerType) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'groq':
    default:
      return 'GROQ_API_KEY';
  }
}

/**
 * Get provider info for logging/debugging.
 */
export function getProviderInfo(stage?: Stage): {
  stage: string;
  providerType: ProviderType;
  envVar: string;
  hasApiKey: boolean;
} {
  const providerType = getProviderType(stage);
  const envVar = getEnvVarName(providerType);

  return {
    stage: stage ?? 'default',
    providerType,
    envVar,
    hasApiKey: !!process.env[envVar],
  };
}

/**
 * List all configured providers and their status.
 */
export function listProviderConfig(): Record<string, { provider: ProviderType; hasKey: boolean }> {
  const stages: (Stage | 'default')[] = [
    'default',
    'context',
    'feasibility',
    'architecture',
    'timeline',
    'summary',
    'patches',
    'policy',
    'refresh',
  ];

  const config: Record<string, { provider: ProviderType; hasKey: boolean }> = {};

  for (const stage of stages) {
    const info = getProviderInfo(stage === 'default' ? undefined : stage);
    config[stage] = {
      provider: info.providerType,
      hasKey: info.hasApiKey,
    };
  }

  return config;
}
