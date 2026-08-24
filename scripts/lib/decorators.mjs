#!/usr/bin/env node
/**
 * Decorators for DevHive/DCOP scripts.
 *
 * Provides `@timed` and `@traced` as higher-order functions (JavaScript does not
 * yet support stage-3 decorators natively in all Node versions without flags).
 *
 * Usage:
 *   import { timed, traced } from './decorators.mjs';
 *   const myFn = timed('component', async (x) => { ... });
 *   const result = await myFn(42);
 */
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

export function timed(component, fn) {
  const logger = getLogger(component);
  return async (...args) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      logger.info(`${fn.name || 'anonymous'} completed`, { duration_ms: duration });
      recordMetric(component, 'function_duration', { value: duration, function: fn.name || 'anonymous' });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      logger.error(`${fn.name || 'anonymous'} failed`, { duration_ms: duration, error: err.message });
      recordMetric(component, 'function_duration', { value: duration, function: fn.name || 'anonymous', error: true });
      throw err;
    }
  };
}

export function traced(component, fn) {
  const logger = getLogger(component);
  return async (...args) => {
    const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info(`${fn.name || 'anonymous'} start`, { call_id: callId, args: args.length });
    try {
      const result = await fn(...args);
      logger.info(`${fn.name || 'anonymous'} end`, { call_id: callId });
      return result;
    } catch (err) {
      logger.error(`${fn.name || 'anonymous'} error`, { call_id: callId, error: err.message });
      throw err;
    }
  };
}
