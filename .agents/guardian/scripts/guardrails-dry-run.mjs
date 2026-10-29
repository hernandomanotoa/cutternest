#!/usr/bin/env node
/**
 * Dry-run tests for the guardian loop guardrails.
 *
 * Simulates scenarios on temporary files and reports pass/fail.
 *
 * Usage:
 *   node .agents/guardian/scripts/guardrails-dry-run.mjs
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readProfile, getAgents } from '../../../scripts/lib/dcop-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const CWD = process.cwd();
const DS = join(CWD, '.agents', 'guardian', 'scripts', 'detect-stall.mjs');

const TMP = join(CWD, '.tmp-guardrails-dry-run');

let passed = 0;
let failed = 0;
const errors = [];

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    const msg = `❌ ${name}${detail ? ': ' + detail : ''}`;
    errors.push(msg);
    console.log(`  ${msg}`);
  }
}

function runDetectStall(policies, audit, now, agentMemory = null) {
  const policiesPath = join(TMP, 'policies.json');
  const auditPath = join(TMP, 'audit.log');
  const agentDir = join(TMP, 'agents', 'backend-agent', 'memory');
  writeFileSync(policiesPath, JSON.stringify(policies, null, 2), 'utf8');
  writeFileSync(auditPath, audit, 'utf8');
  if (agentMemory !== null) {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'active-tasks.md'), agentMemory, 'utf8');
  }
  try {
    const stdout = execFileSync('node', [
      DS,
      `--policies-path=${policiesPath}`,
      `--audit-path=${auditPath}`,
      `--memory-dir=${join(TMP, 'agents')}`,
      `--now=${now}`,
    ], { cwd: CWD, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function policiesBase() {
  return {
    guardrails: {
      max_steps_default: 15,
      max_handoffs_per_task: 5,
      forbidden_cycles: [
        ['backend-agent', 'db-agent'],
        ['frontend-agent', 'frontend-template-agent'],
      ],
      stall_detection: {
        repetition_threshold: 2,
        inactivity_timeout_minutes: 10,
        max_steps_exceeded_action: 'mark_stalled_and_checkpoint',
      },
    },
  };
}

function auditLine(ts, agent, action, resource, result, token, queueLen = '-') {
  return `[${ts}] [${agent}] [${action}] [${resource}] [${result}] [${token}] [${queueLen}]\n`;
}

function testA() {
  console.log('\nTest A: 20-step task stops at 15');
  const audit = Array.from({ length: 20 }, (_, i) =>
    auditLine(
      `2026-08-05T10:${String(i).padStart(2, '0')}:00Z`,
      'backend-agent',
      'STEP',
      `file-${i}.ts`,
      i === 19 ? 'COMPLETED' : 'IN_PROGRESS',
      'GUARD-BACKEND-TEST-20STEPS',
      '-'
    )
  ).join('');
  const memory = `# Active Tasks\n\n| Status | Token | Task | Started | Notes |\n|---|---|---|---|---|\n| in_progress | GUARD-BACKEND-TEST-20STEPS | test | now | - |`;
  const res = runDetectStall(policiesBase(), audit, '2026-08-05T10:25:00Z', memory);
  const stalled = res.code !== 0 && res.stdout.includes('max_steps');
  assert('detect-stall reports max_steps stall', stalled, res.stdout + res.stderr);
  assert('exit code is non-zero', res.code !== 0, String(res.code));
  const updatedMemory = existsSync(join(TMP, 'agents', 'backend-agent', 'memory', 'active-tasks.md'))
    ? readFileSync(join(TMP, 'agents', 'backend-agent', 'memory', 'active-tasks.md'), 'utf8')
    : '';
  assert('active-tasks.md marked as stalled', updatedMemory.includes('| stalled |'), updatedMemory);
}

function testB() {
  console.log('\nTest B: forbidden handoff cycle backend-agent ↔ db-agent');
  const p = policiesBase();
  const forbidden = p.guardrails.forbidden_cycles.some(
    c => (c[0] === 'backend-agent' && c[1] === 'db-agent') ||
         (c[0] === 'db-agent' && c[1] === 'backend-agent')
  );
  assert('forbidden_cycles contains backend-agent ↔ db-agent', forbidden);
}

function testC() {
  console.log('\nTest C: repeated action detected as stall');
  const audit = Array.from({ length: 3 }, () =>
    auditLine(
      '2026-08-05T10:00:00Z',
      'backend-agent',
      'RETRY',
      'src/services/auth.ts',
      'FAILED',
      'GUARD-BACKEND-RETRY-LOOP',
      '-'
    )
  ).join('');
  const memory = `# Active Tasks\n\n| Status | Token | Task | Started | Notes |\n|---|---|---|---|---|\n| in_progress | GUARD-BACKEND-RETRY-LOOP | retry | now | - |`;
  const res = runDetectStall(policiesBase(), audit, '2026-08-05T10:05:00Z', memory);
  const stalled = res.code !== 0 && res.stdout.includes('repetition');
  assert('detect-stall reports repetition stall', stalled, res.stdout + res.stderr);
  const updatedMemory = existsSync(join(TMP, 'agents', 'backend-agent', 'memory', 'active-tasks.md'))
    ? readFileSync(join(TMP, 'agents', 'backend-agent', 'memory', 'active-tasks.md'), 'utf8')
    : '';
  assert('active-tasks.md marked as stalled', updatedMemory.includes('| stalled |'), updatedMemory);
}

function testD() {
  console.log('\nTest D: syntax validation');
  const policies = JSON.parse(readFileSync(join(CWD, '.agents', 'guardian', 'policies.json'), 'utf8'));
  assert('policies.json has guardrails', !!policies.guardrails);
  assert('guardrails.max_steps_default is 15', policies.guardrails.max_steps_default === 15);
  assert('guardrails.max_handoffs_per_task is 5', policies.guardrails.max_handoffs_per_task === 5);
  assert('forbidden_cycles is non-empty array', Array.isArray(policies.guardrails.forbidden_cycles) && policies.guardrails.forbidden_cycles.length > 0);
  assert('stall_detection.repetition_threshold is 2', policies.guardrails.stall_detection?.repetition_threshold === 2);
  assert('stall_detection.inactivity_timeout_minutes is 10', policies.guardrails.stall_detection?.inactivity_timeout_minutes === 10);

  const skillBasePath = join(CWD, '.agents', 'SKILL-BASE.md');
  assert('SKILL-BASE.md exists', existsSync(skillBasePath));
  const skillBase = existsSync(skillBasePath) ? readFileSync(skillBasePath, 'utf8') : '';
  assert('SKILL-BASE.md contains LOOP GUARDRAILS', skillBase.includes('## 🔄 LOOP GUARDRAILS & CHECKPOINTS'));
  assert('SKILL-BASE.md contains checkpoint format', skillBase.includes('checkpoint_summary'));

  const agents = getAgents(readProfile());
  for (const agent of agents) {
    const skillPath = join(CWD, '.agents', agent, 'SKILL.md');
    const activePath = join(CWD, '.agents', agent, 'memory', 'active-tasks.md');
    if (!existsSync(join(CWD, '.agents', agent))) {
      // Plugins without a directory are not operational agents yet.
      continue;
    }
    if (!existsSync(skillPath)) {
      assert(`${agent}/SKILL.md exists`, false, skillPath);
      continue;
    }
    const skill = readFileSync(skillPath, 'utf8');
    assert(`${agent}/SKILL.md references SKILL-BASE.md`, skill.includes('SKILL-BASE.md'));
    if (!existsSync(activePath)) {
      assert(`${agent}/memory/active-tasks.md exists`, false, activePath);
      continue;
    }
    const active = readFileSync(activePath, 'utf8');
    assert(`${agent}/memory/active-tasks.md contains checkpoint template`, active.includes('## Checkpoint Template'));
  }
}

function testE() {
  console.log('\nTest E: inactivity detection');
  const audit = auditLine(
    '2026-08-05T10:00:00Z',
    'backend-agent',
    'STEP',
    'src/services/auth.ts',
    'IN_PROGRESS',
    'GUARD-BACKEND-IDLE',
    '-'
  );
  const res = runDetectStall(policiesBase(), audit, '2026-08-05T10:25:00Z');
  assert('detect-stall reports inactivity stall', res.code !== 0 && res.stdout.includes('inactivity'), res.stdout + res.stderr);
}

function main() {
  setup();
  try {
    testA();
    testB();
    testC();
    testD();
    testE();
  } finally {
    cleanup();
  }

  console.log('\n---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const e of errors) console.log(`  ${e}`);
    process.exit(1);
  }
  console.log('\nAll dry-run tests passed.');
}

main();
