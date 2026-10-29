#!/usr/bin/env node
/**
 * Guardian stall detector.
 *
 * Reads `.agents/guardian/policies.json` guardrails and `.agents/guardian/audit.log`
 * and detects looping or stuck agents. When a stall is detected it:
 *   - writes an alert to the audit log,
 *   - marks the agent's `active-tasks.md` as `stalled`,
 *   - prints a summary to stdout and exits with a non-zero code.
 *
 * Usage:
 *   node .agents/guardian/scripts/detect-stall.mjs
 *   node .agents/guardian/scripts/detect-stall.mjs --now 2026-08-05T14:00:00Z
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();

const argv = process.argv.slice(2);
const nowArg = argv.find(a => a.startsWith('--now='));
const dryRun = argv.includes('--dry-run');
const NOW = nowArg ? new Date(nowArg.split('=')[1]) : new Date();
const policiesOverride = argv.find(a => a.startsWith('--policies-path='));
const auditOverride = argv.find(a => a.startsWith('--audit-path='));
const memoryOverride = argv.find(a => a.startsWith('--memory-dir='));

const POLICIES_PATH = policiesOverride
  ? policiesOverride.split('=')[1]
  : join(ROOT, '.agents', 'guardian', 'policies.json');
const AUDIT_PATH = auditOverride
  ? auditOverride.split('=')[1]
  : join(ROOT, '.agents', 'guardian', 'audit.log');
const MEMORY_DIR = memoryOverride
  ? memoryOverride.split('=')[1]
  : join(ROOT, '.agents');

function iso(ts) {
  return ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    const data = readFileSync(path, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[detect-stall] ERROR: cannot parse ${path}: ${err.message}`);
    return null;
  }
}

function readAudit(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function parseAuditLine(line) {
  // Format: [ISO_TIMESTAMP] [AGENT] [ACTION] [RESOURCE] [RESULT] [TOKEN] [QUEUE_LEN]
  const m = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]*)\](?:\s+\[([^\]]*)\])?/);
  if (!m) return null;
  return {
    timestamp: m[1],
    agent: m[2],
    action: m[3],
    resource: m[4],
    result: m[5],
    token: m[6] || '-',
    queueLen: m[7] || '-',
  };
}

function backupAudit() {
  if (!existsSync(AUDIT_PATH)) return;
  const suffix = iso(NOW).replace(/[:.]/g, '-').replace('Z', '');
  copyFileSync(AUDIT_PATH, `${AUDIT_PATH}.${suffix}.bak`);
}

function appendAudit(line) {
  backupAudit();
  writeFileSync(AUDIT_PATH, `${line}\n`, { flag: 'a' });
}

function markStalled(agent, reason) {
  const path = join(MEMORY_DIR, agent, 'memory', 'active-tasks.md');
  if (!existsSync(path)) return false;
  let content = readFileSync(path, 'utf8');
  // Find first in-progress row in a table and mark it stalled
  const updated = content.replace(
    /\|\s*(in_progress|IN_PROGRESS|🔄 IN_PROGRESS)\s*\|/,
    '| stalled |'
  );
  if (updated === content) return false;
  writeFileSync(path, updated, 'utf8');
  return true;
}

function detectRepetition(entries, threshold) {
  const stalls = [];
  let run = 1;
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1];
    const b = entries[i];
    const same =
      a && b &&
      a.agent === b.agent &&
      a.action === b.action &&
      a.resource === b.resource &&
      a.result === b.result;
    if (same) {
      run++;
      if (run === threshold + 1) {
        stalls.push({
          type: 'repetition',
          agent: a.agent,
          action: a.action,
          resource: a.resource,
          result: a.result,
          count: run,
          lastToken: a.token,
        });
      }
    } else {
      run = 1;
    }
  }
  return stalls;
}

function detectInactivity(entries, timeoutMinutes) {
  if (entries.length === 0) return [];
  const last = entries[entries.length - 1];
  const lastTs = new Date(last.timestamp);
  const diffMinutes = (NOW - lastTs) / (60 * 1000);
  if (diffMinutes <= timeoutMinutes) return [];
  return [{
    type: 'inactivity',
    agent: last.agent,
    lastTimestamp: last.timestamp,
    idleMinutes: Math.round(diffMinutes),
  }];
}

function detectMaxSteps(entries, maxSteps) {
  // Count entries per active token; if any token exceeds maxSteps, stall.
  const counts = {};
  for (const e of entries) {
    if (!e.token || e.token === '-') continue;
    counts[e.token] = (counts[e.token] || 0) + 1;
  }
  const stalls = [];
  for (const [token, count] of Object.entries(counts)) {
    if (count > maxSteps) {
      const last = [...entries].reverse().find(e => e.token === token);
      stalls.push({
        type: 'max_steps',
        token,
        agent: last?.agent || 'unknown',
        count,
        maxSteps,
      });
    }
  }
  return stalls;
}

function main() {
  const policies = readJson(POLICIES_PATH);
  if (!policies) {
    console.error('[detect-stall] ERROR: policies.json not found or invalid');
    process.exit(2);
  }

  const guardrails = policies.guardrails || {};
  const maxSteps = guardrails.max_steps_default ?? 15;
  const repetitionThreshold = guardrails.stall_detection?.repetition_threshold ?? 2;
  const inactivityTimeout = guardrails.stall_detection?.inactivity_timeout_minutes ?? 10;

  const rawLines = readAudit(AUDIT_PATH);
  const entries = rawLines.map(parseAuditLine).filter(Boolean);

  const stalls = [
    ...detectRepetition(entries, repetitionThreshold),
    ...detectInactivity(entries, inactivityTimeout),
    ...detectMaxSteps(entries, maxSteps),
  ];

  if (stalls.length === 0) {
    console.log(`[detect-stall] OK: no stalls detected (entries=${entries.length}, max_steps=${maxSteps}, repetition_threshold=${repetitionThreshold}, inactivity_timeout=${inactivityTimeout}m)${dryRun ? ' [DRY-RUN]' : ''}`);
    process.exit(0);
  }

  if (dryRun) {
    console.log(`[detect-stall] STALL DETECTED: ${stalls.length} issue(s) [DRY-RUN]`);
    for (const s of stalls) {
      console.log(`  - ${s.type}: ${JSON.stringify(s)}`);
    }
    process.exit(1);
  }

  const alertedAgents = new Set();
  for (const s of stalls) {
    const alert = `[${iso(NOW)}] [guardian] [STALL_DETECTED] [${s.type}] [ALERT] [${s.token || '-'}] ${JSON.stringify(s)}`;
    appendAudit(alert);
    const agent = s.agent;
    if (agent && !alertedAgents.has(agent)) {
      const marked = markStalled(agent, s.type);
      alertedAgents.add(agent);
      console.log(`[detect-stall] ${marked ? 'Marked' : 'Could not mark'} ${agent} active-tasks.md as stalled (${s.type})`);
    }
  }

  console.log(`[detect-stall] STALL DETECTED: ${stalls.length} issue(s)`);
  for (const s of stalls) {
    console.log(`  - ${s.type}: ${JSON.stringify(s)}`);
  }
  process.exit(1);
}

main();
