#!/usr/bin/env node
/**
 * Render DevHive agent SKILL.md files and MASTER_PROMPT.md from templates.
 *
 * Usage:
 *   node scripts/render-devhive-templates.mjs
 *
 * Reads .devhive/profile.yaml and renders:
 *   - .agents/{agent}/SKILL.md for each enabled agent/plugin
 *   - .agents/templates/rendered/MASTER_PROMPT.md
 *
 * Templates used:
 *   - .agents/templates/agent-skill.md.hbs (default)
 *   - .agents/templates/guardian-skill.md.hbs (guardian)
 *   - .agents/templates/knowledge-graph-agent-skill.md.hbs (knowledge-graph-agent)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
  readProfile,
  getAgents,
} from './lib/dcop-utils.mjs';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const logger = getLogger('render-devhive-templates');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = join(ROOT, '.agents', 'templates');
const RENDERED_DIR = join(TEMPLATES_DIR, 'rendered');
const AGENTS_DIR = join(ROOT, '.agents');
const MASTER_PROMPT_SRC = join(AGENTS_DIR, 'MASTER_PROMPT.md');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function templateForAgent(agent) {
  const specific = join(TEMPLATES_DIR, `${agent}-skill.md.hbs`);
  if (existsSync(specific)) return specific;
  return join(TEMPLATES_DIR, 'agent-skill.md.hbs');
}

function main() {
  const profile = readProfile();
  const agents = getAgents(profile);
  // Ensure guardian is included even if not listed in enabled/plugins
  if (!agents.includes('guardian')) agents.push('guardian');

  const context = buildContext(profile);
  const unresolved = new Set();
  const onWarning = (path) => unresolved.add(path);

  let renderedCount = 0;

  for (const agent of agents) {
    const templatePath = templateForAgent(agent);
    if (!existsSync(templatePath)) {
      logger.error(`Template not found for ${agent}`, { agent, templatePath });
      process.exit(1);
    }

    const template = readFileSync(templatePath, 'utf8');
    // Add per-agent variables to context
    const agentContext = {
      ...context,
      'agent.id': agent,
      'agent.name': agent,
      'agent.role': `Specialized DevHive Agent (${agent})`,
      'agent.scope': 'TBD',
    };
    const rendered = renderTemplate(template, agentContext, profile, onWarning);

    const targetDir = join(AGENTS_DIR, agent);
    if (!existsSync(targetDir)) {
      logger.warn(`Agent directory does not exist, skipping`, { agent, targetDir });
      continue;
    }
    const targetPath = join(targetDir, 'SKILL.md');
    writeFileSync(targetPath, rendered, 'utf8');
    renderedCount++;
    logger.info(`${agent} rendered`, { agent, targetPath });
  }

  // Render MASTER_PROMPT.md
  if (existsSync(MASTER_PROMPT_SRC)) {
    const masterTemplate = readFileSync(MASTER_PROMPT_SRC, 'utf8');
    const masterRendered = renderTemplate(masterTemplate, context, profile, onWarning);
    if (!existsSync(RENDERED_DIR)) {
      mkdirSync(RENDERED_DIR, { recursive: true });
    }
    writeFileSync(join(RENDERED_DIR, 'MASTER_PROMPT.md'), masterRendered, 'utf8');
    renderedCount++;
    logger.info('MASTER_PROMPT.md rendered', { targetPath: join(RENDERED_DIR, 'MASTER_PROMPT.md') });
  }

  if (unresolved.size > 0) {
    logger.error('Unresolved template variables', { unresolved: [...unresolved] });
    process.exit(1);
  }

  logger.info('Render complete', { renderedCount });
  recordMetric('render-devhive-templates', 'run', { renderedCount, unresolved: unresolved.size });
}

main();
