/**
 * Session token tracker for DevHive / CutterNest.
 *
 * Persists per-session usage in `.agents/memory/session-tracker.json`.
 * Usage:
 *   import { SessionTracker } from './session-tracker.mjs';
 *   const tracker = new SessionTracker();
 *   tracker.addTokens(1200, 300);
 *   tracker.addToolCall();
 *   console.log(tracker.getUsage());
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './dcop-utils.mjs';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('session-tracker');
const TRACKER_PATH = join(ROOT, '.agents', 'memory', 'session-tracker.json');

function readSessionId() {
  try {
    const statePath = join(ROOT, '.agents', 'memory', 'session-state.md');
    if (!existsSync(statePath)) return 'unknown';
    const text = readFileSync(statePath, 'utf8');
    const m = text.match(/session_id:\s*(.+)/);
    return m ? m[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

function loadData() {
  if (!existsSync(TRACKER_PATH)) return { sessions: {} };
  try {
    return JSON.parse(readFileSync(TRACKER_PATH, 'utf8'));
  } catch {
    return { sessions: {} };
  }
}

function saveData(data) {
  writeFileSync(TRACKER_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export class SessionTracker {
  constructor(sessionId = null) {
    this.sessionId = sessionId || readSessionId();
    this.data = loadData();
    if (!this.data.sessions[this.sessionId]) {
      this.data.sessions[this.sessionId] = {
        tokens_in: 0,
        tokens_out: 0,
        tool_calls: 0,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };
    }
  }

  addTokens(tokensIn = 0, tokensOut = 0) {
    const session = this.data.sessions[this.sessionId];
    session.tokens_in += tokensIn;
    session.tokens_out += tokensOut;
    session.last_active_at = new Date().toISOString();
    saveData(this.data);
    recordMetric('session-tracker', 'tokens_added', { session_id: this.sessionId, tokensIn, tokensOut });
  }

  addToolCall(count = 1) {
    const session = this.data.sessions[this.sessionId];
    session.tool_calls += count;
    session.last_active_at = new Date().toISOString();
    saveData(this.data);
  }

  getUsage() {
    return { session_id: this.sessionId, ...this.data.sessions[this.sessionId] };
  }

  getTotalTokens() {
    const session = this.data.sessions[this.sessionId];
    return session.tokens_in + session.tokens_out;
  }

  reset() {
    delete this.data.sessions[this.sessionId];
    saveData(this.data);
    logger.info('session usage reset', { session_id: this.sessionId });
  }
}
