#!/usr/bin/env node
/**
 * Token budget calculator for DevHive agents.
 *
 * Estimates the tokens an agent will load from L0-L3 + SKILL + active-tasks
 * and compares them against a budget based on task type.
 *
 * Usage:
 *   node scripts/token-budget.mjs --agent=backend-agent --task="fix login bug"
 *   node scripts/token-budget.mjs --agent=frontend-agent --type=multi --task="refactor components"
 *   node scripts/token-budget.mjs --agent=backend-agent --dry-run
 *   node scripts/token-budget.mjs --files=a.md,b.md --type=swarm
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  readProfile,
  getAgents,
  approximateTokens,
  readFileSafe,
} from './lib/dcop-utils.mjs';

const BUDGETS = {
  simple: 4_000,
  multi: 8_000,
  swarm: 16_000,
};

const args = process.argv.slice(2);
const agentArg = args.find(a => a.startsWith('--agent='))?.split('=')[1];
const taskArg = args.find(a => a.startsWith('--task='))?.split('=')[1] || '';
const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1];
const filesArg = args.find(a => a.startsWith('--files='))?.split('=')[1];
const dryRun = args.includes('--dry-run');
const warnOnly = args.includes('--warn-only');

function detectTaskType(task) {
  const t = task.toLowerCase();
  if (/\bswarm\b|\bmulti[\s-]?agent\b|\borquest/i.test(t)) return 'swarm';
  if (/\brefactor\b|\bmulti[\s-]?file\b|\bseveral\b|\bmodules\b|\bcomponents?\b/i.test(t)) return 'multi';
  return 'simple';
}

function resolvePath(value) {
  if (!value) return null;
  if (value.startsWith('/')) return value;
  return join(ROOT, value);
}

function expandPath(profile, dotPath) {
  const parts = dotPath.split('.');
  let value = profile;
  for (const p of parts) {
    value = value?.[p];
  }
  return resolvePath(value);
}

function collectLoadedFiles(profile, agent) {
  const files = [];
  const layers = [
    expandPath(profile, 'devhive.project_brief'),
    expandPath(profile, 'devhive.conventions'),
    expandPath(profile, 'devhive.current_sprint'),
    expandPath(profile, 'devhive.security_policy'),
    expandPath(profile, 'devhive.domain_rules'),
    agent ? join(ROOT, '.agents', agent, 'SKILL.md') : null,
    agent ? join(ROOT, '.agents', agent, 'memory', 'active-tasks.md') : null,
  ];
  for (const p of layers) {
    if (p && existsSync(p) && statSync(p).isFile()) files.push(p);
  }
  return files;
}

function calculateBudget(files) {
  let tokens = 0;
  const breakdown = [];
  for (const p of files) {
    const text = readFileSafe(p) || '';
    const t = approximateTokens(text);
    tokens += t;
    breakdown.push({ path: p.replace(ROOT + '/', ''), tokens: t });
  }
  return { tokens, breakdown };
}

export function checkBudget({ agent, task = '', type, files = [] }) {
  const profile = readProfile();
  const resolvedType = type || detectTaskType(task);
  const budget = BUDGETS[resolvedType] ?? BUDGETS.simple;

  let loadedFiles = files.length ? files : collectLoadedFiles(profile, agent);
  if (agent && !files.length) {
    loadedFiles = collectLoadedFiles(profile, agent);
  }

  const { tokens, breakdown } = calculateBudget(loadedFiles);
  const overBudget = tokens > budget;
  const ratio = Math.round((tokens / budget) * 100);

  return {
    agent,
    task,
    type: resolvedType,
    budget,
    tokens,
    ratio,
    overBudget,
    files: loadedFiles.map(p => p.replace(ROOT + '/', '')),
    breakdown,
  };
}

function formatReport(result) {
  const status = result.overBudget ? '⚠️ OVER BUDGET' : '✅ WITHIN BUDGET';
  const lines = [
    `[token-budget] ${status}`,
    `[token-budget] Agent: ${result.agent || '(none)'}`,
    `[token-budget] Task: ${result.task || '(none)'}`,
    `[token-budget] Type: ${result.type}`,
    `[token-budget] Budget: ${result.budget.toLocaleString()} tokens`,
    `[token-budget] Estimated: ${result.tokens.toLocaleString()} tokens (${result.ratio}%)`,
    '[token-budget] Files loaded:',
    ...result.breakdown.map(b => `  - ${b.path}: ${b.tokens.toLocaleString()} tokens`),
  ];
  if (result.overBudget) {
    lines.push(`[token-budget] Suggestion: compress L2/L3 memory, use MCP graph queries, or split into smaller tasks.`);
  }
  return lines.join('\n');
}

function main() {
  const profile = readProfile();
  if (!agentArg && !filesArg) {
    console.error('[token-budget] ERROR: --agent or --files required');
    process.exit(2);
  }

  const files = filesArg ? filesArg.split(',').map(p => resolvePath(p.trim())) : [];
  const result = checkBudget({ agent: agentArg, task: taskArg, type: typeArg, files });

  recordMetric('token-budget', 'budget_checked', {
    agent: agentArg,
    type: result.type,
    budget: result.budget,
    tokens: result.tokens,
    overBudget: result.overBudget,
  });

  console.log(formatReport(result));

  if (dryRun || warnOnly) {
    process.exit(0);
  }

  if (result.overBudget) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
