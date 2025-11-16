/**
 * AI Client Factory
 * Creates OpenAI-compatible clients for OpenAI, vLLM, or hybrid mode
 * 
 * IMPORTANT: vLLM is OPTIONAL - system automatically falls back to OpenAI if:
 * - VLLM_API_BASE not set
 * - vLLM server not responding
 * - vLLM health check fails
 */

import OpenAI from "openai";
import { ENV_CONFIG } from "@shared/environment";

export interface AIClientOptions {
  forceProvider?: "openai" | "vllm";
}

// Runtime vLLM health status (cached to avoid excessive health checks)
let vllmHealthCache: { healthy: boolean; lastCheck: number } | null = null;
const HEALTH_CHECK_TTL = 60000; // 60 seconds

// Global flag: is vLLM actually available and healthy?
let vllmRuntimeAvailable = false;

/**
 * Check vLLM health with caching to avoid excessive requests
 */
async function isVLLMHealthy(): Promise<boolean> {
  const now = Date.now();
  
  // Return cached result if still valid
  if (vllmHealthCache && (now - vllmHealthCache.lastCheck) < HEALTH_CHECK_TTL) {
    return vllmHealthCache.healthy;
  }
  
  // Perform health check
  const healthy = await checkVLLMHealth();
  vllmHealthCache = { healthy, lastCheck: now };
  vllmRuntimeAvailable = healthy; // Update global flag
  
  return healthy;
}

/**
 * Perform initial health check at startup
 * Call this once when server starts to set vllmRuntimeAvailable
 */
export async function initializeAIClient(): Promise<void> {
  if (!ENV_CONFIG.ai.vllmAvailable) {
    console.log('[AI Client] vLLM not configured, using OpenAI only');
    vllmRuntimeAvailable = false;
    return;
  }

  const healthy = await checkVLLMHealth();
  vllmRuntimeAvailable = healthy;
  
  if (healthy) {
    console.log(`[AI Client] ✅ vLLM health check passed - ${ENV_CONFIG.ai.provider} mode active`);
  } else {
    console.warn(`[AI Client] ⚠️  vLLM configured but not responding - falling back to OpenAI only`);
  }
}

/**
 * Create an OpenAI-compatible client based on environment configuration
 * 
 * FALLBACK BEHAVIOR:
 * - Always attempts to use requested provider
 * - Automatically falls back to OpenAI if vLLM unavailable
 * - Logs clear warnings when fallback occurs
 * 
 * Priority order:
 * 1. Explicit forceProvider option (highest priority)
 * 2. Environment AI_PROVIDER setting
 * 3. Automatic fallback to OpenAI if vLLM fails
 */
export async function createAIClient(options?: AIClientOptions): Promise<OpenAI> {
  // Step 1: Honor explicit provider override
  if (options?.forceProvider === "vllm") {
    if (ENV_CONFIG.ai.vllmAvailable && await isVLLMHealthy()) {
      console.log(`[AI Client] ✅ Using vLLM (explicit override) at ${process.env.VLLM_API_BASE}`);
      return new OpenAI({
        apiKey: "EMPTY", // vLLM doesn't require authentication
        baseURL: process.env.VLLM_API_BASE,
      });
    } else {
      console.warn(`[AI Client] ⚠️  vLLM requested but unavailable, falling back to OpenAI`);
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }
  
  if (options?.forceProvider === "openai") {
    console.log(`[AI Client] ✅ Using OpenAI (explicit override)`);
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  // Step 2: Check environment configuration
  const envProvider = ENV_CONFIG.ai.provider;
  
  // Try vLLM if: provider is "vllm" OR (provider is "hybrid" AND vLLM is configured)
  const shouldTryVLLM = 
    (envProvider === "vllm" || envProvider === "hybrid") && 
    ENV_CONFIG.ai.vllmAvailable;

  if (shouldTryVLLM && await isVLLMHealthy()) {
    console.log(`[AI Client] ✅ Using vLLM (${envProvider} mode) at ${process.env.VLLM_API_BASE}`);
    return new OpenAI({
      apiKey: "EMPTY",
      baseURL: process.env.VLLM_API_BASE,
    });
  }

  // Step 3: Fall back to OpenAI
  if (shouldTryVLLM) {
    console.warn(`[AI Client] ⚠️  vLLM configured but not responding, falling back to OpenAI`);
  } else {
    console.log(`[AI Client] ✅ Using OpenAI API (${envProvider} mode)`);
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Synchronous version for compatibility with existing code
 * Re-checks vLLM health periodically (uses cached result with 60s TTL)
 */
export function createAIClientSync(options?: AIClientOptions): OpenAI {
  // Trigger async health check in background if cache expired (fire-and-forget)
  // This allows the sync path to eventually discover vLLM recovery
  if (ENV_CONFIG.ai.vllmAvailable) {
    const now = Date.now();
    if (!vllmHealthCache || (now - vllmHealthCache.lastCheck) >= HEALTH_CHECK_TTL) {
      // Async health check in background - updates vllmRuntimeAvailable
      isVLLMHealthy().catch(() => {}); // Fire and forget
    }
  }

  // Explicit OpenAI override
  if (options?.forceProvider === "openai") {
    console.log(`[AI Client] ✅ Using OpenAI (explicit override)`);
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  // Try vLLM only if it's currently marked healthy
  if (options?.forceProvider === "vllm" && vllmRuntimeAvailable) {
    console.log(`[AI Client] ✅ Using vLLM (explicit override, health verified) at ${process.env.VLLM_API_BASE}`);
    return new OpenAI({
      apiKey: "EMPTY",
      baseURL: process.env.VLLM_API_BASE,
    });
  }
  
  // Explicit vLLM requested but unavailable - fallback
  if (options?.forceProvider === "vllm" && !vllmRuntimeAvailable) {
    console.warn(`[AI Client] ⚠️  vLLM requested but unavailable, falling back to OpenAI`);
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  const envProvider = ENV_CONFIG.ai.provider;
  const shouldUseVLLM = 
    (envProvider === "vllm" || envProvider === "hybrid") && 
    vllmRuntimeAvailable; // Use current runtime status

  if (shouldUseVLLM) {
    console.log(`[AI Client] ✅ Using vLLM (${envProvider} mode, health verified) at ${process.env.VLLM_API_BASE}`);
    return new OpenAI({
      apiKey: "EMPTY",
      baseURL: process.env.VLLM_API_BASE,
    });
  }

  // Default to OpenAI
  if ((envProvider === "vllm" || envProvider === "hybrid") && !vllmRuntimeAvailable) {
    console.warn(`[AI Client] ⚠️  vLLM configured but unhealthy, using OpenAI`);
  } else {
    console.log(`[AI Client] ✅ Using OpenAI API (${envProvider} mode)`);
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Get model name based on RUNTIME provider and task complexity
 * CRITICAL: Uses vllmRuntimeAvailable (runtime health status) not vllmAvailable (config)
 * This ensures we return OpenAI model names when falling back to OpenAI
 */
export function getModelName(taskType: "planning" | "coding" | "testing", useGPT4 = false): string {
  // Check RUNTIME availability, not just configuration
  const isVLLM = (ENV_CONFIG.ai.provider === "vllm" || ENV_CONFIG.ai.provider === "hybrid") && 
                 vllmRuntimeAvailable; // Use runtime health status

  if (isVLLM) {
    // vLLM is healthy: Use the model name from VLLM_MODEL_NAME env var
    // Common models: meta-llama/Llama-3.1-8B-Instruct, Qwen/Qwen2.5-Coder-7B-Instruct
    return process.env.VLLM_MODEL_NAME || "meta-llama/Llama-3.1-8B-Instruct";
  }

  // OpenAI (or vLLM fallback): Use GPT-4 or GPT-3.5-turbo
  if (taskType === "coding" || useGPT4) {
    return "gpt-4";
  }
  
  return "gpt-3.5-turbo";
}

/**
 * Get current runtime provider (what we're actually using)
 */
export function getRuntimeProvider(): "openai" | "vllm" {
  const isVLLM = (ENV_CONFIG.ai.provider === "vllm" || ENV_CONFIG.ai.provider === "hybrid") && 
                 vllmRuntimeAvailable;
  return isVLLM ? "vllm" : "openai";
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
