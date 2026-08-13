#!/usr/bin/env node
/**
 * DCOP #optimize implementation.
 *
 * Usage:
 *   node scripts/optimize.mjs           # runs only if context >70%
 *   node scripts/optimize.mjs --force   # always run
 *   node scripts/optimize.mjs --dry-run # report, do not modify files
 *
 * Extensible: reads .devhive/profile.yaml to discover agents and plugins.
 * New agents are processed automatically as long as they have a memory/ dir.
 * Templates (*.hbs) and rendered SKILL.md files are never touched.
 */
import { readFileSync, writeFileSync, existsSync, statSync, renameSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  ROOT,
  MEMORY_DIR,
  readProfile,
  getAgents,
  getAgentMemoryDir,
  getAgentMemoryFiles,
  estimateContextUsage,
  gitStatus,
  countLines,
  approximateTokens,
  todayDir,
  ensureDir,
  archiveFile,
  compressToStub,
  appendOptimizationLog,
  writeSessionState,
  formatConsoleOutput,
  isTemplateFile,
  isSkillFile,
  readFileSafe,
} from './lib/dcop-utils.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

const profile = readProfile();
const agents = getAgents(profile);
const context = estimateContextUsage(profile);

if (!force && context.percentage < 70) {
  console.log(`[GUARDIAN] Contexto al ${context.percentage}%. Umbral no alcanzado. Usa --force para optimizar de todos modos.`);
  process.exit(0);
}

// P0 inventory
const status = gitStatus();
const modifiedFiles = status.filter(s => s.status !== '??').length;
const untrackedFiles = status.filter(s => s.status === '??').length;

function scanForErrors(files) {
  // P0 errors must be explicitly marked. This avoids false positives from
  // words like "error" or "failure" in normal prose or success logs.
  const markers = /\[ACTIVE_ERROR\]|\[BLOCKER\]|\[CRITICAL\]|\[REGRESSION\]/i;
  let errors = 0;
  for (const f of files) {
    const text = readFileSafe(f) || '';
    if (markers.test(text)) errors++;
  }
  return errors;
}

const allAgentMemoryFiles = agents.flatMap(getAgentMemoryFiles);
const activeErrors = scanForErrors(allAgentMemoryFiles.filter(p => /active-tasks|blockers|queue/.test(basename(p))));

function scanOpenTokens(files) {
  let tokens = 0;
  for (const f of files) {
    const text = readFileSafe(f) || '';
    tokens += (text.match(/GUARD-[A-Z]+-/g) || []).length;
  }
  return tokens;
}

const openTokens = scanOpenTokens(allAgentMemoryFiles.filter(p => /active-tasks|queue/.test(basename(p))));

const p0 = { errors: activeErrors, modified: modifiedFiles, tokens: openTokens };

// Counters
let compressed = 0;
let archived = 0;
let eliminated = 0;
let conserved = 0;
let tokensFreed = 0;
const decisions = [];
const hotFiles = [];
const stubDir = join(MEMORY_DIR, 'stubs');
ensureDir(stubDir);

// P1: mark hot files
for (const p of allAgentMemoryFiles) {
  if (/active-tasks|queue|blockers/.test(basename(p))) {
    hotFiles.push({ path: relativeRoot(p), layer: 'L4 / agent memory', priority: 'P1', reason: 'Active task state' });
    conserved++;
  }
}
hotFiles.push(
  { path: '.agents/memory/context-policy.md', layer: 'L3 / policy', priority: 'P1', reason: 'DCOP definition' },
  { path: '.agents/memory/aliases.md', layer: 'L3 / policy', priority: 'P1', reason: 'Alias catalog' },
  { path: '.agents/memory/session-state.md', layer: 'L3 / policy', priority: 'P1', reason: 'Session snapshot' },
);
conserved += 3;

// P2/P4 compression: learnings, completed-tasks, audit/finding reports
for (const agent of agents) {
  const memDir = getAgentMemoryDir(agent);
  if (!existsSync(memDir)) continue;

  const files = getAgentMemoryFiles(agent);
  for (const p of files) {
    if (isTemplateFile(p) || isSkillFile(p)) continue;
    const name = basename(p);
    const text = readFileSafe(p) || '';
    const lines = countLines(text);
    const tokens = approximateTokens(text);

    if (name === 'active-tasks.md' || name === 'queue.md' || name === 'blockers.md') {
      conserved++;
      continue;
    }

    if (name === 'learnings.md' && lines > 50) {
      if (!dryRun) {
        const stubPath = join(stubDir, `${agent}-learnings.md`);
        archiveFile(p, todayDir(), { id: `${agent}-learnings-${Date.now()}`, priority: 'P4', reason: 'Compressed by DCOP', title: `${agent} learnings` });
        compressToStub(p, stubPath, `${agent} learnings`);
        writeFileSync(p, readFileSafe(stubPath), 'utf8');
      }
      compressed++;
      archived++;
      tokensFreed += Math.max(0, tokens - approximateTokens(readFileSafe(join(stubDir, `${agent}-learnings.md`)) || ''));
      decisions.push({ decision: `${agent} learnings`, stub: `${agent}-learnings.md`, location: join(stubDir, `${agent}-learnings.md`) });
      continue;
    }

    if (name === 'completed-tasks.md' && lines > 50) {
      if (!dryRun) {
        archiveFile(p, todayDir(), { id: `${agent}-completed-${Date.now()}`, priority: 'P4', reason: 'Archived by DCOP', title: `${agent} completed tasks` });
        const stubPath = join(stubDir, `${agent}-completed-tasks.md`);
        compressToStub(p, stubPath, `${agent} completed tasks`);
        writeFileSync(p, readFileSafe(stubPath), 'utf8');
      }
      archived++;
      compressed++;
      tokensFreed += Math.max(0, tokens - 50);
      decisions.push({ decision: `${agent} completed tasks`, stub: `${agent}-completed-tasks.md`, location: join(stubDir, `${agent}-completed-tasks.md`) });
      continue;
    }

    if (/\b(audit|findings|report)\b/.test(name) && lines > 50) {
      if (!dryRun) {
        archiveFile(p, todayDir(), { id: `${agent}-${name}-${Date.now()}`, priority: 'P4', reason: 'Old audit/finding report', title: `${agent} ${name}` });
        const stubPath = join(stubDir, `${agent}-${name}`);
        compressToStub(p, stubPath, `${agent} ${name}`);
        writeFileSync(p, readFileSafe(stubPath), 'utf8');
      }
      archived++;
      compressed++;
      tokensFreed += Math.max(0, tokens - 50);
      decisions.push({ decision: `${agent} ${name}`, stub: `${agent}-${name}`, location: join(stubDir, `${agent}-${name}`) });
      continue;
    }

    // Everything else stays as P1/P2
    conserved++;
  }
}

// P3: report disposable conversation logs (not implemented as file deletion for safety)
// Heuristic: count empty or social lines in agent memory? Skip for now.
eliminated = 0;

// Build session state
const sessionState = {
  sessionId: `dcop-${Date.now()}`,
  contextUsage: context.percentage,
  agent: 'Guardian',
  userRequest: 'Automated DCOP run via `node scripts/optimize.mjs`',
  active: [
    { type: 'user-task', id: `dcop-run-${Date.now()}`, summary: 'Run DCOP optimization', owner: 'user' },
    { type: 'error', id: '-', summary: activeErrors ? `${activeErrors} active error markers` : 'none', owner: '-' },
    { type: 'token', id: '-', summary: openTokens ? `${openTokens} open token markers` : 'none', owner: '-' },
    { type: 'modified-file', id: '-', summary: `${modifiedFiles} modified + ${untrackedFiles} untracked files`, owner: '-' },
  ],
  blockers: activeErrors ? [`${activeErrors} active error markers in agent memory`] : [],
  hotFiles,
  decisions,
  nextStep: 'Review optimization report and continue with the current task',
};

if (!dryRun) {
  writeSessionState(sessionState);
  appendOptimizationLog({
    command: '#optimize',
    context: context.percentage,
    p0,
    p1: conserved,
    p2: compressed,
    p3: eliminated,
    p4: archived,
    conserved,
    compressed,
    eliminated,
    archived,
    tokensFreed,
    next: 'review-optimization-report',
  });
}

const output = formatConsoleOutput({
  trigger: force ? 'forced' : 'threshold',
  context,
  p0,
  summary: { conserved, compressed, eliminated, archived, tokensFreed },
  nextStep: sessionState.nextStep,
});

console.log(output);

if (dryRun) {
  console.log('\n[DRY-RUN] No files were modified.');
}

function relativeRoot(p) {
  return p.replace(ROOT + '/', '').replace(/\\/g, '/');
}
