#!/usr/bin/env node
/**
 * Compress knowledge graph stubs to <= MAX_TOKENS.
 *
 * Usage:
 *   node scripts/compress-stubs.mjs [--dry-run]
 *
 * Preserves:
 *   - title
 *   - type
 *   - location
 *   - responsibility (truncated to one line)
 *   - related ADRs if they fit
 *
 * Archives the original stub to .agents/memory/archive/graph/.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { approximateTokens, todayDir, ensureDir, archiveFile } from './lib/dcop-utils.mjs';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const logger = getLogger('compress-stubs');
const STUBS_DIR = join(process.cwd(), '.agents', 'knowledge-graph-agent', 'memory', 'graph');
const MAX_TOKENS = 50;

function walkDir(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function extractSection(text, header) {
  const regex = new RegExp(`## ${header}\\s*\\n(.*?)(?=\\n## |\\n---|$)`, 's');
  const m = text.match(regex);
  return m ? m[1].trim() : '';
}

function compressStub(text, title) {
  const type = extractSection(text, 'Type');
  const location = extractSection(text, 'Location').split('\n')[0].trim();
  const responsibility = extractSection(text, 'Responsibility').split('\n')[0].trim();

  const parts = [`# ${title || 'Node'}`];
  if (type) parts.push(`**${type}**`);
  if (responsibility) parts.push(`→ ${responsibility.slice(0, 100)}`);
  if (location) parts.push(`→ ${location.slice(0, 80)}`);

  return parts.join('  \n');
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = walkDir(STUBS_DIR);

  let compressed = 0;
  let archived = 0;

  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const tokens = approximateTokens(text);
    if (tokens <= MAX_TOKENS) continue;

    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : basename(f, '.md');
    const compressedText = compressStub(text, title);
    const compressedTokens = approximateTokens(compressedText);

    if (compressedTokens > MAX_TOKENS) {
      logger.warn(`${f} still ${compressedTokens} tokens after compression`, { file: f, tokens: compressedTokens });
    }

    if (!dryRun) {
      archiveFile(f, join('graph', todayDir()), { title: basename(f, '.md'), priority: 'P2', reason: 'Stub compression' });
      writeFileSync(f, compressedText, 'utf8');
      archived++;
    }
    compressed++;
    logger.info(`${f}: ${tokens} → ${compressedTokens} tokens${dryRun ? ' (dry-run)' : ''}`, { file: f, before: tokens, after: compressedTokens, dryRun });
  }

  logger.info(`${compressed} stubs compressed, ${archived} archived.`, { compressed, archived });
  recordMetric('compress-stubs', 'run', { compressed, archived, dryRun });
}

main();
