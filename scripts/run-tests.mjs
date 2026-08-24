#!/usr/bin/env node
/**
 * Simple test runner for DevHive/DCOP scripts.
 *
 * Runs `node --test` against all `*.test.mjs` files under `scripts/`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPTS_DIR = join(ROOT, 'scripts');
const LIB_DIR = join(SCRIPTS_DIR, 'lib');

function findTests(dir) {
  if (!exists(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.test.mjs'))
    .map(f => join(dir, f));
}

function exists(dir) {
  try {
    readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

const tests = [...findTests(SCRIPTS_DIR), ...findTests(LIB_DIR)];
if (tests.length === 0) {
  console.log('[run-tests] No test files found.');
  process.exit(0);
}

console.log(`[run-tests] Running ${tests.length} test file(s)...`);
try {
  execFileSync('node', ['--test', ...tests], { cwd: ROOT, stdio: 'inherit' });
  console.log('[run-tests] All tests passed.');
} catch (err) {
  console.error('[run-tests] Tests failed.');
  process.exit(err.status || 1);
}
