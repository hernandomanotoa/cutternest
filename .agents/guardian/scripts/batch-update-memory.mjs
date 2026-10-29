#!/usr/bin/env node
/**
 * batch-update-memory.mjs
 *
 * Applies a JSON payload to update agent memory files in a single batch.
 * The Guardian uses this during swarm closure to update active-tasks.md,
 * queue.md, learnings.md and blockers.md without per-file writes by agents.
 *
 * Usage:
 *   node .agents/guardian/scripts/batch-update-memory.mjs <payload.json>
 *   echo '{"agent":"backend-agent","activeTasks":"...","queue":"..."}' | node .agents/guardian/scripts/batch-update-memory.mjs --stdin
 *
 * Payload schema:
 * {
 *   "agent": "backend-agent",
 *   "activeTasks": "markdown content",
 *   "queue": "markdown content",
 *   "learnings": "markdown content (optional)",
 *   "blockers": "markdown content (optional)"
 * }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--stdin') || args.includes('-')) {
    return readFileSync(0, 'utf8');
  }
  if (args.length === 0) {
    throw new Error('Usage: batch-update-memory.mjs <payload.json> or --stdin');
  }
  return readFileSync(args[0], 'utf8');
}

function main() {
  const raw = parseArgs();
  const payload = JSON.parse(raw);

  if (!payload.agent) {
    throw new Error('Payload must include "agent" field');
  }

  const candidateCore = join(ROOT, payload.agent);
  const candidatePlugin = join(ROOT, 'plugins', payload.agent);
  const isPlugin = !existsSync(join(candidateCore, 'SKILL.md')) && existsSync(join(candidatePlugin, 'SKILL.md'));
  const agentDir = isPlugin ? candidatePlugin : candidateCore;

  const memoryDir = join(agentDir, 'memory');
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  const files = {
    'active-tasks.md': payload.activeTasks,
    'queue.md': payload.queue,
    'learnings.md': payload.learnings,
    'blockers.md': payload.blockers,
  };

  for (const [file, content] of Object.entries(files)) {
    if (content !== undefined && content !== null) {
      const path = join(memoryDir, file);
      writeFileSync(path, content, 'utf8');
      console.log(`[batch-update-memory] Updated ${path}`);
    }
  }

  console.log('[batch-update-memory] Done.');
}

main();
