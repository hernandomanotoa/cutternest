import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkBudget } from './token-budget.mjs';

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'token-budget-test-'));
const smallFile = join(tmp, 'small.md');
writeFileSync(smallFile, '# Small\n\nThis is a short document.', 'utf8');

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('token-budget.mjs', () => {
  it('reports within budget for simple task', () => {
    const result = checkBudget({ agent: 'docs-agent', task: 'update readme', type: 'simple', files: [smallFile] });
    assert.equal(result.type, 'simple');
    assert.equal(result.budget, 4000);
    assert.equal(result.overBudget, false);
  });

  it('detects task type from description', () => {
    const result = checkBudget({ agent: 'frontend-agent', task: 'refactor AssemblyPage.tsx' });
    assert.equal(result.type, 'multi');
    assert.equal(result.budget, 8000);
  });

  it('allows custom budget by type', () => {
    const result = checkBudget({ agent: 'architect', task: 'orchestrate multi-agent refactor', type: 'swarm' });
    assert.equal(result.type, 'swarm');
    assert.equal(result.budget, 16000);
  });

  it('warns when budget is exceeded', () => {
    // backend-agent load often exceeds simple budget
    const result = checkBudget({ agent: 'backend-agent', task: 'fix', type: 'simple' });
    assert(result.tokens > 0);
    if (result.tokens > result.budget) {
      assert.equal(result.overBudget, true);
    }
  });
});
