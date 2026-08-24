import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

describe('optimize.mjs', () => {
  const testAgentDir = join(ROOT, '.agents', 'test-optimize-agent');
  const testMemDir = join(testAgentDir, 'memory');
  const cooldownFile = join(ROOT, '.agents', 'memory', '.optimize-last-run');

  before(() => {
    // Remove cooldown so the threshold test is deterministic.
    if (existsSync(cooldownFile)) rmSync(cooldownFile);
    mkdirSync(testMemDir, { recursive: true });
    writeFileSync(join(testMemDir, 'active-tasks.md'), '# Active Tasks\n\n| Status | Task |\n|---|---|\n| in_progress | test |\n', 'utf8');
    writeFileSync(join(testMemDir, 'queue.md'), '# Queue\n\n- task 1\n', 'utf8');
    writeFileSync(join(testMemDir, 'blockers.md'), '# Blockers\n\nNone\n', 'utf8');
    writeFileSync(join(testMemDir, 'learnings.md'), '# Learnings\n\n' + Array.from({ length: 60 }, (_, i) => `- Learning ${i}`).join('\n'), 'utf8');
    writeFileSync(join(testMemDir, 'completed-tasks.md'), '# Completed\n\n' + Array.from({ length: 60 }, (_, i) => `- Done ${i}`).join('\n'), 'utf8');
  });

  after(() => {
    rmSync(testAgentDir, { recursive: true, force: true });
  });

  it('does not run below threshold without --force', () => {
    const out = execFileSync('node', ['scripts/optimize.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert(out.includes('Umbral no alcanzado') || out.includes('Contexto al'));
  });

  it('--force --dry-run reports summary without modifying files', () => {
    const beforeStat = statSync(join(testMemDir, 'learnings.md'));
    const out = execFileSync('node', ['scripts/optimize.mjs', '--force', '--dry-run'], { cwd: ROOT, encoding: 'utf8' });
    assert(out.includes('[DRY-RUN] No files were modified.'), out);
    const afterStat = statSync(join(testMemDir, 'learnings.md'));
    assert.equal(beforeStat.mtimeMs, afterStat.mtimeMs);
  });

  it('does not archive active-tasks, queue, or blockers', () => {
    const out = execFileSync('node', ['scripts/optimize.mjs', '--force', '--dry-run'], { cwd: ROOT, encoding: 'utf8' });
    assert(out.includes('conservados'));
    assert(existsSync(join(testMemDir, 'active-tasks.md')));
    assert(existsSync(join(testMemDir, 'queue.md')));
    assert(existsSync(join(testMemDir, 'blockers.md')));
  });

  it('reports token-budget load for DCOP run', () => {
    const out = execFileSync('node', ['scripts/optimize.mjs', '--force', '--dry-run'], { cwd: ROOT, encoding: 'utf8' });
    assert(out.includes('[token-budget]'));
  });
});
