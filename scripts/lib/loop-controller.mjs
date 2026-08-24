/**
 * Loop controller for DevHive / CutterNest scripts.
 *
 * Reads runtime limits from `config/runtime-config.yaml` and
 * `.agents/guardian/policies.json` to detect stalls and enforce
 * iteration / handoff / execution-time budgets.
 *
 * Usage:
 *   import { LoopController } from './loop-controller.mjs';
 *   const loop = new LoopController('optimize');
 *   loop.check();
 *   loop.recordStep({ agent: 'backend-agent', action: 'Edit', resource: 'foo.py' });
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';
import { parseYaml, ROOT, readFileSafe } from './dcop-utils.mjs';

const logger = getLogger('loop-controller');

const RUNTIME_CONFIG_PATH = join(ROOT, 'config', 'runtime-config.yaml');
const POLICIES_PATH = join(ROOT, '.agents', 'guardian', 'policies.json');

function loadRuntimeConfig() {
  const defaults = {
    runtime: {
      max_iterations: 15,
      max_tool_calls: 50,
      max_execution_time_seconds: 120,
      default_timeout_seconds: 30,
    },
    retry: { max_retries: 3, backoff_strategy: 'exponential', base_delay_ms: 500, max_delay_ms: 8000 },
    circuit_breaker: { failure_threshold: 5, recovery_timeout_seconds: 60, half_open_max_calls: 1 },
    stall_detection: { max_steps_default: 15, max_handoffs_per_task: 5, repetition_threshold: 2, inactivity_timeout_minutes: 10 },
    script_overrides: {},
  };
  if (!existsSync(RUNTIME_CONFIG_PATH)) {
    logger.warn('runtime config not found, using defaults', { path: RUNTIME_CONFIG_PATH });
    return defaults;
  }
  try {
    const parsed = parseYaml(readFileSync(RUNTIME_CONFIG_PATH, 'utf8'));
    return {
      runtime: { ...defaults.runtime, ...parsed.runtime },
      retry: { ...defaults.retry, ...parsed.retry },
      circuit_breaker: { ...defaults.circuit_breaker, ...parsed.circuit_breaker },
      stall_detection: { ...defaults.stall_detection, ...parsed.stall_detection },
      script_overrides: parsed.script_overrides || {},
    };
  } catch (err) {
    logger.error('failed to parse runtime config', { error: err.message });
    return defaults;
  }
}

function loadPolicies() {
  if (!existsSync(POLICIES_PATH)) return { guardrails: {} };
  try {
    return JSON.parse(readFileSync(POLICIES_PATH, 'utf8'));
  } catch (err) {
    logger.error('failed to parse policies', { error: err.message });
    return { guardrails: {} };
  }
}

export class LoopController {
  constructor(scriptName = 'default') {
    this.scriptName = scriptName;
    this.config = loadRuntimeConfig();
    this.policies = loadPolicies();
    this.startedAt = Date.now();
    this.iterations = 0;
    this.toolCalls = 0;
    this.handoffs = 0;
    this.steps = [];
    this.lastActivityAt = Date.now();
    this.stallsReported = new Set();

    const overrides = this.config.script_overrides[scriptName] || {};
    this.limits = {
      maxIterations: overrides.max_iterations ?? this.config.runtime.max_iterations,
      maxToolCalls: overrides.max_tool_calls ?? this.config.runtime.max_tool_calls,
      maxExecutionTimeSeconds: overrides.max_execution_time_seconds ?? this.config.runtime.max_execution_time_seconds,
      repetitionThreshold: this.config.stall_detection.repetition_threshold,
      inactivityTimeoutMinutes: this.config.stall_detection.inactivity_timeout_minutes,
    };
  }

  check() {
    this.iterations++;
    this.lastActivityAt = Date.now();

    if (this.iterations > this.limits.maxIterations) {
      const err = new Error(`Max iterations exceeded: ${this.iterations} > ${this.limits.maxIterations}`);
      err.code = 'MAX_ITERATIONS';
      this.reportStall('max_iterations', { iterations: this.iterations, limit: this.limits.maxIterations });
      throw err;
    }

    const elapsedSeconds = (Date.now() - this.startedAt) / 1000;
    if (elapsedSeconds > this.limits.maxExecutionTimeSeconds) {
      const err = new Error(`Max execution time exceeded: ${elapsedSeconds.toFixed(1)}s > ${this.limits.maxExecutionTimeSeconds}s`);
      err.code = 'MAX_EXECUTION_TIME';
      this.reportStall('max_execution_time', { elapsedSeconds, limit: this.limits.maxExecutionTimeSeconds });
      throw err;
    }

    this.detectRepetition();
    this.detectInactivity();
  }

  recordToolCall() {
    this.toolCalls++;
    this.lastActivityAt = Date.now();
    if (this.toolCalls > this.limits.maxToolCalls) {
      const err = new Error(`Max tool calls exceeded: ${this.toolCalls} > ${this.limits.maxToolCalls}`);
      err.code = 'MAX_TOOL_CALLS';
      this.reportStall('max_tool_calls', { toolCalls: this.toolCalls, limit: this.limits.maxToolCalls });
      throw err;
    }
  }

  recordHandoff() {
    this.handoffs++;
    this.lastActivityAt = Date.now();
    const maxHandoffs = this.config.stall_detection.max_handoffs_per_task ?? 5;
    if (this.handoffs > maxHandoffs) {
      const err = new Error(`Max handoffs exceeded: ${this.handoffs} > ${maxHandoffs}`);
      err.code = 'MAX_HANDOFFS';
      this.reportStall('max_handoffs', { handoffs: this.handoffs, limit: maxHandoffs });
      throw err;
    }
  }

  recordStep(step) {
    this.steps.push({ ...step, ts: new Date().toISOString() });
    this.lastActivityAt = Date.now();
  }

  detectRepetition() {
    if (this.steps.length < 2) return;
    const threshold = this.limits.repetitionThreshold;
    let run = 1;
    for (let i = this.steps.length - 1; i > 0; i--) {
      const a = this.steps[i];
      const b = this.steps[i - 1];
      if (a.agent === b.agent && a.action === b.action && a.resource === b.resource) {
        run++;
      } else {
        break;
      }
      if (run > threshold) {
        this.reportStall('repetition', { agent: a.agent, action: a.action, resource: a.resource, count: run });
        return;
      }
    }
  }

  detectInactivity() {
    const idleMinutes = (Date.now() - this.lastActivityAt) / (60 * 1000);
    if (idleMinutes > this.limits.inactivityTimeoutMinutes) {
      this.reportStall('inactivity', { idleMinutes: Math.round(idleMinutes) });
    }
  }

  reportStall(type, meta) {
    if (this.stallsReported.has(type)) return;
    this.stallsReported.add(type);
    logger.error('stall detected', { type, script: this.scriptName, ...meta });
    recordMetric('loop-controller', 'stall_detected', { type, script: this.scriptName, ...meta });
  }

  getStatus() {
    return {
      script: this.scriptName,
      iterations: this.iterations,
      toolCalls: this.toolCalls,
      handoffs: this.handoffs,
      elapsedSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      limits: this.limits,
      stalls: [...this.stallsReported],
    };
  }
}
