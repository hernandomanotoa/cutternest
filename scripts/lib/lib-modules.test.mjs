import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getLogger } from './logger.mjs';
import { recordMetric, getDashboard } from './metrics.mjs';
import { timed } from './decorators.mjs';
import { withRetry } from './retry.mjs';
import { CircuitBreaker } from './circuit-breaker.mjs';
import { LoopController } from './loop-controller.mjs';
import { SessionTracker } from './session-tracker.mjs';
import { TokenBudgetManager } from './token-budget-manager.mjs';
import { ContextManager } from './context-manager.mjs';
import { ResultCache } from './result-cache.mjs';

describe('logger.mjs', () => {
  it('returns a logger with standard levels', () => {
    const logger = getLogger('test');
    assert.equal(typeof logger.info, 'function');
    assert.equal(typeof logger.warn, 'function');
    assert.equal(typeof logger.error, 'function');
    assert.equal(typeof logger.debug, 'function');
  });
});

describe('metrics.mjs', () => {
  it('records a metric and updates dashboard', () => {
    recordMetric('test-suite', 'test_metric', { value: 42 });
    const dashboard = getDashboard();
    assert.ok(dashboard['test-suite']);
    assert.ok(dashboard['test-suite'].test_metric);
    assert.equal(typeof dashboard['test-suite'].test_metric.count, 'number');
  });
});

describe('decorators.mjs', () => {
  it('timed wraps async functions and preserves result', async () => {
    const fn = timed('test', async (x) => x * 2);
    const result = await fn(21);
    assert.equal(result, 42);
  });
});

describe('retry.mjs', () => {
  it('succeeds on first attempt', async () => {
    const result = await withRetry(() => 'ok', { retryableErrors: ['ERR'] });
    assert.equal(result, 'ok');
  });

  it('retries on retryable error then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('NETWORK_ERROR');
      return 'ok';
    }, { retryableErrors: ['NETWORK_ERROR'], baseDelayMs: 10, maxDelayMs: 50 });
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws when retries exhausted', async () => {
    await assert.rejects(() => withRetry(() => { throw new Error('ERR'); }, { retryableErrors: ['ERR'], maxRetries: 1, baseDelayMs: 10 }), /ERR/);
  });
});

describe('circuit-breaker.mjs', () => {
  it('stays closed on success', async () => {
    const cb = new CircuitBreaker('test-success', { failureThreshold: 2 });
    await cb.execute(() => 'ok');
    assert.equal(cb.getState().state, 'CLOSED');
  });

  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker('test-open', { failureThreshold: 2, recoveryTimeoutSeconds: 60 });
    await cb.execute(() => { throw new Error('fail'); }).catch(() => {});
    await cb.execute(() => { throw new Error('fail'); }).catch(() => {});
    assert.equal(cb.getState().state, 'OPEN');
  });
});

describe('loop-controller.mjs', () => {
  it('increments iterations within limit', () => {
    const loop = new LoopController('test-loop', { sessionId: 'test-loop-session' });
    for (let i = 0; i < 3; i++) loop.check();
    assert.equal(loop.getStatus().iterations, 3);
  });

  it('throws when max iterations exceeded', () => {
    const loop = new LoopController('test-loop-limit', { sessionId: 'test-loop-limit-session' });
    loop.limits.maxIterations = 2;
    loop.check();
    loop.check();
    assert.throws(() => loop.check(), /Max iterations exceeded/);
  });

  it('detects repetition', () => {
    const loop = new LoopController('test-loop-rep', { sessionId: 'test-loop-rep-session' });
    loop.limits.repetitionThreshold = 1;
    loop.recordStep({ agent: 'a', action: 'Edit', resource: 'x' });
    loop.recordStep({ agent: 'a', action: 'Edit', resource: 'x' });
    loop.detectRepetition();
    assert.ok(loop.getStatus().stalls.includes('repetition'));
  });
});

describe('session-tracker.mjs', () => {
  const sessionId = `test-session-${Date.now()}`;
  it('tracks tokens and tool calls', () => {
    const tracker = new SessionTracker(sessionId);
    tracker.addTokens(100, 50);
    tracker.addToolCall(2);
    const usage = tracker.getUsage();
    assert.equal(usage.tokens_in, 100);
    assert.equal(usage.tokens_out, 50);
    assert.equal(usage.tool_calls, 2);
  });
});

describe('token-budget-manager.mjs', () => {
  it('allows a simple task and reports remaining budget', () => {
    const tbm = new TokenBudgetManager({ sessionBudget: 100_000, sessionId: `tbm-${Date.now()}` });
    const result = tbm.checkTask({ agent: 'docs-agent', task: 'update readme', type: 'simple', files: [] });
    assert.equal(result.allowed, true);
    assert.ok(result.remaining > 0);
  });
});

describe('context-manager.mjs', () => {
  it('builds a context plan for a task', () => {
    const cm = new ContextManager();
    const plan = cm.buildContext({ task: 'fix auth login bug' });
    assert.ok(plan.files.length >= 5);
    assert.ok(plan.tokensEstimate > 0);
    assert.ok(['auth-agent', 'backend-agent', 'frontend-agent'].includes(plan.selectedAgent));
  });
});

describe('result-cache.mjs', () => {
  const cache = new ResultCache({ ttlSeconds: 3600 });
  const key = cache.key('test-ns', { a: 1, ts: Date.now() });

  it('returns undefined for missing key', () => {
    const missingKey = cache.key('test-ns-missing', { a: Date.now() });
    assert.equal(cache.get(missingKey), undefined);
  });

  it('stores and retrieves a value', () => {
    const storeKey = cache.key('test-ns-store', { a: 1, ts: Date.now() });
    cache.set(storeKey, { foo: 'bar' });
    assert.deepEqual(cache.get(storeKey), { foo: 'bar' });
  });

  it('expires entries after TTL', () => {
    const shortCache = new ResultCache({ ttlSeconds: -1 });
    const k = shortCache.key('expire', { x: 1, ts: Date.now() });
    shortCache.set(k, 'gone');
    assert.equal(shortCache.get(k), undefined);
  });
});
