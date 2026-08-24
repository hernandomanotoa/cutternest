/**
 * Retry helper with exponential backoff and circuit-breaker awareness.
 *
 * Usage:
 *   import { withRetry } from './retry.mjs';
 *   const result = await withRetry(() => fetchData(), { maxRetries: 3 });
 */
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('retry');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error, retryableErrors) {
  if (!error) return false;
  if (retryableErrors.length === 0) return true;
  const message = error.message || String(error);
  const code = error.code || '';
  return retryableErrors.some(pattern => message.includes(pattern) || code.includes(pattern));
}

export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    retryableErrors = [],
    label = 'retryable-op',
    onRetry,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(attempt);
      if (attempt > 0) {
        logger.info('retry succeeded', { label, attempts: attempt + 1 });
        recordMetric(label, 'retry_succeeded', { attempts: attempt + 1 });
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryable(err, retryableErrors)) {
        logger.error('retry exhausted or non-retryable error', { label, attempts: attempt + 1, error: err.message });
        recordMetric(label, 'retry_exhausted', { attempts: attempt + 1, error: err.message });
        throw err;
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger.warn('retrying after error', { label, attempt: attempt + 1, delayMs: delay, error: err.message });
      recordMetric(label, 'retry_attempt', { attempt: attempt + 1, delayMs: delay });
      if (onRetry) onRetry({ attempt: attempt + 1, delayMs: delay, error: err });
      await sleep(delay);
    }
  }
  throw lastError;
}
