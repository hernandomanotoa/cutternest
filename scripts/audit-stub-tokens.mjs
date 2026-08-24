#!/usr/bin/env node
/**
 * Audit knowledge graph stubs for token budget compliance.
 *
 * Usage:
 *   node scripts/audit-stub-tokens.mjs
 *
 * Checks every .md file under .agents/knowledge-graph-agent/memory/graph/
 * and fails if any stub exceeds MAX_TOKENS (default 50).
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { approximateTokens } from './lib/dcop-utils.mjs';
import { readFileSync, existsSync } from 'node:fs';

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

function main() {
  const files = walkDir(STUBS_DIR);
  let max = 0;
  let maxFile = '';
  let total = 0;
  let over = 0;
  const offenders = [];

  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const tokens = approximateTokens(text);
    total += tokens;
    if (tokens > max) {
      max = tokens;
      maxFile = f;
    }
    if (tokens > MAX_TOKENS) {
      over++;
      offenders.push({ file: f.replace(process.cwd() + '/', ''), tokens });
    }
  }

  console.log(`[audit-stubs] Stubs audited: ${files.length}`);
  console.log(`[audit-stubs] Total tokens: ${total}`);
  console.log(`[audit-stubs] Max tokens: ${max} (${maxFile || 'n/a'})`);
  console.log(`[audit-stubs] Over budget (>${MAX_TOKENS}): ${over}`);

  if (over > 0) {
    console.error('[audit-stubs] FAIL: following stubs exceed token budget:');
    for (const o of offenders) {
      console.error(`  - ${o.file}: ${o.tokens} tokens`);
    }
    process.exit(1);
  }

  console.log('[audit-stubs] PASS: all stubs within budget.');
}

main();
