/**
 * Simple circuit breaker for async operations.
 *
 * Usage:
 *   import { CircuitBreaker } from './circuit-breaker.mjs';
 *   const cb = new CircuitBreaker('image-gen', { failureThreshold: 5, recoveryTimeoutSeconds: 60 });
 *   const result = await cb.execute(() => generateImage());
 */
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('circuit-breaker');

const STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = (options.recoveryTimeoutSeconds ?? 60) * 1000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;

    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = 0;
    this.halfOpenCalls = 0;
  }

  async execute(fn) {
    if (this.state === STATE.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const err = new Error(`Circuit breaker '${this.name}' is OPEN`);
        err.code = 'CIRCUIT_OPEN';
        logger.warn('circuit open, rejecting call', { name: this.name, retryAfter: this.nextAttempt });
        recordMetric(this.name, 'circuit_breaker_open', {});
        throw err;
      }
      this.state = STATE.HALF_OPEN;
      this.halfOpenCalls = 0;
      logger.info('circuit entering half-open', { name: this.name });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxCalls) {
        this.state = STATE.CLOSED;
        this.successCount = 0;
        this.halfOpenCalls = 0;
        logger.info('circuit closed after recovery', { name: this.name });
        recordMetric(this.name, 'circuit_breaker_closed', {});
      }
    }
  }

  onFailure() {
    this.failureCount++;
    if (this.state === STATE.HALF_OPEN) {
      this.trip();
      return;
    }
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  trip() {
    this.state = STATE.OPEN;
    this.nextAttempt = Date.now() + this.recoveryTimeoutMs;
    logger.error('circuit tripped open', { name: this.name, failureCount: this.failureCount, retryAfter: new Date(this.nextAttempt).toISOString() });
    recordMetric(this.name, 'circuit_breaker_tripped', { failureCount: this.failureCount });
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
    };
  }
}
