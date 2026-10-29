#!/usr/bin/env node
/**
 * Merge DevHive policy layers into the runtime policies.json.
 *
 * Layers (applied in order; later layers override earlier ones):
 *   1. .agents/guardian/policies.base.json    — universal rules
 *   2. .agents/guardian/policies.stack.json   — stack-specific patterns
 *   3. .agents/guardian/policies.project.json — project-specific approvals
 *
 * Usage:
 *   node .agents/guardian/scripts/merge-policies.js
 *
 * The script writes .agents/guardian/policies.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GUARDIAN_DIR = dirname(__dirname);

function loadJson(path) {
  const text = readFileSync(path, 'utf8');
  return JSON.parse(text);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (source === undefined || source === null) return target;
  if (!isPlainObject(target) || !isPlainObject(source)) {
    // For non-objects, source wins.
    return source;
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (key in result && isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else if (key in result && Array.isArray(result[key]) && Array.isArray(source[key])) {
      // Concatenate arrays and deduplicate primitive values.
      const merged = [...result[key], ...source[key]];
      result[key] = merged.filter((item, index, self) => {
        if (typeof item !== 'object') {
          return self.indexOf(item) === index;
        }
        return true;
      });
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function main() {
  const base = loadJson(join(GUARDIAN_DIR, 'policies.base.json'));
  const stack = loadJson(join(GUARDIAN_DIR, 'policies.stack.json'));
  const project = loadJson(join(GUARDIAN_DIR, 'policies.project.json'));

  let merged = deepMerge(base, stack);
  merged = deepMerge(merged, project);

  merged.updated = new Date().toISOString();
  merged.version = '2.2.0-devhive-runtime';
  merged._source_layers = [
    '.agents/guardian/policies.base.json',
    '.agents/guardian/policies.stack.json',
    '.agents/guardian/policies.project.json'
  ];
  merged._regenerate = 'node .agents/guardian/scripts/merge-policies.js';

  const output = join(GUARDIAN_DIR, 'policies.json');
  writeFileSync(output, JSON.stringify(merged, null, 2) + '\n');
  console.log(`[merge-policies] Wrote ${output}`);
}

main();
