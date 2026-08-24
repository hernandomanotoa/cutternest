/**
 * Checkpoint manager for DevHive / CutterNest.
 *
 * Wraps `scripts/checkpoint.mjs` semantics in a reusable class with metadata,
 * restore and listing capabilities.
 *
 * Usage:
 *   import { CheckpointManager } from './checkpoint-manager.mjs';
 *   const cm = new CheckpointManager();
 *   const cp = cm.create('before-refactor');
 *   const latest = cm.list()[0];
 *   cm.restore(latest.id); // copies files back to original locations
 */
import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ROOT,
  MEMORY_DIR,
  readProfile,
  getAgents,
  getAgentMemoryFiles,
  ensureDir,
  readFileSafe,
  todayDir,
} from './dcop-utils.mjs';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('checkpoint-manager');
const CHECKPOINT_BASE = join(MEMORY_DIR, 'archive', 'checkpoints');
const INDEX_PATH = join(CHECKPOINT_BASE, 'index.jsonl');

function ensureBase() {
  ensureDir(CHECKPOINT_BASE);
}

function loadIndex() {
  if (!existsSync(INDEX_PATH)) return [];
  return readFileSync(INDEX_PATH, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function saveIndex(entries) {
  ensureBase();
  writeFileSync(INDEX_PATH, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

export class CheckpointManager {
  constructor() {
    this.profile = readProfile();
    this.agents = getAgents(this.profile);
  }

  create(label = 'manual') {
    ensureBase();
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const dirName = `${todayDir()}_${timestamp.replace(/[:.]/g, '-')}-${label}`;
    const dir = join(CHECKPOINT_BASE, dirName);
    ensureDir(dir);

    const copied = [];

    const sessionPath = join(MEMORY_DIR, 'session-state.md');
    if (existsSync(sessionPath)) {
      copyFileSync(sessionPath, join(dir, 'session-state.md'));
      copied.push('session-state.md');
    }

    for (const f of ['context-policy.md', 'aliases.md', 'optimization.log']) {
      const src = join(MEMORY_DIR, f);
      if (existsSync(src)) {
        copyFileSync(src, join(dir, f));
        copied.push(f);
      }
    }

    for (const agent of this.agents) {
      const files = getAgentMemoryFiles(agent);
      if (files.length === 0) continue;
      const agentDir = join(dir, 'agents', agent, 'memory');
      ensureDir(agentDir);
      for (const src of files) {
        copyFileSync(src, join(agentDir, basename(src)));
        copied.push(`${agent}/${basename(src)}`);
      }
    }

    const l0l3 = [
      this.profile?.devhive?.project_brief,
      this.profile?.devhive?.conventions,
      this.profile?.devhive?.current_sprint,
      this.profile?.guardian?.skill,
    ].filter(Boolean);

    const l0l3Dir = join(dir, 'devhive');
    ensureDir(l0l3Dir);
    for (const rel of l0l3) {
      const src = rel.startsWith('/') ? rel : join(ROOT, rel);
      if (existsSync(src)) {
        copyFileSync(src, join(l0l3Dir, basename(src)));
        copied.push(`devhive/${basename(src)}`);
      }
    }

    const entry = {
      id,
      label,
      dir: dir.replace(ROOT + '/', '').replace(/\\/g, '/'),
      timestamp,
      filesCopied: copied.length,
    };

    const index = loadIndex();
    index.unshift(entry);
    saveIndex(index);

    logger.info('checkpoint created', entry);
    recordMetric('checkpoint-manager', 'checkpoint_created', { label, filesCopied: copied.length });

    return entry;
  }

  list(limit = 20) {
    return loadIndex().slice(0, limit);
  }

  getLatest() {
    return loadIndex()[0] || null;
  }

  restore(id) {
    const entry = loadIndex().find(e => e.id === id);
    if (!entry) throw new Error(`Checkpoint not found: ${id}`);
    const dir = join(ROOT, entry.dir);
    if (!existsSync(dir)) throw new Error(`Checkpoint directory missing: ${entry.dir}`);

    let restored = 0;
    const sessionPath = join(dir, 'session-state.md');
    if (existsSync(sessionPath)) {
      copyFileSync(sessionPath, join(MEMORY_DIR, 'session-state.md'));
      restored++;
    }

    for (const agent of this.agents) {
      const agentSrcDir = join(dir, 'agents', agent, 'memory');
      if (!existsSync(agentSrcDir)) continue;
      const agentDstDir = join(ROOT, '.agents', agent, 'memory');
      ensureDir(agentDstDir);
      for (const entryName of readdirSync(agentSrcDir)) {
        const src = join(agentSrcDir, entryName);
        if (!statSync(src).isFile()) continue;
        copyFileSync(src, join(agentDstDir, entryName));
        restored++;
      }
    }

    logger.info('checkpoint restored', { id, restored });
    recordMetric('checkpoint-manager', 'checkpoint_restored', { id, restored });
    return { id, restored };
  }
}
