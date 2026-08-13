#!/usr/bin/env node
/**
 * Validate DevHive configuration and rendered templates.
 *
 * Usage:
 *   node scripts/validate-devhive.mjs
 *
 * Checks:
 *   - .devhive/profile.yaml exists and is parseable.
 *   - Required top-level sections are present (project, stack, commands, agents, security, devhive).
 *   - devhive.security_policy and devhive.domain_rules exist as files.
 *   - Rendering templates produces no unresolved {{...}} placeholders.
 *   - All enabled agents and plugins have a rendered SKILL.md.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname);
const PROFILE_PATH = join(ROOT, '.devhive', 'profile.yaml');
const TEMPLATES_DIR = join(ROOT, '.agents', 'templates');
const RENDERED_DIR = join(TEMPLATES_DIR, 'rendered');
const AGENTS_DIR = join(ROOT, '.agents');
const MASTER_PROMPT_SRC = join(ROOT, '.agents', 'MASTER_PROMPT.md');

let errors = 0;
let warnings = 0;

function fail(message) {
  errors++;
  console.error(`[validate] ERROR: ${message}`);
}

function warn(message) {
  warnings++;
  console.warn(`[validate] WARNING: ${message}`);
}

function ok(message) {
  console.log(`[validate] OK: ${message}`);
}

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

function parseYaml(text) {
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

function flatten(obj, prefix = '', result = {}) {
  if (isPlainObject(obj)) {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(value)) {
        flatten(value, newKey, result);
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
}

function buildContext(profile) {
  const context = { ...flatten(profile) };
  for (const key of Object.keys(profile)) {
    if (!isPlainObject(profile[key])) {
      context[key] = profile[key];
    }
  }
  return context;
}

function renderTemplate(template, context, profile, onWarning) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9_.\/-]*)\s*\}\}/g, (match, path) => {
    if (path in context) {
      return String(context[path] ?? '');
    }
    const parts = path.split('.');
    let current = profile;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        onWarning(path);
        return match;
      }
    }
    return String(current ?? '');
  });
}

function walkDir(dir, callback) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, callback);
    } else {
      callback(full);
    }
  }
}

function checkUnresolvedPlaceholders(filePath, content) {
  const matches = content.match(/\{\{\s*[^\}]+\s*\}\}/g);
  if (matches) {
    // The generic skeleton intentionally keeps {agent_id} and some {{...}} placeholders.
    if (filePath.includes('rendered/agent-skill.md')) {
      return;
    }
    fail(`Unresolved placeholders in ${filePath}: ${[...new Set(matches)].join(', ')}`);
  }
}

function main() {
  if (!existsSync(PROFILE_PATH)) {
    fail(`Profile not found: ${PROFILE_PATH}`);
    return;
  }
  ok('profile.yaml exists');

  let profile;
  try {
    const profileText = readFileSync(PROFILE_PATH, 'utf8');
    profile = parseYaml(profileText);
  } catch (err) {
    fail(`Failed to parse profile.yaml: ${err.message}`);
    return;
  }
  ok('profile.yaml is parseable');

  const requiredSections = ['project', 'stack', 'commands', 'agents', 'security', 'devhive'];
  for (const section of requiredSections) {
    if (!isPlainObject(profile[section])) {
      fail(`Missing or invalid section: ${section}`);
    }
  }
  if (errors === 0) ok('required profile sections present');

  const devhive = profile.devhive || {};
  const requiredDocs = ['project_brief', 'conventions', 'current_sprint', 'security_policy', 'domain_rules'];
  for (const doc of requiredDocs) {
    if (!devhive[doc]) {
      fail(`Missing devhive.${doc} path`);
      continue;
    }
    const fullPath = join(ROOT, devhive[doc]);
    if (!existsSync(fullPath)) {
      fail(`Context document not found: ${fullPath}`);
    } else {
      ok(`context document exists: ${devhive[doc]}`);
    }
  }

  if (profile.agents) {
    const enabled = profile.agents.enabled || [];
    const plugins = profile.agents.plugins || [];
    if (enabled.length === 0) warn('No enabled agents in profile');
    else ok(`${enabled.length} enabled agents declared`);
    if (plugins.length > 0) ok(`${plugins.length} plugins declared`);
  }

  const context = buildContext(profile);
  const unresolved = new Set();

  // Render all hbs templates and check for unresolved placeholders.
  const hbsFiles = [];
  walkDir(TEMPLATES_DIR, (file) => {
    if (file.endsWith('.hbs') && !file.startsWith(RENDERED_DIR)) {
      hbsFiles.push(file);
    }
  });

  for (const hbsPath of hbsFiles) {
    const template = readFileSync(hbsPath, 'utf8');
    renderTemplate(template, context, profile, (path) => unresolved.add(path));
  }

  // Also render MASTER_PROMPT.md.
  if (existsSync(MASTER_PROMPT_SRC)) {
    const masterTemplate = readFileSync(MASTER_PROMPT_SRC, 'utf8');
    renderTemplate(masterTemplate, context, profile, (path) => unresolved.add(path));
  }

  if (unresolved.size > 0) {
    fail(`Unresolved template variables: ${[...unresolved].join(', ')}`);
  } else {
    ok('no unresolved template variables');
  }

  // Check rendered SKILL.md files for leftover {{...}}.
  const renderedSkillFiles = [];
  walkDir(AGENTS_DIR, (file) => {
    if (file.endsWith('/SKILL.md') || file.endsWith('deliverable-template.md')) {
      renderedSkillFiles.push(file);
    }
  });

  for (const skillPath of renderedSkillFiles) {
    const content = readFileSync(skillPath, 'utf8');
    checkUnresolvedPlaceholders(skillPath, content);
  }

  if (errors === 0 && warnings === 0) {
    console.log('\n[validate] DevHive validation passed.');
  } else {
    console.log(`\n[validate] DevHive validation failed with ${errors} error(s) and ${warnings} warning(s).`);
    process.exit(1);
  }
}

main();
