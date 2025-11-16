/**
 * AI Client Factory
 * Creates OpenAI-compatible clients for OpenAI, vLLM, or hybrid mode
 */

import OpenAI from "openai";
import { ENV_CONFIG } from "@shared/environment";

export interface AIClientOptions {
  forceProvider?: "openai" | "vllm";
}

/**
 * Create an OpenAI-compatible client based on environment configuration
 * 
 * In hybrid mode:
 * - Uses vLLM for cheap operations (planning, testing)
 * - Falls back to OpenAI for critical operations (code generation)
 */
export function createAIClient(options?: AIClientOptions): OpenAI {
  const provider = options?.forceProvider || ENV_CONFIG.ai.provider;
  
  // Determine which API to use
  const useVLLM = 
    provider === "vllm" || 
    (provider === "hybrid" && ENV_CONFIG.ai.vllmAvailable && !options?.forceProvider);

  if (useVLLM && ENV_CONFIG.ai.vllmAvailable) {
    console.log(`[AI Client] Using vLLM at ${process.env.VLLM_API_BASE}`);
    return new OpenAI({
      apiKey: "EMPTY", // vLLM doesn't require authentication
      baseURL: process.env.VLLM_API_BASE,
    });
  }

  // Fall back to OpenAI
  console.log(`[AI Client] Using OpenAI API`);
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Get model name based on provider and task complexity
 */
export function getModelName(taskType: "planning" | "coding" | "testing", useGPT4 = false): string {
  const isVLLM = ENV_CONFIG.ai.provider === "vllm" || 
                 (ENV_CONFIG.ai.provider === "hybrid" && ENV_CONFIG.ai.vllmAvailable);

  if (isVLLM) {
    // vLLM: Use the model name from VLLM_MODEL_NAME env var
    // Common models: meta-llama/Llama-3.1-8B-Instruct, Qwen/Qwen2.5-Coder-7B-Instruct
    return process.env.VLLM_MODEL_NAME || "meta-llama/Llama-3.1-8B-Instruct";
  }

  // OpenAI: Use GPT-4 or GPT-3.5-turbo
  if (taskType === "coding" || useGPT4) {
    return "gpt-4";
  }
  
  return "gpt-3.5-turbo";
}

/**
 * Check if vLLM is available and running
 */
export async function checkVLLMHealth(): Promise<boolean> {
  if (!ENV_CONFIG.ai.vllmAvailable || !process.env.VLLM_API_BASE) {
    return false;
  }

  try {
    const response = await fetch(`${process.env.VLLM_API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    console.error('[AI Client] vLLM health check failed:', error);
    return false;
  }
}
