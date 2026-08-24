/**
 * Token budget manager for DevHive / CutterNest.
 *
 * Combines per-task budget estimation from token-budget.mjs with
 * per-session token tracking and 80% alerts.
 *
 * Usage:
 *   import { TokenBudgetManager } from './token-budget-manager.mjs';
 *   const tbm = new TokenBudgetManager();
 *   const check = tbm.checkTask({ agent: 'backend-agent', task: 'fix login', type: 'simple' });
 *   if (!check.allowed) throw new Error(check.reason);
 */
import { checkBudget } from '../token-budget.mjs';
import { SessionTracker } from './session-tracker.mjs';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('token-budget-manager');

const BUDGETS = {
  simple: 4_000,
  multi: 8_000,
  swarm: 16_000,
};

export class TokenBudgetManager {
  constructor(options = {}) {
    this.sessionBudget = options.sessionBudget ?? 50_000;
    this.alertThreshold = options.alertThreshold ?? 0.8;
    this.tracker = new SessionTracker(options.sessionId);
  }

  checkTask({ agent, task, type, files = [] }) {
    const estimate = checkBudget({ agent, task, type, files });
    const sessionTotal = this.tracker.getTotalTokens();
    const projectedTotal = sessionTotal + estimate.tokens;
    const allowed = projectedTotal <= this.sessionBudget;
    const remaining = this.sessionBudget - sessionTotal;
    const sessionRatio = sessionTotal / this.sessionBudget;

    if (sessionRatio >= this.alertThreshold && sessionRatio < 1) {
      logger.warn('session token budget alert', { sessionBudget: this.sessionBudget, sessionTotal, ratio: Math.round(sessionRatio * 100) });
      recordMetric('token-budget-manager', 'session_budget_alert', { sessionTotal, sessionBudget: this.sessionBudget, ratio: sessionRatio });
    }

    const result = {
      allowed,
      reason: allowed ? undefined : `Projected session usage ${projectedTotal.toLocaleString()} exceeds budget ${this.sessionBudget.toLocaleString()}`,
      estimate,
      sessionTotal,
      sessionBudget: this.sessionBudget,
      remaining,
      alert: sessionRatio >= this.alertThreshold,
    };

    recordMetric('token-budget-manager', 'task_budget_checked', {
      agent,
      type: estimate.type,
      taskTokens: estimate.tokens,
      sessionTotal,
      allowed,
    });

    return result;
  }

  charge(tokensIn = 0, tokensOut = 0) {
    this.tracker.addTokens(tokensIn, tokensOut);
    const total = this.tracker.getTotalTokens();
    logger.info('session tokens charged', { tokensIn, tokensOut, sessionTotal: total });
    return total;
  }

  getStatus() {
    const total = this.tracker.getTotalTokens();
    return {
      sessionBudget: this.sessionBudget,
      sessionTotal: total,
      remaining: this.sessionBudget - total,
      ratio: total / this.sessionBudget,
      alert: total / this.sessionBudget >= this.alertThreshold,
    };
  }
}
