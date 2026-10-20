// js/services/designVersionsClient.js — Cliente HTTP de las versiones de
// diseno en la nube (backend /api/v1/planner-design-versions, con auth).
// Las versiones locales (localStorage) siguen siendo la fuente primaria;
// la nube es backup multi-dispositivo. 401 se reporta como { ok:false,
// auth:false } para que la UI invite a iniciar sesion.

const BASE = '/api/v1/planner-design-versions';

async function request(path, options = {}) {
  try {
    const res = await fetch(BASE + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (res.status === 401) return { ok: false, auth: false, error: 'Sesion requerida' };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.detail || `Error ${res.status}` };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: 'No se pudo contactar al servidor' };
  }
}

export function listCloudVersions() {
  return request('/');
}

export function saveCloudVersion(name, { csv, pieceCount }) {
  return request('/', {
    method: 'POST',
    body: JSON.stringify({ name, csv, pieceCount }),
  });
}

export function getCloudVersion(id) {
  return request(`/${id}`);
}

export function deleteCloudVersion(id) {
  return request(`/${id}`, { method: 'DELETE' });
}

export function deleteAllCloudVersions() {
  return request('/', { method: 'DELETE' });
}
