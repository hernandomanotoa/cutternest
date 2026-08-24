#!/usr/bin/env node
/**
 * Create a tracked artifact from a deliverable or report.
 *
 * Usage:
 *   node scripts/create-artifact.mjs --agent=backend-agent --type=implementation --source=docs/deliverable.md
 *   node scripts/create-artifact.mjs --agent=test-agent --type=test-report --source=backend/tests/report.md --task-id=T123
 *
 * Creates:
 *   - .artifacts/{year}/{month}/{uuid}.md  (copy of source)
 *   - appends entry to .artifacts/index.jsonl
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const logger = getLogger('create-artifact');

const ROOT = process.cwd();
const ARTIFACTS_DIR = join(ROOT, '.artifacts');

const args = process.argv.slice(2);
const agentArg = args.find(a => a.startsWith('--agent='))?.split('=')[1];
const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1];
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1];
const taskArg = args.find(a => a.startsWith('--task-id='))?.split('=')[1] || 'unknown';
const parentArg = args.find(a => a.startsWith('--parent='))?.split('=')[1] || null;
const versionArg = args.find(a => a.startsWith('--version='))?.split('=')[1] || '1.0.0';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function nowDir() {
  const d = new Date();
  return { year: String(d.getFullYear()), month: String(d.getMonth() + 1).padStart(2, '0') };
}

function loadIndex() {
  const indexPath = join(ARTIFACTS_DIR, 'index.jsonl');
  if (!existsSync(indexPath)) return [];
  return readFileSync(indexPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function saveIndex(entries) {
  const indexPath = join(ARTIFACTS_DIR, 'index.jsonl');
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(indexPath, lines, 'utf8');
}

function main() {
  if (!agentArg || !typeArg || !sourceArg) {
    logger.error('--agent, --type, and --source are required');
    process.exit(2);
  }

  const validTypes = ['plan', 'decision', 'test-report', 'implementation', 'adr'];
  if (!validTypes.includes(typeArg)) {
    logger.error('invalid artifact type', { type: typeArg, validTypes });
    process.exit(2);
  }

  const sourcePath = sourceArg.startsWith('/') ? sourceArg : join(ROOT, sourceArg);
  if (!existsSync(sourcePath)) {
    logger.error('source not found', { sourcePath });
    process.exit(2);
  }

  const content = readFileSync(sourcePath, 'utf8');
  const hash = sha256(content);
  const id = randomUUID();
  const { year, month } = nowDir();
  const relativeDir = join('.artifacts', year, month);
  const destDir = join(ROOT, relativeDir);
  const destFilename = `${id}.md`;
  const destPath = join(destDir, destFilename);
  const relativePath = join(relativeDir, destFilename);

  mkdirSync(destDir, { recursive: true });
  copyFileSync(sourcePath, destPath);

  const entry = {
    id,
    task_id: taskArg,
    parent_id: parentArg,
    type: typeArg,
    version: versionArg,
    path: relativePath.replace(/\\/g, '/'),
    hash,
    created_at: new Date().toISOString(),
    agent: agentArg,
  };

  const index = loadIndex();
  index.push(entry);
  saveIndex(index);

  logger.info('artifact created', { id, agent: agentArg, type: typeArg, path: relativePath.replace(/\\/g, '/') });
  recordMetric(agentArg, 'artifact_created', { value: content.length, type: typeArg });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry, null, 2));
}

main();
