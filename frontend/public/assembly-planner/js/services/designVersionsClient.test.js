// js/services/designVersionsClient.test.js — Contrato del cliente HTTP de
// versiones en la nube con fetch mockeado: rutas/métodos correctos, headers,
// propagación de { ok, ...data }, 401 → { auth:false } y fallo de red
// reportado como error amable (sin excepción).

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  listCloudVersions,
  saveCloudVersion,
  getCloudVersion,
  deleteCloudVersion,
  deleteAllCloudVersions,
} from './designVersionsClient.js';

const BASE = '/api/v1/planner-design-versions';
const originalFetch = globalThis.fetch;

/** fetch mock que registra las llamadas y responde según el handler. */
function useFetchMock(handler) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('rutas y métodos', () => {
  it('listCloudVersions: GET a la raíz con credentials same-origin', async () => {
    const calls = useFetchMock(() => jsonResponse(200, { versions: [{ id: 1 }] }));
    const r = await listCloudVersions();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/`);
    assert.equal(calls[0].options.method, undefined, 'GET sin method explícito');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(r, { ok: true, versions: [{ id: 1 }] });
  });

  it('saveCloudVersion: POST con body JSON {name, csv, pieceCount}', async () => {
    const calls = useFetchMock(() => jsonResponse(201, { id: 7 }));
    const r = await saveCloudVersion('Diseño A', { csv: 'a;b\n', pieceCount: 12 });
    assert.equal(calls[0].url, `${BASE}/`);
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      name: 'Diseño A',
      csv: 'a;b\n',
      pieceCount: 12,
    });
    assert.deepEqual(r, { ok: true, id: 7 });
  });

  it('getCloudVersion: GET /{id}', async () => {
    const calls = useFetchMock(() => jsonResponse(200, { name: 'V1' }));
    const r = await getCloudVersion(42);
    assert.equal(calls[0].url, `${BASE}/42`);
    assert.deepEqual(r, { ok: true, name: 'V1' });
  });

  it('deleteCloudVersion: DELETE /{id}', async () => {
    const calls = useFetchMock(() => jsonResponse(200, {}));
    const r = await deleteCloudVersion(9);
    assert.equal(calls[0].url, `${BASE}/9`);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.deepEqual(r, { ok: true });
  });

  it('deleteAllCloudVersions: DELETE a la raíz', async () => {
    const calls = useFetchMock(() => jsonResponse(200, {}));
    const r = await deleteAllCloudVersions();
    assert.equal(calls[0].url, `${BASE}/`);
    assert.equal(calls[0].options.method, 'DELETE');
    assert.equal(r.ok, true);
  });
});

describe('manejo de errores', () => {
  it('401 → { ok:false, auth:false, error:"Sesion requerida" }', async () => {
    useFetchMock(() => jsonResponse(401, { detail: 'no importa' }));
    const r = await listCloudVersions();
    assert.deepEqual(r, { ok: false, auth: false, error: 'Sesion requerida' });
  });

  it('respuesta !ok con detail → { ok:false, error: detail }', async () => {
    useFetchMock(() => jsonResponse(422, { detail: 'CSV inválido' }));
    const r = await saveCloudVersion('X', { csv: '', pieceCount: 0 });
    assert.deepEqual(r, { ok: false, error: 'CSV inválido' });
  });

  it('respuesta !ok sin detail → { ok:false, error: "Error <status>" }', async () => {
    useFetchMock(() => jsonResponse(500, {}));
    const r = await getCloudVersion(1);
    assert.deepEqual(r, { ok: false, error: 'Error 500' });
  });

  it('body JSON inválido se tolera (data = {})', async () => {
    useFetchMock(() => ({
      status: 200,
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    }));
    const r = await listCloudVersions();
    assert.deepEqual(r, { ok: true });
  });

  it('fallo de red (fetch rechaza) → { ok:false, error:"No se pudo contactar al servidor" }', async () => {
    useFetchMock(async () => { throw new TypeError('fetch failed'); });
    const r = await deleteCloudVersion(3);
    assert.deepEqual(r, { ok: false, error: 'No se pudo contactar al servidor' });
  });
});
