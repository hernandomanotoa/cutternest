#!/usr/bin/env node
/**
 * DCOP #checkpoint implementation.
 *
 * Usage:
 *   node scripts/checkpoint.mjs [label]
 *
 * Saves session-state.md and all agent memory files to a timestamped checkpoint
 * under `.agents/memory/archive/checkpoints/`. Extensible: discovers agents and
 * plugins from .devhive/profile.yaml.
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  ROOT,
  MEMORY_DIR,
  readProfile,
  getAgents,
  getAgentMemoryFiles,
  ensureDir,
  readFileSafe,
  writeSessionState,
  todayDir,
} from './lib/dcop-utils.mjs';

const label = process.argv[2] || 'manual';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const checkpointDir = join(MEMORY_DIR, 'archive', 'checkpoints', `${todayDir()}_${timestamp}-${label}`);
ensureDir(checkpointDir);

const profile = readProfile();
const agents = getAgents(profile);

const copied = [];

// Copy session-state.md
const sessionPath = join(MEMORY_DIR, 'session-state.md');
if (existsSync(sessionPath)) {
  copyFileSync(sessionPath, join(checkpointDir, 'session-state.md'));
  copied.push('session-state.md');
}

// Copy DCOP policy/aliases
for (const f of ['context-policy.md', 'aliases.md', 'optimization.log']) {
  const src = join(MEMORY_DIR, f);
  if (existsSync(src)) {
    copyFileSync(src, join(checkpointDir, f));
    copied.push(f);
  }
}

// Copy agent memory files
for (const agent of agents) {
  const files = getAgentMemoryFiles(agent);
  if (files.length === 0) continue;
  const agentDir = join(checkpointDir, 'agents', agent, 'memory');
  ensureDir(agentDir);
  for (const src of files) {
    copyFileSync(src, join(agentDir, basename(src)));
    copied.push(`${agent}/${basename(src)}`);
  }
}

// Copy L0-L3 context files
const l0l3 = [
  profile?.devhive?.project_brief,
  profile?.devhive?.conventions,
  profile?.devhive?.current_sprint,
  profile?.guardian?.skill,
].filter(Boolean);

const l0l3Dir = join(checkpointDir, 'devhive');
ensureDir(l0l3Dir);
for (const rel of l0l3) {
  const src = join(ROOT, rel);
  if (existsSync(src)) {
    copyFileSync(src, join(l0l3Dir, basename(src)));
    copied.push(`devhive/${basename(src)}`);
  }
}

// Update session state with checkpoint info
const sessionText = readFileSafe(sessionPath) || '';
const nextStep = 'Checkpoint created. Safe to switch agent or resume from this state.';
const updatedSession = sessionText.replace(
  /## Next Step\n\n[^\n]+/,
  `## Next Step\n\n${nextStep}\n\n**Checkpoint:** ${checkpointDir.replace(ROOT + '/', '').replace(/\\/g, '/')}`
);
writeFileSync(sessionPath, updatedSession, 'utf8');

console.log(`[CHECKPOINT] Estado guardado en .agents/memory/session-state.md.`);
console.log(`[CHECKPOINT] Checkpoint archivado: ${checkpointDir.replace(ROOT + '/', '').replace(/\\/g, '/')}/`);
console.log(`[CHECKPOINT] Archivos copiados: ${copied.length}`);
console.log(`[CHECKPOINT] Próximo paso seguro: ${nextStep}`);
