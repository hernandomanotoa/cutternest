import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, nameIncludes, nameMatchesAny } from '../normalize.js';

describe('normalizeName', () => {
  it('lowercases and removes accents', () => {
    assert.equal(normalizeName('Cajón Lateral'), 'cajon lateral');
    assert.equal(normalizeName('  Puerta ÁéíÓú  '), '  puerta aeiou  ');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(normalizeName(null), '');
    assert.equal(normalizeName(undefined), '');
  });
});

describe('nameIncludes', () => {
  it('matches any keyword from array', () => {
    assert.equal(nameIncludes('Frente Cajón', ['cajon', 'puerta']), true);
    assert.equal(nameIncludes('Lateral', ['cajon', 'puerta']), false);
  });

  it('matches single keyword string', () => {
    assert.equal(nameIncludes('Zócalo', 'zocalo'), true);
  });
});

describe('nameMatchesAny', () => {
  it('is equivalent to nameIncludes', () => {
    assert.equal(nameMatchesAny('Tapa', 'tapa'), true);
  });
});
