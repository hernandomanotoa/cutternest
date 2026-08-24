import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseYaml,
  getAgents,
  archiveFile,
  compressToStub,
  approximateTokens,
} from './dcop-utils.mjs';

describe('dcop-utils', () => {
  describe('parseYaml', () => {
    it('parses a simple profile-like structure', () => {
      const yaml = `
project:
  name: CutterNest
  version: "1.0"
agents:
  enabled:
    - backend-agent
    - frontend-agent
`;
      const parsed = parseYaml(yaml);
      assert.equal(parsed.project.name, 'CutterNest');
      assert.equal(parsed.project.version, '1.0');
      assert.deepEqual(parsed.agents.enabled, ['backend-agent', 'frontend-agent']);
    });
  });

  describe('getAgents', () => {
    it('returns enabled agents plus plugins and guardian if directory exists', () => {
      const profile = {
        agents: {
          enabled: ['backend-agent', 'frontend-agent'],
          plugins: ['code-reviewer'],
        },
      };
      const agents = getAgents(profile);
      assert(agents.includes('backend-agent'));
      assert(agents.includes('frontend-agent'));
      assert(agents.includes('code-reviewer'));
    });
  });

  describe('archiveFile', () => {
    let tmp;
    before(() => {
      tmp = mkdtempSync(join(tmpdir(), 'dcop-test-'));
    });
    after(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('creates an archived copy with metadata', () => {
      const source = join(tmp, 'source.md');
      writeFileSync(source, '# Original\n\ncontent', 'utf8');
      const dest = archiveFile(source, 'test-run', { id: 'test-1', priority: 'P4', reason: 'test', title: 'Test Archive' });
      assert(existsSync(dest));
      const archived = readFileSync(dest, 'utf8');
      assert(archived.includes('id: test-1'));
      assert(archived.includes('priority: P4'));
      assert(archived.includes('# Original'));
      assert(archived.includes('content'));
    });
  });

  describe('compressToStub', () => {
    let tmp;
    before(() => {
      tmp = mkdtempSync(join(tmpdir(), 'dcop-test-'));
    });
    after(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it('produces a stub with <= 50 tokens', () => {
      const source = join(tmp, 'learnings.md');
      const dest = join(tmp, 'stub.md');
      const longText = Array.from({ length: 100 }, (_, i) => `- Learning item ${i}: this is a moderately long sentence to inflate token count.`).join('\n');
      writeFileSync(source, `# Learnings\n\n${longText}`, 'utf8');
      compressToStub(source, dest, 'agent learnings');
      const stub = readFileSync(dest, 'utf8');
      assert(stub.includes('agent learnings'));
      assert(approximateTokens(stub) <= 50, `stub has ${approximateTokens(stub)} tokens`);
    });
  });
});
