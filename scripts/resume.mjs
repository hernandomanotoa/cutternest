#!/usr/bin/env node
/**
 * DCOP #resume implementation.
 *
 * Usage:
 *   node scripts/resume.mjs
 *
 * Restores the minimum safe context from `.agents/memory/session-state.md`,
 * `git status`, and L0-L3 files. Extensible: discovers agents and plugins from
 * .devhive/profile.yaml.
 */
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  ROOT,
  MEMORY_DIR,
  readProfile,
  getAgents,
  getAgentMemoryFiles,
  gitStatus,
  readFileSafe,
  estimateContextUsage,
} from './lib/dcop-utils.mjs';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const logger = getLogger('resume');

const profile = readProfile();
const agents = getAgents(profile);

const sessionPath = join(MEMORY_DIR, 'session-state.md');
const sessionText = readFileSafe(sessionPath);

if (!sessionText) {
  logger.error('no session-state.md found');
  process.exit(1);
}

const sessionIdMatch = sessionText.match(/session_id:\s*(.+)/);
const contextMatch = sessionText.match(/context_usage:\s*(.+)/);
const sessionId = sessionIdMatch ? sessionIdMatch[1].trim() : 'unknown';
const contextUsage = contextMatch ? contextMatch[1].trim() : 'unknown';

const status = gitStatus();
const modified = status.filter(s => s.status !== '??').length;
const untracked = status.filter(s => s.status === '??').length;

let errors = 0;
let openTokens = 0;
for (const agent of agents) {
  for (const p of getAgentMemoryFiles(agent)) {
    const text = readFileSafe(p) || '';
    if (/\[ERROR\]|\[FAIL\]|❌|🚨|MCP_DOWN|MCP_STALE/i.test(text)) errors++;
    openTokens += (text.match(/GUARD-[A-Z]+-/g) || []).length;
  }
}

const l0l3 = [
  profile?.devhive?.project_brief,
  profile?.devhive?.conventions,
  profile?.devhive?.current_sprint,
  profile?.guardian?.skill,
].filter(Boolean);

const missing = l0l3.filter(p => !existsSync(join(ROOT, p)));

const nextMatch = sessionText.match(/## Next Step\n\n([^\n]+)/);
const nextStep = nextMatch ? nextMatch[1].trim() : 'Continue from session-state.md';

logger.info('resuming session', { sessionId, contextUsage, errors, modified, untracked, openTokens });
recordMetric('resume', 'session_resumed', { sessionId, errors, modified, untracked, openTokens });

// eslint-disable-next-line no-console
console.log(`[RESUME] Sesión restaurada desde ${sessionId}.`);
// eslint-disable-next-line no-console
console.log(`[RESUME] Contexto actual: ${contextUsage}.`);
// eslint-disable-next-line no-console
console.log(`[RESUME] P0 activo: ${errors} errores, ${modified} archivos modificados, ${openTokens} tokens abiertos.`);
if (untracked) {
  // eslint-disable-next-line no-console
  console.log(`[RESUME] Archivos untracked: ${untracked}.`);
}
if (missing.length) {
  logger.warn('missing L0-L3 files', { missing });
  // eslint-disable-next-line no-console
  console.log(`[RESUME] ⚠️ L0-L3 faltantes: ${missing.join(', ')}`);
} else {
  // eslint-disable-next-line no-console
  console.log('[RESUME] L0-L3 cargados correctamente.');
}
// eslint-disable-next-line no-console
console.log(`[RESUME] Próximo paso: ${nextStep}`);
// eslint-disable-next-line no-console
console.log('[RESUME] Esperando confirmación del usuario para continuar.');
