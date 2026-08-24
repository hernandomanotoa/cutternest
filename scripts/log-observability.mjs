#!/usr/bin/env node
/**
 * Append an observability log entry for an agentic task.
 *
 * Usage:
 *   node scripts/log-observability.mjs \
 *     --agent=backend-agent \
 *     --task="optimize cuts" \
 *     --duration-ms=12000 \
 *     --tokens-in=4500 \
 *     --tokens-out=800 \
 *     --tools=Read,Edit,Bash \
 *     --result=completed
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';
import { SessionTracker } from './lib/session-tracker.mjs';

const logger = getLogger('log-observability');
const ROOT = process.cwd();
const LOG_DIR = join(ROOT, '.agents', 'memory');
const LOG_PATH = join(LOG_DIR, 'observability.logl');

const args = process.argv.slice(2);
const agentArg = args.find(a => a.startsWith('--agent='))?.split('=')[1];
const taskArg = args.find(a => a.startsWith('--task='))?.split('=')[1] || '';
const durationArg = parseInt(args.find(a => a.startsWith('--duration-ms='))?.split('=')[1] || '0', 10);
const tokensInArg = parseInt(args.find(a => a.startsWith('--tokens-in='))?.split('=')[1] || '0', 10);
const tokensOutArg = parseInt(args.find(a => a.startsWith('--tokens-out='))?.split('=')[1] || '0', 10);
const toolsArg = args.find(a => a.startsWith('--tools='))?.split('=')[1] || '';
const resultArg = args.find(a => a.startsWith('--result='))?.split('=')[1] || 'completed';
const modelArg = args.find(a => a.startsWith('--model='))?.split('=')[1] || process.env.MODEL || 'unknown';

function getSessionId() {
  try {
    const statePath = join(LOG_DIR, 'session-state.md');
    if (!existsSync(statePath)) return 'unknown';
    const content = readFileSync(statePath, 'utf8');
    const m = content.match(/session_id:\s*(.+)/);
    return m ? m[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

function main() {
  if (!agentArg) {
    logger.error('--agent required');
    process.exit(2);
  }

  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    agent: agentArg,
    task: taskArg,
    model: modelArg,
    tokens_in: tokensInArg,
    tokens_out: tokensOutArg,
    duration_ms: durationArg,
    tools_used: toolsArg.split(',').map(t => t.trim()).filter(Boolean),
    result: resultArg,
  };

  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  logger.info('observability entry recorded', { agent: agentArg, task: taskArg, tokens_in: tokensInArg, tokens_out: tokensOutArg, duration_ms: durationArg, result: resultArg });
  recordMetric(agentArg, 'task_observed', { value: tokensInArg + tokensOutArg, duration_ms: durationArg, result: resultArg });

  try {
    const tracker = new SessionTracker();
    tracker.addTokens(tokensInArg, tokensOutArg);
    tracker.addToolCall(toolsArg.split(',').filter(Boolean).length);
  } catch (err) {
    logger.warn('failed to update session tracker', { error: err.message });
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry, null, 2));
}

main();
