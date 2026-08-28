import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VERTICAL_POSITIONS } from '../../core/config.js';
import {
  loadUserConfig,
  saveUserConfig,
  resetUserConfig,
} from '../userConfigService.js';

function createMockStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
  };
}

describe('userConfigService', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
    globalThis.localStorage = storage;
  });

  describe('loadUserConfig', () => {
    it('returns defaults when localStorage is empty', () => {
      const config = loadUserConfig();
      assert.deepEqual(config, { ...VERTICAL_POSITIONS, pieceOffsets: {} });
    });

    it('merges saved overrides with defaults', () => {
      storage.setItem(
        'cn-assembly-config',
        JSON.stringify({ defaultGap: 40, seatHeight: 500 })
      );
      const config = loadUserConfig();
      assert.equal(config.defaultGap, 40);
      assert.equal(config.seatHeight, 500);
      assert.equal(config.firstInnerGap, VERTICAL_POSITIONS.firstInnerGap);
    });

    it('ignores invalid stored values', () => {
      storage.setItem(
        'cn-assembly-config',
        JSON.stringify({ defaultGap: 'bad', shelfTopInset: 200 })
      );
      const config = loadUserConfig();
      assert.equal(config.defaultGap, VERTICAL_POSITIONS.defaultGap);
      assert.equal(config.shelfTopInset, 200);
    });

    it('falls back to defaults when localStorage is unavailable', () => {
      delete globalThis.localStorage;
      const config = loadUserConfig();
      assert.deepEqual(config, { ...VERTICAL_POSITIONS, pieceOffsets: {} });
    });
  });

  describe('saveUserConfig', () => {
    it('stores only keys that differ from defaults', () => {
      saveUserConfig({ ...VERTICAL_POSITIONS, defaultGap: 35 });
      const raw = storage.getItem('cn-assembly-config');
      const saved = JSON.parse(raw);
      assert.deepEqual(saved, { defaultGap: 35 });
    });

    it('stores pieceOffsets overrides', () => {
      saveUserConfig({ ...VERTICAL_POSITIONS, pieceOffsets: { r1: { offset: 10, gap: 20 } } });
      const raw = storage.getItem('cn-assembly-config');
      const saved = JSON.parse(raw);
      assert.deepEqual(saved.pieceOffsets, { r1: { offset: 10, gap: 20 } });
    });

    it('does nothing when values match defaults', () => {
      saveUserConfig({ ...VERTICAL_POSITIONS });
      const raw = storage.getItem('cn-assembly-config');
      assert.equal(raw, '{}');
    });

    it('gracefully handles missing localStorage', () => {
      delete globalThis.localStorage;
      assert.doesNotThrow(() => saveUserConfig({ defaultGap: 99 }));
    });
  });

  describe('resetUserConfig', () => {
    it('removes the storage key', () => {
      storage.setItem('cn-assembly-config', JSON.stringify({ defaultGap: 55 }));
      resetUserConfig();
      assert.equal(storage.getItem('cn-assembly-config'), null);
    });

    it('gracefully handles missing localStorage', () => {
      delete globalThis.localStorage;
      assert.doesNotThrow(() => resetUserConfig());
    });
  });
});
