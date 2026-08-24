#!/usr/bin/env node
/**
 * Structured logger for DevHive/DCOP scripts.
 *
 * Emits JSON lines to stdout and to `.agents/memory/logs/YYYY-MM-DD.logl`.
 * Levels: DEBUG < INFO < WARN < ERROR.
 *
 * Usage:
 *   import { getLogger } from './logger.mjs';
 *   const logger = getLogger('optimize');
 *   logger.info('Optimization started', { context: 42 });
 */
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LOG_DIR = join(ROOT, '.agents', 'memory', 'logs');

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
const DEFAULT_LEVEL = process.env.DEVHIVE_LOG_LEVEL || 'INFO';
const FORMAT = process.env.DEVHIVE_LOG_FORMAT || 'human';

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.logl`);
}

function shouldEmit(level) {
  return LEVELS[level] >= LEVELS[DEFAULT_LEVEL];
}

function formatHuman(level, component, message, meta) {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${level}] [${component}] ${message}${metaStr}`;
}

function writeLog(level, component, message, meta = {}) {
  if (!shouldEmit(level)) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...meta,
  };
  const line = FORMAT === 'json'
    ? JSON.stringify(entry)
    : formatHuman(level, component, message, meta);
  // eslint-disable-next-line no-console
  console.log(line);
  ensureLogDir();
  appendFileSync(logFilePath(), `${line}\n`, 'utf8');
}

export function getLogger(component = 'devhive') {
  return {
    debug: (message, meta) => writeLog('DEBUG', component, message, meta),
    info: (message, meta) => writeLog('INFO', component, message, meta),
    warn: (message, meta) => writeLog('WARN', component, message, meta),
    error: (message, meta) => writeLog('ERROR', component, message, meta),
  };
}

export const defaultLogger = getLogger('devhive');
