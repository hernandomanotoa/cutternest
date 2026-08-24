/**
 * Context manager for DevHive / CutterNest.
 *
 * Selects the minimal safe set of memory layers and agent skills
 * for a given task, reducing base context per turn.
 *
 * Usage:
 *   import { ContextManager } from './context-manager.mjs';
 *   const cm = new ContextManager();
 *   const plan = cm.buildContext({ task: 'refactor login hook in frontend', agent: 'frontend-agent' });
 *   console.log(plan.files, plan.tokensEstimate);
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  readProfile,
  getAgents,
  approximateTokens,
  readFileSafe,
} from './dcop-utils.mjs';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('context-manager');

const KEYWORD_LAYERS = [
  {
    keywords: /\b(auth|login|jwt|totp|password|session|mfa|pin|role)\b/i,
    agent: 'auth-agent',
    extras: ['security_policy', 'domain_rules'],
  },
  {
    keywords: /\b(schema|migration|sql|table|column|index|sqlite|postgres)\b/i,
    agent: 'db-agent',
    extras: [],
  },
  {
    keywords: /\b(ui|component|tsx|react|page|hook|frontend|tailwind|three|svg)\b/i,
    agent: 'frontend-agent',
    extras: [],
  },
  {
    keywords: /\b(api|route|service|backend|endpoint|fastapi|pydantic|optimizer|cut|nesting)\b/i,
    agent: 'backend-agent',
    extras: [],
  },
  {
    keywords: /\b(docker|compose|nginx|deploy|infra|build|pipeline)\b/i,
    agent: 'deploy-agent',
    extras: [],
  },
  {
    keywords: /\b(test|pytest|vitest|spec|coverage)\b/i,
    agent: 'test-agent',
    extras: [],
  },
  {
    keywords: /\b(doc|readme|openapi|adr|docs)\b/i,
    agent: 'docs-agent',
    extras: [],
  },
  {
    keywords: /\b(mcp|graph|architecture|impact|knowledge)\b/i,
    agent: 'knowledge-graph-agent',
    extras: ['current_sprint'],
  },
];

export class ContextManager {
  constructor() {
    this.profile = readProfile();
    this.agents = getAgents(this.profile);
  }

  resolveLayer(name) {
    const rel = this.profile?.devhive?.[name];
    if (!rel) return null;
    const full = rel.startsWith('/') ? rel : join(ROOT, rel);
    return existsSync(full) && statSync(full).isFile() ? full : null;
  }

  buildContext({ task = '', agent = null } = {}) {
    const normalizedTask = task.toLowerCase();

    // Always include L0-L3 core context.
    const l0l3 = [
      this.resolveLayer('project_brief'),
      this.resolveLayer('conventions'),
      this.resolveLayer('current_sprint'),
      this.resolveLayer('security_policy'),
      this.resolveLayer('domain_rules'),
    ].filter(Boolean);

    const selectedAgent = agent || this.inferAgent(task);
    const agentSkill = selectedAgent && this.agents.includes(selectedAgent)
      ? join(ROOT, '.agents', selectedAgent, 'SKILL.md')
      : null;
    const agentMemory = selectedAgent
      ? join(ROOT, '.agents', selectedAgent, 'memory', 'active-tasks.md')
      : null;

    // Include queue/blockers only if the task mentions blockers or the agent has them.
    const includeBlockers = /\b(block|blocker|stuck|error|fail|critical|regression)\b/i.test(task);
    const agentBlockers = selectedAgent && includeBlockers
      ? join(ROOT, '.agents', selectedAgent, 'memory', 'blockers.md')
      : null;

    const files = [...l0l3];
    if (agentSkill && existsSync(agentSkill)) files.push(agentSkill);
    if (agentMemory && existsSync(agentMemory)) files.push(agentMemory);
    if (agentBlockers && existsSync(agentBlockers)) files.push(agentBlockers);

    const uniqueFiles = [...new Set(files)];
    const tokensEstimate = uniqueFiles.reduce((sum, p) => sum + approximateTokens(readFileSafe(p) || ''), 0);

    const result = {
      task,
      selectedAgent,
      files: uniqueFiles.map(p => p.replace(ROOT + '/', '').replace(/\\/g, '/')),
      tokensEstimate,
      layers: {
        l0l3: l0l3.length,
        skill: agentSkill ? 1 : 0,
        activeTasks: agentMemory ? 1 : 0,
        blockers: agentBlockers ? 1 : 0,
      },
    };

    logger.info('context plan built', { selectedAgent, files: result.files.length, tokensEstimate });
    recordMetric('context-manager', 'context_built', { selectedAgent, files: result.files.length, tokensEstimate });

    return result;
  }

  inferAgent(task) {
    for (const rule of KEYWORD_LAYERS) {
      if (rule.keywords.test(task)) return rule.agent;
    }
    // Default to architect for cross-cutting tasks.
    return 'architect';
  }

  estimateSavings(fullLoadTokens, selectedTokens) {
    return {
      fullLoadTokens,
      selectedTokens,
      savedTokens: Math.max(0, fullLoadTokens - selectedTokens),
      savedPercent: fullLoadTokens > 0 ? Math.round((1 - selectedTokens / fullLoadTokens) * 100) : 0,
    };
  }
}
