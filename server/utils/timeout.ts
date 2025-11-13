/**
 * Execution timeout utility for long-running operations
 */

export interface TimeoutConfig {
  timeoutMs: number;
  operation: string;
}

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  const { timeoutMs, operation } = config;
  
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Default timeout configurations for different operations
 */
export const TIMEOUT_CONFIGS = {
  AGENT_PLAN: { timeoutMs: 60000, operation: 'Planning' },          // 1 minute
  AGENT_CODE: { timeoutMs: 120000, operation: 'Code Generation' },   // 2 minutes
  AGENT_TEST: { timeoutMs: 60000, operation: 'Code Validation' },    // 1 minute
  AGENT_TOTAL: { timeoutMs: 300000, operation: 'Total Workflow' },   // 5 minutes
  CODE_EXECUTION: { timeoutMs: 30000, operation: 'Code Execution' }, // 30 seconds
};
