#!/usr/bin/env node
/**
 * DevHive lightweight agent router.
 *
 * Reads `.agents/registry.json` and `.agents/guardian/policies.json` to validate
 * whether an agent has scope for a resource and emits a simulated token.
 *
 * Usage:
 *   node scripts/devhive-router.mjs --agent=backend-agent --resource=backend/app/optimizer.py
 *   node scripts/devhive-router.mjs --agent=auth-agent --resource=backend/app/auth.py
 *   node scripts/devhive-router.mjs --agent=backend-agent --resource=backend/app/auth.py
 *
 * Output: JSON with `approved`, `token`, `ttl`, `scope`, `denied`, `reason`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { recordMetric } from './lib/metrics.mjs';

const ROOT = process.cwd();
const REGISTRY_PATH = join(ROOT, '.agents', 'registry.json');
const POLICIES_PATH = join(ROOT, '.agents', 'guardian', 'policies.json');

const args = process.argv.slice(2);
const agentArg = args.find(a => a.startsWith('--agent='))?.split('=')[1];
const resourceArg = args.find(a => a.startsWith('--resource='))?.split('=')[1];
const taskArg = args.find(a => a.startsWith('--task='))?.split('=')[1] || 'execute';

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`[router] ERROR: cannot parse ${path}: ${err.message}`);
    return null;
  }
}

function splitSegments(path) {
  return path.split('/').filter(Boolean);
}

function matchSegments(resourceSegs, patternSegs) {
  // Dynamic programming approach for ** support.
  // ** matches zero or more whole segments; * matches exactly one segment.
  const m = resourceSegs.length;
  const n = patternSegs.length;
  // dp[i][j] = whether first i resource segments match first j pattern segments
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(false));
  dp[0][0] = true;

  // leading ** can match zero segments
  for (let j = 1; j <= n; j++) {
    if (patternSegs[j - 1] === '**') dp[0][j] = dp[0][j - 1];
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const p = patternSegs[j - 1];
      const r = resourceSegs[i - 1];
      if (p === '**') {
        // match zero segments (carry down) or one more segment (carry left)
        dp[i][j] = dp[i][j - 1] || dp[i - 1][j];
      } else if (p === '*') {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = dp[i - 1][j - 1] && matchLiteralSegment(r, p);
      }
    }
  }

  return dp[m][n];
}

function matchLiteralSegment(segment, pattern) {
  // pattern may contain * and ? within a single segment
  const re = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(segment);
}

function matchesGlob(resource, pattern) {
  const resourceSegs = splitSegments(resource);
  const patternSegs = splitSegments(pattern);
  return matchSegments(resourceSegs, patternSegs);
}

function matchesAny(resource, patterns) {
  if (!Array.isArray(patterns)) return false;
  return patterns.some(p => matchesGlob(resource, p));
}

function isDenied(resource, deniedPatterns) {
  if (!Array.isArray(deniedPatterns)) return false;
  return matchesAny(resource, deniedPatterns);
}

function isInScope(resource, scopePatterns) {
  if (!Array.isArray(scopePatterns)) return false;
  return matchesAny(resource, scopePatterns);
}

function requiresApproval(agent, resource, policies) {
  const agentPolicy = policies?.agents?.[agent];
  if (!agentPolicy) return false;
  const reqs = agentPolicy.require_approval_for || [];
  return reqs.some(req => {
    if (resource.includes(req)) return true;
    try {
      return globToRegex(req).test(resource);
    } catch {
      return false;
    }
  });
}

function generateToken(agent, action, resource) {
  const ts = new Date().toISOString();
  const hash = createHash('sha256')
    .update(`${agent}:${action}:${resource}:${ts}:${Math.random()}`)
    .digest('hex')
    .slice(0, 8);
  const safeResource = resource.replace(/[^a-zA-Z0-9_./-]/g, '-').slice(0, 40);
  return `GUARD-${agent.toUpperCase()}-${action.toUpperCase()}-${safeResource}-${ts}-${hash}`;
}

function suggestAgent(task, registry) {
  const taskLower = (task || '').toLowerCase();
  const keywords = [
    { agents: ['auth-agent'], terms: ['auth', 'login', 'totp', 'jwt', 'password', 'mfa', 'session'] },
    { agents: ['db-agent'], terms: ['schema', 'migration', 'sql', 'table', 'column', 'index'] },
    { agents: ['frontend-agent'], terms: ['ui', 'component', 'tsx', 'react', 'page', 'hook', 'frontend'] },
    { agents: ['deploy-agent'], terms: ['docker', 'compose', 'nginx', 'deploy', 'infra'] },
    { agents: ['test-agent'], terms: ['test', 'pytest', 'vitest', 'spec'] },
    { agents: ['docs-agent'], terms: ['doc', 'readme', 'openapi', 'adr'] },
    { agents: ['knowledge-graph-agent'], terms: ['mcp', 'graph', 'architecture', 'impact'] },
    { agents: ['backend-agent'], terms: ['api', 'route', 'service', 'backend', 'endpoint'] },
  ];
  for (const k of keywords) {
    if (k.terms.some(t => taskLower.includes(t))) return k.agents[0];
  }
  return null;
}

function route() {
  const registry = readJson(REGISTRY_PATH);
  const policies = readJson(POLICIES_PATH);

  if (!registry) {
    return { approved: false, reason: 'registry.json not found', token: null, ttl: 0, scope: [], denied: [] };
  }

  if (!agentArg) {
    return { approved: false, reason: '--agent required', token: null, ttl: 0, scope: [], denied: [] };
  }

  const agentConfig = registry.agents?.[agentArg];
  if (!agentConfig) {
    const suggestion = taskArg ? suggestAgent(taskArg, registry) : null;
    return { approved: false, reason: `unknown agent: ${agentArg}`, suggestion, token: null, ttl: 0, scope: [], denied: [] };
  }

  if (!resourceArg) {
    return { approved: false, reason: '--resource required', token: null, ttl: 0, scope: agentConfig.scope, denied: agentConfig.denied };
  }

  const resource = resourceArg.replace(/^\.?\//, '');

  if (isDenied(resource, agentConfig.denied)) {
    return {
      approved: false,
      reason: `resource ${resource} is in the denied list for ${agentArg}`,
      token: null,
      ttl: 0,
      scope: agentConfig.scope,
      denied: agentConfig.denied,
    };
  }

  if (!isInScope(resource, agentConfig.scope)) {
    return {
      approved: false,
      reason: `resource ${resource} is outside the scope of ${agentArg}`,
      token: null,
      ttl: 0,
      scope: agentConfig.scope,
      denied: agentConfig.denied,
    };
  }

  const needsApproval = requiresApproval(agentArg, resource, policies);
  if (needsApproval) {
    return {
      approved: false,
      require_approval: true,
      reason: `resource ${resource} requires explicit Guardian approval for ${agentArg}`,
      token: null,
      ttl: agentConfig.token_ttl_minutes,
      scope: agentConfig.scope,
      denied: agentConfig.denied,
    };
  }

  const token = generateToken(agentArg, 'EXEC', resource);
  return {
    approved: true,
    token,
    ttl: agentConfig.token_ttl_minutes,
    scope: agentConfig.scope,
    denied: agentConfig.denied,
    reason: `resource ${resource} is within scope for ${agentArg}`,
  };
}

const result = route();
recordMetric('devhive-router', 'route_evaluated', {
  agent: agentArg,
  resource: resourceArg,
  approved: result.approved,
  requireApproval: result.require_approval || false,
  reason: result.reason,
});
console.log(JSON.stringify(result, null, 2));
if (!result.approved) process.exit(1);
