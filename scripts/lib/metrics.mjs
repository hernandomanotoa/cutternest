#!/usr/bin/env node
/**
 * Metrics accumulator for DevHive/DCOP scripts.
 *
 * Appends metric events to `.agents/memory/metrics.jsonl` and maintains
 * an accumulated dashboard at `.agents/memory/observability-dashboard.json`.
 *
 * Usage:
 *   import { recordMetric, getDashboard } from './metrics.mjs';
 *   recordMetric('optimize', 'compression_count', { value: 5 });
 */
import { appendFileSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MEMORY_DIR = join(ROOT, '.agents', 'memory');
const METRICS_PATH = join(MEMORY_DIR, 'metrics.jsonl');
const DASHBOARD_PATH = join(MEMORY_DIR, 'observability-dashboard.json');

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadDashboard() {
  if (!existsSync(DASHBOARD_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DASHBOARD_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDashboard(dashboard) {
  ensureDir();
  writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2), 'utf8');
}

export function recordMetric(component, metric, data = {}) {
  ensureDir();
  const entry = {
    timestamp: new Date().toISOString(),
    component,
    metric,
    ...data,
  };
  appendFileSync(METRICS_PATH, `${JSON.stringify(entry)}\n`, 'utf8');

  const dashboard = loadDashboard();
  if (!dashboard[component]) dashboard[component] = {};
  const comp = dashboard[component];
  if (!comp[metric]) {
    comp[metric] = { count: 0, last: null, total: 0 };
  }
  comp[metric].count += 1;
  comp[metric].last = entry.timestamp;
  if (typeof data.value === 'number') {
    comp[metric].total += data.value;
  }
  saveDashboard(dashboard);
  return entry;
}

export function getDashboard() {
  return loadDashboard();
}

export function resetDashboard() {
  saveDashboard({});
}
