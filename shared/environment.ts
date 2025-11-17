/**
 * Environment Detection & Configuration
 * 
 * Detects whether running on Replit or local Ubuntu and configures services accordingly.
 */

// Load .env file BEFORE environment detection (Node.js 20.12+ native support)
// This must happen before ENV_CONFIG is created
if (typeof window === "undefined") {
  try {
    process.loadEnvFile('.env');
    console.log('[Environment] Loaded .env file, DEPLOYMENT_ENV =', process.env.DEPLOYMENT_ENV);
  } catch (error: any) {
    console.log('[Environment] Could not load .env file:', error.message);
  }
}

export type Environment = "replit" | "local";
export type ServiceMode = "replit" | "docker" | "mock";

export interface EnvironmentConfig {
  env: Environment;
  database: {
    mode: "replit" | "local";
    url: string;
  };
  sandbox: {
    mode: ServiceMode;
    available: boolean;
  };
  codeServer: {
    mode: ServiceMode;
    url: string;
  };
  pythonAgent: {
    mode: ServiceMode;
    url: string;
    available: boolean;
  };
  ai: {
    provider: "openai" | "vllm" | "hybrid";
    vllmAvailable: boolean;
  };
  gpu: {
    available: boolean;
    device: string | null;
  };
}

/**
 * Detect current environment
 */
export function detectEnvironment(): Environment {
  // Priority 1: Check for Replit-specific environment variables (most reliable)
  // These are ALWAYS present on Replit, even if .env has DEPLOYMENT_ENV=local
  if (process.env.REPL_ID || process.env.REPL_SLUG) {
    return "replit";
  }
  
  // Priority 2: Explicit override via DEPLOYMENT_ENV (for local development)
  if (process.env.DEPLOYMENT_ENV === "local") {
    return "local";
  }
  
  // Default to local for development
  return "local";
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = detectEnvironment();
  
  if (env === "replit") {
    return {
      env,
      database: {
        mode: "replit",
        url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/webide",
      },
      sandbox: {
        mode: "mock", // No Docker on Replit - use mock sandbox
        available: false,
      },
      codeServer: {
        mode: "mock", // Use our existing custom editor on Replit
        url: "",
      },
      pythonAgent: {
        mode: "mock", // Python agent not available on Replit
        url: "",
        available: false,
      },
      ai: {
        provider: "openai", // OpenAI only on Replit
        vllmAvailable: false,
      },
      gpu: {
        available: false,
        device: null,
      },
    };
  }
  
  // Local Ubuntu configuration
  // Note: Docker availability will be validated at runtime
  return {
    env,
    database: {
      mode: "local",
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/webide",
    },
    sandbox: {
      mode: "docker", // Will be downgraded to "mock" if Docker unavailable
      available: true, // Will be updated by runtime validation
    },
    codeServer: {
      mode: "docker",
      url: process.env.CODE_SERVER_URL || "http://localhost:8443",
    },
    pythonAgent: {
      mode: "docker",
      url: process.env.PYTHON_AGENT_URL || "http://localhost:8001",
      available: true,
    },
    ai: {
      provider: process.env.AI_PROVIDER as any || "hybrid",
      vllmAvailable: !!process.env.VLLM_API_BASE,
    },
    gpu: {
      available: !!process.env.CUDA_VISIBLE_DEVICES,
      device: process.env.CUDA_VISIBLE_DEVICES || null,
    },
  };
}

/**
 * Runtime validation: Check if Docker is actually accessible
 */
export async function validateDockerAccess(): Promise<boolean> {
  if (typeof window !== "undefined") {
    return false; // Frontend - no Docker access
  }

  try {
    const Docker = (await import("dockerode")).default;
    const docker = new Docker();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runtime validation: Check if PostgreSQL is accessible
 */
export async function validateDatabaseAccess(): Promise<boolean> {
  if (typeof window !== "undefined") {
    return false; // Frontend - no direct DB access
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("SELECT 1");
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a service is available in current environment
 */
export function isServiceAvailable(service: "docker" | "gpu" | "vllm" | "code-server"): boolean {
  const config = getEnvironmentConfig();
  
  switch (service) {
    case "docker":
      return config.sandbox.mode === "docker";
    case "gpu":
      return config.gpu.available;
    case "vllm":
      return config.ai.vllmAvailable;
    case "code-server":
      return config.codeServer.mode === "docker";
    default:
      return false;
  }
}

/**
 * Get service URL with environment-aware fallback
 */
export function getServiceUrl(service: "code-server" | "vllm" | "sandbox" | "python-agent"): string | null {
  const config = getEnvironmentConfig();
  
  switch (service) {
    case "code-server":
      return config.codeServer.mode === "docker" ? config.codeServer.url : null;
    case "python-agent":
      return config.pythonAgent.available ? config.pythonAgent.url : null;
    case "vllm":
      return config.ai.vllmAvailable ? (process.env.VLLM_API_BASE || null) : null;
    case "sandbox":
      return config.sandbox.mode === "docker" ? "http://localhost:9090" : null;
    default:
      return null;
  }
}

export const ENV_CONFIG = getEnvironmentConfig();

/**
 * Update environment config at runtime after Docker validation
 * Call this from server startup after validateDockerAccess()
 */
export function updateDockerAvailability(available: boolean): void {
  if (!available && ENV_CONFIG.env === "local") {
    console.log("[Environment] Docker unavailable - disabling dev servers and sandboxes");
    ENV_CONFIG.sandbox.mode = "mock";
    ENV_CONFIG.sandbox.available = false;
    ENV_CONFIG.codeServer.mode = "mock";
    ENV_CONFIG.pythonAgent.mode = "mock";
    ENV_CONFIG.pythonAgent.available = false;
  }
}

// Log environment info on startup
console.log(`[Environment] Running on: ${ENV_CONFIG.env}`);
console.log(`[Environment] Database: ${ENV_CONFIG.database.mode}`);
console.log(`[Environment] Sandbox: ${ENV_CONFIG.sandbox.mode} (available: ${ENV_CONFIG.sandbox.available})`);
console.log(`[Environment] Code Server: ${ENV_CONFIG.codeServer.mode}`);
console.log(`[Environment] Python Agent: ${ENV_CONFIG.pythonAgent.mode} (available: ${ENV_CONFIG.pythonAgent.available})`);
console.log(`[Environment] AI Provider: ${ENV_CONFIG.ai.provider}`);
console.log(`[Environment] GPU: ${ENV_CONFIG.gpu.available ? `Yes (${ENV_CONFIG.gpu.device})` : "No"}`);
