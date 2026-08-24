#!/usr/bin/env node
/**
 * DCOP shared utilities.
 * Extensible: reads .devhive/profile.yaml to discover agents and plugins.
 * Never modifies source code; only reorganizes memory/policy files.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = dirname(dirname(__dirname)); // scripts/lib -> scripts -> project root
export const PROFILE_PATH = join(ROOT, '.devhive', 'profile.yaml');
export const MEMORY_DIR = join(ROOT, '.agents', 'memory');
export const AGENTS_DIR = join(ROOT, '.agents');
export const KGA_MEMORY_DIR = join(ROOT, '.agents', 'knowledge-graph-agent', 'memory');

export const CONTEXT_BUDGET_BYTES = 200_000; // heuristic memory budget for DCOP

// Minimal YAML parser (sufficient for profile.yaml).
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  const stack = [{ value: root, indent: -1, type: 'object', key: null }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bare = line.replace(/\t/g, '  ');
    const indent = bare.search(/\S/);
    if (indent === -1) continue;

    const content = bare.trim();
    if (content.startsWith('#')) continue;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    if (content.startsWith('-')) {
      let arrayParent = parent;
      if (arrayParent.type !== 'array') {
        const arr = [];
        arrayParent = { value: arr, indent, type: 'array', key: null };
        stack.push(arrayParent);
      }
      const itemValue = content.slice(1).trim();
      if (itemValue.includes(':')) {
        const idx = arrayParent.value.length;
        arrayParent.value[idx] = {};
        const [key, ...rest] = itemValue.split(':');
        const val = rest.join(':').trim();
        arrayParent.value[idx][key.trim()] = parseScalar(val);
        stack.push({ value: arrayParent.value[idx], indent, type: 'object', key: idx });
      } else {
        arrayParent.value.push(parseScalar(itemValue));
      }
    } else if (content.includes(':')) {
      const idx = content.indexOf(':');
      const key = content.slice(0, idx).trim();
      const val = content.slice(idx + 1).trim();

      if (val === '') {
        let nextType = 'object';
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].replace(/\t/g, '  ');
          if (next.trim() === '' || next.trim().startsWith('#')) continue;
          const nextIndent = next.search(/\S/);
          if (nextIndent <= indent) break;
          if (next.trim().startsWith('-')) {
            nextType = 'array';
          }
          break;
        }
        if (nextType === 'array') {
          parent.value[key] = [];
          stack.push({ value: parent.value[key], indent, type: 'array', key });
        } else {
          parent.value[key] = {};
          stack.push({ value: parent.value[key], indent, type: 'object', key });
        }
      } else {
        parent.value[key] = parseScalar(val);
      }
    }
  }

  return root;
}

export function readProfile() {
  const text = readFileSync(PROFILE_PATH, 'utf8');
  return parseYaml(text);
}

export function getAgents(profile) {
  const enabled = Array.isArray(profile?.agents?.enabled) ? profile.agents.enabled : [];
  const plugins = Array.isArray(profile?.agents?.plugins) ? profile.agents.plugins : [];
  const agents = [...new Set([...enabled, ...plugins])];
  // Guardian is not listed in agents.enabled but has its own memory/ directory.
  if (existsSync(getAgentMemoryDir('guardian'))) {
    agents.push('guardian');
  }
  return [...new Set(agents)];
}

export function getAgentMemoryDir(agent) {
  return join(AGENTS_DIR, agent, 'memory');
}

export function getAgentMemoryFiles(agent) {
  const dir = getAgentMemoryDir(agent);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => join(dir, f))
    .filter(p => statSync(p).isFile());
}

export function getAllAgentMemoryFiles(profile) {
  return getAgents(profile).flatMap(getAgentMemoryFiles);
}

export function getKnowledgeGraphMemoryFiles() {
  if (!existsSync(KGA_MEMORY_DIR)) return [];
  return readdirSync(KGA_MEMORY_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => join(KGA_MEMORY_DIR, f))
    .filter(p => statSync(p).isFile());
}

export function getDcopMemoryFiles() {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => join(MEMORY_DIR, f))
    .filter(p => statSync(p).isFile());
}

export function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function estimateContextUsage(profile) {
  const agentBytes = getAllAgentMemoryFiles(profile).reduce((sum, p) => sum + statSync(p).size, 0);
  const kgaBytes = getKnowledgeGraphMemoryFiles().reduce((sum, p) => sum + statSync(p).size, 0);
  const dcopBytes = getDcopMemoryFiles().reduce((sum, p) => sum + statSync(p).size, 0);
  const total = agentBytes + kgaBytes + dcopBytes;
  return {
    percentage: Math.min(100, Math.round((total / CONTEXT_BUDGET_BYTES) * 100)),
    totalBytes: total,
    agentBytes,
    kgaBytes,
    dcopBytes,
  };
}

export function gitStatus() {
  try {
    const out = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).map(line => ({
      status: line.slice(0, 2).trim() || '??',
      path: line.slice(3).trim(),
    }));
  } catch {
    return [];
  }
}

export function countLines(text) {
  return text.split(/\r?\n/).length;
}

export function approximateTokens(text) {
  // Rough estimate: ~0.75 words per token, ~6-7 chars per token.
  return Math.round(text.length / 6);
}

export function todayDir() {
  return new Date().toISOString().slice(0, 10);
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function archivePath(subdir, filename) {
  const dir = join(MEMORY_DIR, 'archive', subdir || todayDir());
  ensureDir(dir);
  return join(dir, filename);
}

export function archiveFile(sourcePath, subdir, metadata = {}) {
  const name = basename(sourcePath);
  const dest = archivePath(subdir, `${Date.now()}-${name}`);
  const content = readFileSafe(sourcePath) || '';
  const meta = [
    '---',
    `id: ${metadata.id || `${name}-${Date.now()}`}`,
    `archived_at: ${new Date().toISOString()}`,
    `source: ${sourcePath}`,
    `priority: ${metadata.priority || 'P4'}`,
    `reason: ${metadata.reason || 'DCOP optimization'}`,
    '---',
    '',
    `# ${metadata.title || name}`,
    '',
    '## Archived content',
    '',
    content,
  ].join('\n');
  writeFileSync(dest, meta, 'utf8');
  return dest;
}

export function compressToStub(sourcePath, destPath, title) {
  const content = readFileSafe(sourcePath) || '';
  // Extract bullet points and first sentence of each section.
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const bullets = lines.filter(l => /^[-*]\s/.test(l.trim())).slice(0, 3);
  const firstSection = lines.find(l => /^#{1,2}\s/.test(l)) || title;
  const summary = firstSection.replace(/^#+\s*/, '').slice(0, 60);
  const stubLines = [
    `# ${title}`,
    '',
    summary,
    ...(bullets.length ? ['', ...bullets.map(b => `→ ${b.replace(/^[-*]\s*/, '').slice(0, 40)}`)] : []),
    '',
    `→ ${sourcePath}`,
  ];
  writeFileSync(destPath, stubLines.join('\n'), 'utf8');
  return destPath;
}

export function appendOptimizationLog(entry) {
  ensureDir(MEMORY_DIR);
  const line = [
    new Date().toISOString(),
    entry.command || '#optimize',
    `context=${entry.context}%`,
    `P0=${entry.p0.errors},${entry.p0.modified},${entry.p0.tokens}`,
    `P1=${entry.p1}`,
    `P2=${entry.p2}`,
    `P3=${entry.p3}`,
    `P4=${entry.p4}`,
    `conserved=${entry.conserved}`,
    `compressed=${entry.compressed}`,
    `eliminated=${entry.eliminated}`,
    `archived=${entry.archived}`,
    `tokens_freed=${entry.tokensFreed}`,
    `next=${entry.next}`,
  ].join(' ') + '\n';
  appendFileSync(join(MEMORY_DIR, 'optimization.log'), line, 'utf8');
}

export function writeSessionState(state) {
  ensureDir(MEMORY_DIR);
  const lines = [
    '---',
    `session_id: ${state.sessionId || 'dcop-' + Date.now()}`,
    `updated_at: ${new Date().toISOString()}`,
    `context_usage: ${state.contextUsage}%`,
    `agent: ${state.agent || 'Guardian'}`,
    '---',
    '',
    '# Session State',
    '',
    'Snapshot maintained by DCOP. Rebuilt by `#optimize`, `#checkpoint`, or `#resume`.',
    '',
    '---',
    '',
    '## Active',
    '',
    '| Type | Id / Reference | Summary | Owner |',
    '|---|---|---|---|',
    ...state.active.map(row => `| ${row.type} | ${row.id} | ${row.summary} | ${row.owner} |`),
    '',
    '### Current user request (last turn)',
    state.userRequest || '_not recorded_',
    '',
    '### Open questions / blockers',
    ...(state.blockers?.length ? state.blockers.map(b => `- ${b}`) : ['- none']),
    '',
    '---',
    '',
    '## Hot Files',
    '',
    '| Path | Layer | Priority | Reason hot |',
    '|---|---|---|---|',
    ...state.hotFiles.map(row => `| ${row.path} | ${row.layer} | ${row.priority} | ${row.reason} |`),
    '',
    '---',
    '',
    '## Decisions',
    '',
    '| Decision | Stub | Location |',
    '|---|---|---|',
    ...state.decisions.map(row => `| ${row.decision} | ${row.stub} | ${row.location} |`),
    '',
    '---',
    '',
    '## Next Step',
    '',
    state.nextStep || '_none_',
    '',
  ];
  writeFileSync(join(MEMORY_DIR, 'session-state.md'), lines.join('\n'), 'utf8');
}

export function isTemplateFile(path) {
  return path.includes(join('.agents', 'templates')) && path.endsWith('.hbs');
}

export function isSkillFile(path) {
  return /[\/]\.agents[\/][^\/]+[\/]SKILL\.md$/.test(path) || path.endsWith(join('.agents', 'guardian', 'SKILL.md'));
}

export function findRecentMemoryFiles(profile, minutes = 30) {
  const now = Date.now();
  return getAllAgentMemoryFiles(profile).filter(p => {
    const mtime = statSync(p).mtimeMs;
    return (now - mtime) < minutes * 60 * 1000;
  });
}

export function formatConsoleOutput({ trigger, context, p0, summary, nextStep }) {
  const lines = [];
  if (trigger === 'threshold') {
    lines.push(`[GUARDIAN] Contexto al ${context.percentage}%. Iniciando compresión DCOP...`);
  } else {
    lines.push(`[GUARDIAN] Optimización forzada solicitada. Contexto al ${context.percentage}%.`);
    lines.push(`[GUARDIAN] Iniciando compresión DCOP...`);
  }
  lines.push(`[GUARDIAN] P0 protegidos: ${p0.errors} errores, ${p0.modified} archivos modificados, ${p0.tokens} tokens abiertos.`);
  lines.push(`[OPTIMIZER] Resumen: ${summary.conserved} conservados, ${summary.compressed} comprimidos, ${summary.eliminated} eliminados, ${summary.archived} archivados. Tokens liberados: ${summary.tokensFreed}`);
  lines.push(`[OPTIMIZER] P0: ${p0.errors} errores / ${p0.modified} archivos / ${p0.tokens} tokens preservados sin cambios.`);
  if (nextStep) {
    lines.push(`[OPTIMIZER] Próximo paso: ${nextStep}`);
  }
  return lines.join('\n');
}
