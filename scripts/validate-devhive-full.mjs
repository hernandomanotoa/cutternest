#!/usr/bin/env node
/**
 * Full DevHive validation.
 *
 * Usage:
 *   node scripts/validate-devhive-full.mjs
 *
 * Checks everything in validate-devhive.mjs PLUS:
 *   - DCOP scripts exist and are readable.
 *   - session-state.md and optimization.log exist and are recent (<24h).
 *   - Agent memory directories contain only canonical files.
 *   - Stubs in .agents/memory/stubs/ are <=50 tokens (~300 chars).
 *   - ADRs exist under .devhive/decisions/ if profile references them.
 *
 * This is intended to be run before a long agent session or in CI.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname);
const PROFILE_PATH = join(ROOT, '.devhive', 'profile.yaml');
const MEMORY_DIR = join(ROOT, '.agents', 'memory');
const STUBS_DIR = join(MEMORY_DIR, 'stubs');
const AGENTS_DIR = join(ROOT, '.agents');
const DCOP_SCRIPTS = [
  'scripts/optimize.mjs',
  'scripts/checkpoint.mjs',
  'scripts/resume.mjs',
  'scripts/lib/dcop-utils.mjs',
];

const logger = getLogger('validate-devhive-full');

const CANONICAL_MEMORY_FILES = new Set([
  'active-tasks.md',
  'queue.md',
  'blockers.md',
  'learnings.md',
  'completed-tasks.md',
]);

// Some agents have additional memory files that are part of their own contract.
const MEMORY_CONTRACT_EXCEPTIONS = {
  'knowledge-graph-agent': new Set([
    'queries.md',
    'queries.cold.md',
    'edges.md',
    'orphans.md',
    'mcp-status.md',
  ]),
};

// Maximum chars for a ~50-token stub (rough heuristic: 6 chars/token).
const STUB_MAX_CHARS = 300;

let errors = 0;
let warnings = 0;

function fail(message) {
  errors++;
  logger.error(message, { tag: 'validate-full' });
}

function warn(message) {
  warnings++;
  logger.warn(message, { tag: 'validate-full' });
}

function ok(message) {
  logger.info(message, { tag: 'validate-full' });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ value: root, indent: -1, type: 'object', key: null }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = line.replace(/\t/g, '  ');
    const indent = bare.search(/\S/);
    if (indent === -1) continue;

    const content = bare.trim();
    if (content.startsWith('#')) continue;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (content.startsWith('-')) {
      let arrayParent = parent;
      if (arrayParent.type !== 'array') {
        const arr = [];
        arrayParent = { value: arr, indent, type: 'array', key: null };
        stack.push(arrayParent);
      }
      const itemValue = content.slice(1).trim();
      if (itemValue.includes(':')) {
        const idx = arrayParent.value.length;
        arrayParent.value[idx] = {};
        const [key, ...rest] = itemValue.split(':');
        const val = rest.join(':').trim();
        arrayParent.value[idx][key.trim()] = parseScalar(val);
        stack.push({ value: arrayParent.value[idx], indent, type: 'object', key: idx });
      } else {
        arrayParent.value.push(parseScalar(itemValue));
      }
    } else if (content.includes(':')) {
      const idx = content.indexOf(':');
      const key = content.slice(0, idx).trim();
      const val = content.slice(idx + 1).trim();

      if (val === '') {
        let nextType = 'object';
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].replace(/\t/g, '  ');
          if (next.trim() === '' || next.trim().startsWith('#')) continue;
          const nextIndent = next.search(/\S/);
          if (nextIndent <= indent) break;
          if (next.trim().startsWith('-')) {
            nextType = 'array';
          }
          break;
        }
        if (nextType === 'array') {
          parent.value[key] = [];
          stack.push({ value: parent.value[key], indent, type: 'array', key });
        } else {
          parent.value[key] = {};
          stack.push({ value: parent.value[key], indent, type: 'object', key });
        }
      } else {
        parent.value[key] = parseScalar(val);
      }
    }
  }

  return root;
}

function approximateTokens(text) {
  return Math.round(text.length / 6);
}

function readProfile() {
  if (!existsSync(PROFILE_PATH)) {
    fail(`Profile not found: ${PROFILE_PATH}`);
    return null;
  }
  try {
    return parseYaml(readFileSync(PROFILE_PATH, 'utf8'));
  } catch (err) {
    fail(`Failed to parse profile.yaml: ${err.message}`);
    return null;
  }
}

function getAgents(profile) {
  const enabled = Array.isArray(profile?.agents?.enabled) ? profile.agents.enabled : [];
  const plugins = Array.isArray(profile?.agents?.plugins) ? profile.agents.plugins : [];
  const agents = [...new Set([...enabled, ...plugins])];
  if (existsSync(join(AGENTS_DIR, 'guardian', 'memory'))) {
    agents.push('guardian');
  }
  return [...new Set(agents)];
}

function validateDcopScripts() {
  for (const rel of DCOP_SCRIPTS) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) {
      fail(`DCOP script missing: ${rel}`);
    } else {
      ok(`DCOP script exists: ${rel}`);
    }
  }
}

function validateDcopState() {
  const sessionPath = join(MEMORY_DIR, 'session-state.md');
  const logPath = join(MEMORY_DIR, 'optimization.log');
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  for (const [path, label] of [[sessionPath, 'session-state.md'], [logPath, 'optimization.log']]) {
    if (!existsSync(path)) {
      fail(`Missing DCOP state file: ${label}`);
      continue;
    }
    const mtime = statSync(path).mtimeMs;
    const ageHours = (now - mtime) / (60 * 60 * 1000);
    if (ageHours > 24) {
      warn(`${label} is older than 24h (${ageHours.toFixed(1)}h). Consider running #optimize or #checkpoint.`);
    } else {
      ok(`${label} is recent (${ageHours.toFixed(1)}h)`);
    }
  }
}

function validateMemoryNamingContract(agents) {
  let strayCount = 0;
  for (const agent of agents) {
    const memDir = join(AGENTS_DIR, agent, 'memory');
    if (!existsSync(memDir)) continue;
    const allowed = new Set([
      ...CANONICAL_MEMORY_FILES,
      ...(MEMORY_CONTRACT_EXCEPTIONS[agent] || []),
    ]);
    for (const entry of readdirSync(memDir)) {
      const full = join(memDir, entry);
      if (!statSync(full).isFile()) continue;
      if (entry.endsWith('.md') && !allowed.has(entry)) {
        fail(`Stray memory file violates naming contract: .agents/${agent}/memory/${entry}`);
        strayCount++;
      }
    }
  }
  if (strayCount === 0) {
    ok('All agent memory files follow the naming contract');
  }
}

function validateStubs() {
  if (!existsSync(STUBS_DIR)) {
    warn('No stubs directory found');
    return;
  }
  let oversized = 0;
  for (const entry of readdirSync(STUBS_DIR)) {
    if (!entry.endsWith('.md')) continue;
    const full = join(STUBS_DIR, entry);
    const text = readFileSync(full, 'utf8');
    const tokens = approximateTokens(text);
    if (tokens > 50) {
      fail(`Stub exceeds 50 tokens: ${entry} (${tokens} tokens, ${text.length} chars)`);
      oversized++;
    }
  }
  if (oversized === 0) {
    ok('All stubs are <=50 tokens');
  }
}

function validateAdrs(profile) {
  const decisions = profile?.devhive?.decisions;
  if (!decisions) {
    warn('profile.devhive.decisions not configured');
    return;
  }
  const pattern = decisions.replace(/\*/g, '.*');
  const dir = dirname(join(ROOT, decisions));
  if (!existsSync(dir)) {
    fail(`Decisions directory does not exist: ${dir}`);
    return;
  }
  const adrs = readdirSync(dir).filter(f => f.endsWith('.md'));
  if (adrs.length === 0) {
    warn('No ADRs found under .devhive/decisions/');
  } else {
    ok(`${adrs.length} ADR(s) found under .devhive/decisions/`);
  }
}

function runBaseValidation() {
  try {
    execSync('node scripts/validate-devhive.mjs', { cwd: ROOT, stdio: 'pipe' });
    ok('Base DevHive validation passed');
  } catch (err) {
    const output = err.stdout?.toString() || err.message;
    fail(`Base DevHive validation failed:\n${output}`);
  }
}

function main() {
  runBaseValidation();

  const profile = readProfile();
  if (!profile) {
    console.log(`\n[validate-full] Full validation failed with ${errors} error(s) and ${warnings} warning(s).`);
    process.exit(1);
  }

  validateDcopScripts();
  validateDcopState();
  const agents = getAgents(profile);
  validateMemoryNamingContract(agents);
  validateStubs();
  validateAdrs(profile);

  if (errors === 0 && warnings === 0) {
    logger.info('Full DevHive validation passed', { errors, warnings });
    recordMetric('validate-devhive-full', 'validation_passed', { errors, warnings });
    // eslint-disable-next-line no-console
    console.log('\n[validate-full] Full DevHive validation passed.');
  } else {
    logger.error('Full DevHive validation failed', { errors, warnings });
    recordMetric('validate-devhive-full', 'validation_failed', { errors, warnings });
    // eslint-disable-next-line no-console
    console.log(`\n[validate-full] Full DevHive validation failed with ${errors} error(s) and ${warnings} warning(s).`);
    process.exit(1);
  }
}

main();
