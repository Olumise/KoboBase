export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface LLMPricingConfig {
  [provider: string]: {
    [model: string]: ModelPricing;
  };
}

export const LLM_PRICING: LLMPricingConfig = {
  openai: {
    'gpt-4o': {
      inputPerMillion: 2.5,
      outputPerMillion: 10.0,
    },
    'gpt-4.1': {
      inputPerMillion: 2.0,
      outputPerMillion: 8.0,
    },
    'text-embedding-3-small': {
      inputPerMillion: 0.02,
      outputPerMillion: 0.0,
    },
  },
  google: {
    'gemini-3-flash-preview': {
      inputPerMillion: 0.075,
      outputPerMillion: 0.3,
    },
  },
};

export type CallType =
  | 'ocr'
  | 'detection'
  | 'extraction'
  | 'clarification'
  | 'embedding';

export type ProcessingMode = 'batch' | 'sequential' | 'clarification';

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const providerPricing = LLM_PRICING[provider];
  if (!providerPricing) {
    console.warn(`Unknown provider: ${provider}. Defaulting to zero cost.`);
    return 0;
  }

  const modelPricing = providerPricing[model];
  if (!modelPricing) {
    console.warn(
      `Unknown model: ${model} for provider: ${provider}. Defaulting to zero cost.`
    );
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * modelPricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.outputPerMillion;

  return inputCost + outputCost;
}

export function getModelPricing(
  provider: string,
  model: string
): ModelPricing | null {
  return LLM_PRICING[provider]?.[model] || null;
}
