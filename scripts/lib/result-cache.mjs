/**
 * Simple TTL result cache for DevHive / CutterNest scripts.
 *
 * Usage:
 *   import { ResultCache } from './result-cache.mjs';
 *   const cache = new ResultCache({ ttlSeconds: 3600 });
 *   const key = cache.key('yahoo', { ticker: 'AAPL' });
 *   const value = cache.get(key) || await cache.set(key, fetchData());
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './dcop-utils.mjs';
import { getLogger } from './logger.mjs';
import { recordMetric } from './metrics.mjs';

const logger = getLogger('result-cache');
const CACHE_PATH = join(ROOT, '.agents', 'memory', 'result-cache.json');

export class ResultCache {
  constructor(options = {}) {
    this.ttlSeconds = options.ttlSeconds ?? 3600;
    this.data = this.load();
  }

  load() {
    if (!existsSync(CACHE_PATH)) return {};
    try {
      return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    } catch {
      return {};
    }
  }

  persist() {
    writeFileSync(CACHE_PATH, JSON.stringify(this.data, null, 2), 'utf8');
  }

  key(namespace, params) {
    const hash = createHash('sha256')
      .update(JSON.stringify({ namespace, params }))
      .digest('hex')
      .slice(0, 16);
    return `${namespace}:${hash}`;
  }

  get(key) {
    const entry = this.data[key];
    if (!entry) {
      recordMetric('result-cache', 'miss', { key: key.split(':')[0] });
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      delete this.data[key];
      this.persist();
      recordMetric('result-cache', 'expired', { key: key.split(':')[0] });
      return undefined;
    }
    recordMetric('result-cache', 'hit', { key: key.split(':')[0] });
    logger.debug('cache hit', { key: key.split(':')[0] });
    return entry.value;
  }

  set(key, value) {
    this.data[key] = {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
    this.persist();
    recordMetric('result-cache', 'set', { key: key.split(':')[0] });
    return value;
  }

  async getOrSet(key, factory) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    return this.set(key, value);
  }

  invalidate(key) {
    delete this.data[key];
    this.persist();
  }

  invalidateNamespace(namespace) {
    for (const key of Object.keys(this.data)) {
      if (key.startsWith(`${namespace}:`)) delete this.data[key];
    }
    this.persist();
  }
}
