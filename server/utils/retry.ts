/**
 * Exponential backoff retry utility for API calls
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['rate_limit', 'timeout', 'network', 'ECONNRESET', 'ETIMEDOUT'],
};

function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorString = error?.message?.toLowerCase() || error?.toString().toLowerCase() || '';
  const errorCode = error?.code?.toLowerCase() || '';
  const errorType = error?.type?.toLowerCase() || '';
  
  return retryableErrors.some(retryable => 
    errorString.includes(retryable.toLowerCase()) ||
    errorCode.includes(retryable.toLowerCase()) ||
    errorType.includes(retryable.toLowerCase())
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === opts.maxRetries) {
        break;
      }
      
      if (!isRetryableError(error, opts.retryableErrors)) {
        console.log(`[Retry] Non-retryable error, failing immediately:`, error.message);
        throw error;
      }
      
      const delayMs = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      
      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed. Retrying in ${delayMs}ms...`);
      console.log(`[Retry] Error:`, error.message);
      
      await delay(delayMs);
    }
  }
  
  console.error(`[Retry] All ${opts.maxRetries + 1} attempts failed`);
  throw lastError;
}

export async function withOpenAIRetry<T>(
  fn: () => Promise<T>,
  customOptions?: RetryOptions
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    retryableErrors: [
      'rate_limit',
      'timeout',
      'overloaded',
      'server_error',
      'connection',
      '429',
      '500',
      '502',
      '503',
      '504',
    ],
    ...customOptions,
  });
}
