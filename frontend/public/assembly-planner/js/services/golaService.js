// js/services/golaService.js — Sistema de apertura gola con tiras de melamina
// (mismo material/color que el módulo), activable por módulo desde el
// Constructor. Dos mecanismos:
//   1. Tira horizontal en cada gap entre frentes de cajones apilados.
//   2. L-gola: el frente del cajón SUPERIOR se extiende hacia arriba hasta
//      dejar un espacio de agarre bajo la repisa inmediata superior (o bajo
//      el techo interior del casco). Sin tira: el propio frente forma la L.
// Al activar se ELIMINAN los tiradores del módulo; al desactivar se
// regeneran (espejo de addDrawer: 2×20 mm, espesor 5).
//
// Servicio PURO (sin DOM ni localStorage; el caller persiste `meta`):
//   applyGola(pieces, moduleId, cfg)   → { ok, pieces, warnings, meta }
//   removeGola(pieces, moduleId, cfg, meta?) → { ok, pieces, warnings }
//   validateGola(pieces, moduleId, cfg) → { errors, warnings }
//   isGolaEnabled(pieces, moduleId)     → bool (hay tiras del módulo)
//   drawerUnits(pieces, moduleId)       → unidades-cajón (para la UI/tests)
//   getGolaCfg(userConfig)              → defaults + overrides persistidos
//   golaReport(pieces, cfg, opts?)      → filas "Perfiles gola" para el manual
//
// Convenciones: unidades ordenadas por min pos_z de sus frentes (unidad 1 =
// la más baja, unidad N = la más alta, que recibe la L). Gap gola entre
// frentes G = golaPerfilHeight + golaFingerClearance (REEMPLAZA a
// drawerFrontGap; no se suman ambos).

import { inferRole } from './classifierService.js';

// Defaults PROVISIONALES (de taller; confirmar contra catálogo). Duplican los
// de core/config.js VERTICAL_POSITIONS para poder llamar al servicio desde
// tests sin userConfig.
export const GOLA_DEFAULTS = {
  golaPerfilHeight: 30,
  golaFingerClearance: 20,
  golaStripDepth: 60,
  golaStripSetback: 10,
  golaHolguraLateral: 2,
  golaTornillosPorPerfil: 2,
  golaMaxOverhang: 120,
  golaFijacion: 'Tornillos 3.5×16 + soporte trasero (PROVISIONAL)',
};

export const GOLA_NUMERIC_KEYS = [
  'golaPerfilHeight',
  'golaFingerClearance',
  'golaStripDepth',
  'golaStripSetback',
  'golaHolguraLateral',
  'golaTornillosPorPerfil',
  'golaMaxOverhang',
];

/** Mergea defaults PROVISIONALES con overrides numéricos/string persistidos. */
export function getGolaCfg(userConfig = {}) {
  const cfg = { ...GOLA_DEFAULTS };
  for (const key of GOLA_NUMERIC_KEYS) {
    const value = Number(userConfig?.[key]);
    if (Number.isFinite(value) && value >= 0) cfg[key] = value;
  }
  if (typeof userConfig?.golaFijacion === 'string' && userConfig.golaFijacion.trim()) {
    cfg.golaFijacion = userConfig.golaFijacion.trim();
  }
  return cfg;
}

// Pieza del módulo raíz o de sus submódulos ('11', '1.2'...).
function perteneceAModulo(p, moduleId) {
  const mod = String(p?.modulo || '').trim();
  const id = String(moduleId);
  return mod === id || (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`)));
}

const redondea1 = (v) => Math.round(v * 10) / 10;

function stripPrefix(moduleId) {
  return `m${moduleId}-gola-`;
}

function esTiraGola(p) {
  return inferRole(p) === 'gola_strip';
}

/**
 * true cuando el módulo ya tiene tiras gola aplicadas.
 */
export function isGolaEnabled(pieces, moduleId) {
  return (pieces || []).some((p) => esTiraGola(p) && perteneceAModulo(p, moduleId));
}

/**
 * Unidades-cajón del módulo: grupos de frentes (rol drawer_face) por
 * submódulo, ordenados por min pos_z (unidad 1 = la más baja). Un cajón de
 * 2 frentes por fila cuenta como 1 unidad (mismo submódulo).
 *
 * @returns {Array<{sub: string, frentes: object[], minZ: number, latAltoCaja: number|null}>}
 */
export function drawerUnits(pieces, moduleId) {
  const porSub = new Map();
  for (const p of pieces || []) {
    if (inferRole(p) !== 'drawer_face' || !perteneceAModulo(p, moduleId)) continue;
    if (!Number.isFinite(Number(p.pos_z))) continue;
    const sub = String(p.modulo || '');
    if (!porSub.has(sub)) porSub.set(sub, []);
    porSub.get(sub).push(p);
  }
  const unidades = [];
  for (const [sub, frentes] of porSub) {
    // Alto de la caja: el lateral del cajón (rol drawer_side del submódulo).
    const lateral = (pieces || []).find((p) =>
      String(p.modulo || '') === sub && inferRole(p) === 'drawer_side');
    unidades.push({
      sub,
      frentes,
      minZ: Math.min(...frentes.map((f) => Number(f.pos_z))),
      latAltoCaja: lateral ? Number(lateral.alto) || null : null,
    });
  }
  return unidades.sort((a, b) => a.minZ - b.minZ);
}

// Dimensiones del casco desde sus piezas (mismo criterio que app.moduleDims).
function cascoDims(pieces, moduleId) {
  const delMod = (pieces || []).filter((p) => String(p.modulo || '') === String(moduleId));
  const tapa = delMod.find((p) => String(p.id) === `m${moduleId}-tapa`)
    || delMod.find((p) => inferRole(p) === 'top_panel');
  const lateral = delMod.find((p) => String(p.id) === `m${moduleId}-lateral-izq`)
    || delMod.find((p) => inferRole(p) === 'side_panel');
  if (!tapa && !lateral) return null;
  const espesor = Number((tapa || lateral).espesor) || 15;
  const anchoModulo = tapa ? Number(tapa.ancho) || 0 : 0;
  const altoModulo = lateral ? Number(lateral.alto) || 0 : 0;
  if (!anchoModulo || !altoModulo) return null;
  // Profundidad del casco: el ALTO de la tapa (se modela ancho × prof) o, en
  // su defecto, el ANCHO de un lateral (prof × alto). 0 = no derivable (p. ej.
  // CSV sin tapa reconocible): validateGola omite entonces el chequeo de
  // interferencia tira↔caja en el eje Y.
  const profundidad = (tapa && Number(tapa.alto)) || (lateral && Number(lateral.ancho)) || 0;
  return {
    anchoModulo,
    altoModulo,
    espesor,
    profundidad,
    anchoInterior: anchoModulo - 2 * espesor,
    techoInterior: altoModulo - espesor, // cara inferior de la tapa
    colorCuerpo: String((lateral || tapa).color || ''),
  };
}

// Referencia vertical superior para la L-gola: pos_z (borde inferior) de la
// repisa inmediatamente superior más cercana; si no hay, el techo interior.
function topRefDe(pieces, moduleId, techoUltimoFrente, techoInterior) {
  const repisas = (pieces || []).filter((p) =>
    inferRole(p) === 'shelf'
    && String(p.modulo || '') === String(moduleId)
    && Number.isFinite(Number(p.pos_z))
    && Number(p.pos_z) >= techoUltimoFrente - 0.5);
  if (!repisas.length) return techoInterior;
  return Math.min(...repisas.map((p) => Number(p.pos_z)));
}

function colorTira(pieces, moduleId, casco, unidades) {
  if (casco?.colorCuerpo) return casco.colorCuerpo;
  const frente = unidades[0]?.frentes[0];
  return String(frente?.color || '');
}

/**
 * Aplica el sistema gola a un módulo. Reescala SOLO los frentes (las cajas
 * no cambian), crea N−1 tiras y elimina los tiradores del módulo.
 *
 * @returns {{ok:true, pieces: object[], warnings: string[], meta: object}
 *         | {ok:false, errors: string[], warnings?: string[]}}
 */
export function applyGola(pieces, moduleId, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const modId = String(moduleId);
  const unidades = drawerUnits(pieces, modId);
  if (!unidades.length) {
    return { ok: false, errors: [`El módulo ${modId} no tiene cajones con pos_z anclado`] };
  }
  const casco = cascoDims(pieces, modId);
  if (!casco) {
    return { ok: false, errors: [`El módulo ${modId} no tiene casco (tapa/lateral) para derivar el vano`] };
  }

  const N = unidades.length;
  const bottom = unidades[0].minZ;
  const techoUltimoFrente = Math.max(...unidades[N - 1].frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)));
  const topRef = topRefDe(pieces, modId, techoUltimoFrente, casco.techoInterior);
  const H_new = topRef - cfg.golaFingerClearance - bottom;
  const G = cfg.golaPerfilHeight + cfg.golaFingerClearance;
  const disponible = H_new - (N - 1) * G;
  // Vano mínimo real: cada frente debe cubrir su caja (lateral + 10 mm).
  const minSuma = unidades.reduce(
    (s, u) => s + (u.latAltoCaja != null ? u.latAltoCaja + 10 : 30),
    0,
  );
  if (disponible < minSuma) {
    return {
      ok: false,
      errors: [`Gola: el vano no alcanza (span ${Math.round(H_new)} mm, ${N} cajón/cajones, gap gola ${G} mm; disponible ${Math.round(disponible)} mm < mínimo ${minSuma} mm para cubrir las cajas). Reduzca cajones o aumente el vano.`],
    };
  }

  // meta para el round-trip (restore exacto al desactivar).
  const meta = {
    moduleId: modId,
    origSpan: redondea1(techoUltimoFrente - bottom),
    origHeights: {},
    origTops: {},
  };
  for (const u of unidades) {
    for (const f of u.frentes) {
      meta.origHeights[String(f.id)] = Number(f.alto) || 0;
      meta.origTops[String(f.id)] = Number(f.pos_z) || 0;
    }
  }

  // Reescalado proporcional de frentes; la unidad 1 absorbe el residual de
  // redondeo para que Σaᵢ' + (N−1)·G = H_new exacto.
  const origHeights = unidades.map((u) => Math.max(...u.frentes.map((f) => Number(f.alto) || 0)));
  const sumOrig = origHeights.reduce((s, h) => s + h, 0);
  const nuevasAlturas = origHeights.map((h) => Math.round((h * disponible) / sumOrig));
  const residual = disponible - nuevasAlturas.reduce((s, h) => s + h, 0);
  nuevasAlturas[0] += residual;

  // Extensión L del último frente: su techo queda en topRef − clearance por
  // construcción; si la sobrealtura respecto a su caja supera el cap, se cap
  // y se avisa (la L queda más baja que el objetivo).
  const warnings = [];
  let capped = false;
  const latUltima = unidades[N - 1].latAltoCaja;
  if (latUltima != null && nuevasAlturas[N - 1] - latUltima > cfg.golaMaxOverhang) {
    const extensionAntes = nuevasAlturas[N - 1] - latUltima;
    nuevasAlturas[N - 1] = latUltima + cfg.golaMaxOverhang;
    capped = true;
    warnings.push(
      `Gola: la repisa queda muy arriba para la L (extensión ${Math.round(extensionAntes)} mm > máx. ${cfg.golaMaxOverhang} mm): el frente superior se limitó a ${nuevasAlturas[N - 1]} mm.`
    );
  }
  for (let i = 0; i < N; i++) {
    if (nuevasAlturas[i] < origHeights[i]) {
      warnings.push(
        `Gola: frente "${unidades[i].frentes[0].nombre}" reducido a ${nuevasAlturas[i]} mm (era ${origHeights[i]} mm).`
      );
    }
  }

  // Reposicionar: z₁ = bottom, z_{i+1} = zᵢ + aᵢ' + G.
  const nuevasTops = [];
  let cursor = bottom;
  for (let i = 0; i < N; i++) {
    nuevasTops.push(redondea1(cursor));
    cursor += nuevasAlturas[i] + G;
  }

  // Alturas/pos_z nuevos por frente (todos los frentes de la unidad reciben
  // la misma altura; el pos_z de cada frente queda anclado al de su unidad).
  const alturaPorFrente = new Map();
  const topPorFrente = new Map();
  for (let i = 0; i < N; i++) {
    for (const f of unidades[i].frentes) {
      alturaPorFrente.set(String(f.id), nuevasAlturas[i]);
      topPorFrente.set(String(f.id), nuevasTops[i]);
    }
  }

  // Tiras i = 1..N−1: sobre el techo del frente inferior (unidad i),
  // con el agarre hacia arriba, bajo el borde inferior del frente superior.
  const prefijo = stripPrefix(modId);
  const anchoTira = casco.anchoInterior - 2 * cfg.golaHolguraLateral;
  const color = colorTira(pieces, modId, casco, unidades);
  const tiras = [];
  for (let i = 1; i <= N - 1; i++) {
    tiras.push({
      id: `${prefijo}${i}`,
      nombre: 'Perfil gola',
      ancho: anchoTira,
      alto: cfg.golaPerfilHeight,
      cantidad: 1,
      rotate: false,
      color,
      espesor: 15,
      cantos: '',
      modulo: modId,
      pos_z: redondea1(nuevasTops[i - 1] + nuevasAlturas[i - 1]),
    });
  }

  // Ensamblar: frentes reescalados/reposicionados, tiradores fuera, tiras
  // nuevas (reemplaza las anteriores si las hubiera), resto intacto.
  const idsFrentes = new Set(alturaPorFrente.keys());
  const tiradoresOut = new Set(
    (pieces || [])
      .filter((p) => inferRole(p) === 'handle' && perteneceAModulo(p, modId))
      .map((p) => String(p.id)),
  );
  const resultado = [];
  for (const p of pieces || []) {
    const id = String(p.id);
    if (id.startsWith(prefijo)) continue; // tiras viejas (re-aplicación)
    if (tiradoresOut.has(id)) continue;   // gola sin tiradores
    if (idsFrentes.has(id)) {
      resultado.push({
        ...p,
        alto: alturaPorFrente.get(id),
        pos_z: topPorFrente.get(id),
      });
      continue;
    }
    resultado.push(p);
  }
  resultado.push(...tiras);

  const validacion = validateGola(resultado, modId, cfg);
  if (validacion.errors.length) {
    return { ok: false, errors: validacion.errors, warnings: [...warnings, ...validacion.warnings] };
  }
  return { ok: true, pieces: resultado, warnings: [...warnings, ...validacion.warnings], meta };
}

/**
 * Regenera los tiradores de las unidades-cajón del módulo (espejo de
 * addDrawer: 2×20 mm, espesor 5, color aluminio). Idénticos ids/nombres a
 * los que genera closetBuilderService.addDrawer.
 */
function regenerarTiradores(pieces, moduleId, unidades) {
  const existentes = new Set((pieces || []).map((p) => String(p.id)));
  const nuevos = [];
  for (const u of unidades) {
    for (const f of u.frentes) {
      const id = String(f.id).replace(/-frente$/, '-tirador');
      if (existentes.has(id)) continue;
      nuevos.push({
        id,
        nombre: String(f.nombre).replace(/^Frente/, 'Tirador'),
        ancho: 2,
        alto: 20,
        cantidad: 1,
        rotate: false,
        color: '#A0A0A0',
        espesor: 5,
        cantos: '',
        modulo: String(f.modulo),
      });
    }
  }
  return nuevos;
}

/**
 * Desactiva el gola del módulo: quita las tiras, restaura frentes y
 * regenera los tiradores.
 * - Con `meta` (persistido por app.js al activar): restaura alturas/pos_z
 *   originales exactos.
 * - Sin `meta` (fallback): reescalado proporcional para llenar el span
 *   actual con drawerFrontGap.
 */
export function removeGola(pieces, moduleId, userConfig = {}, meta = null) {
  const cfg = getGolaCfg(userConfig);
  const drawerFrontGap = Number(userConfig?.drawerFrontGap) >= 0
    ? Number(userConfig.drawerFrontGap)
    : 2.5;
  const modId = String(moduleId);
  const prefijo = stripPrefix(modId);
  const unidades = drawerUnits(pieces, modId);

  let base = (pieces || []).filter((p) => !String(p.id).startsWith(prefijo));
  const alturaPorFrente = new Map();
  const topPorFrente = new Map();

  if (meta && meta.origHeights && meta.origTops) {
    for (const [id, h] of Object.entries(meta.origHeights)) alturaPorFrente.set(id, h);
    for (const [id, z] of Object.entries(meta.origTops)) topPorFrente.set(id, z);
  } else if (unidades.length) {
    // Fallback proporcional: llenar el span ocupado actual con drawerFrontGap.
    const bottom = unidades[0].minZ;
    const techoActual = Math.max(...unidades.flatMap((u) =>
      u.frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0))));
    const span = Math.max(0, techoActual - bottom);
    const N = unidades.length;
    const disponible = span - (N - 1) * drawerFrontGap;
    if (disponible > 0) {
      const orig = unidades.map((u) => Math.max(...u.frentes.map((f) => Number(f.alto) || 0)));
      const sumOrig = orig.reduce((s, h) => s + h, 0);
      if (sumOrig > 0) {
        const alturas = orig.map((h) => Math.round((h * disponible) / sumOrig));
        alturas[0] += disponible - alturas.reduce((s, h) => s + h, 0);
        let cursor = bottom;
        for (let i = 0; i < N; i++) {
          for (const f of unidades[i].frentes) {
            alturaPorFrente.set(String(f.id), alturas[i]);
            topPorFrente.set(String(f.id), redondea1(cursor));
          }
          cursor += alturas[i] + drawerFrontGap;
        }
      }
    }
  }

  if (alturaPorFrente.size) {
    base = base.map((p) => {
      const id = String(p.id);
      if (!alturaPorFrente.has(id)) return p;
      return {
        ...p,
        alto: alturaPorFrente.get(id),
        pos_z: topPorFrente.has(id) ? topPorFrente.get(id) : p.pos_z,
      };
    });
  }

  const unidadesRestauradas = drawerUnits(base, modId);
  const tiradores = regenerarTiradores(base, modId, unidadesRestauradas);
  return { ok: true, pieces: [...base, ...tiradores], warnings: [] };
}

/**
 * Validaciones del estado gola aplicado: frente cubre su caja, tiras dentro
 * del vano, sin solapes frente↔tira, Σaᵢ' + (N−1)·G ≈ H_new (±2 mm, salvo
 * cap) y extensiones ≤ cap. Devuelve { errors, warnings }.
 */
export function validateGola(pieces, moduleId, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const errors = [];
  const warnings = [];
  const modId = String(moduleId);
  const unidades = drawerUnits(pieces, modId);
  if (!unidades.length) {
    return { errors: [`El módulo ${modId} no tiene cajones`], warnings };
  }
  const casco = cascoDims(pieces, modId);
  const techoInterior = casco ? casco.techoInterior : Infinity;
  const N = unidades.length;
  const G = cfg.golaPerfilHeight + cfg.golaFingerClearance;

  // Frente cubre su caja (aᵢ' ≥ altoLateral + 10) y unidades ordenadas.
  for (const u of unidades) {
    const altoFrente = Math.max(...u.frentes.map((f) => Number(f.alto) || 0));
    if (u.latAltoCaja != null && altoFrente < u.latAltoCaja + 10) {
      errors.push(
        `Gola: el frente "${u.frentes[0].nombre}" (${altoFrente} mm) no cubre su caja (lateral ${u.latAltoCaja} mm).`
      );
    }
  }
  for (let i = 1; i < N; i++) {
    if (unidades[i].minZ <= unidades[i - 1].minZ) {
      errors.push('Gola: las posiciones de los frentes no son monótonas crecientes.');
      break;
    }
  }

  // Tiras: dentro del vano y sin solape con frentes; agarre correcto.
  const tiras = (pieces || []).filter((p) => esTiraGola(p) && perteneceAModulo(p, modId));
  const frentes = unidades.flatMap((u) => u.frentes);
  tiras.forEach((t) => {
    const z = Number(t.pos_z);
    const alto = Number(t.alto) || 0;
    if (!(z >= 0) || z + alto > techoInterior + 0.5) {
      errors.push(`Gola: la tira "${t.id}" queda fuera del vano (z=${z}, alto=${alto}).`);
    }
    for (const f of frentes) {
      const fz = Number(f.pos_z);
      const fh = Number(f.alto) || 0;
      if (z < fz + fh - 0.5 && fz < z + alto - 0.5) {
        errors.push(`Gola: la tira "${t.id}" se solapa con el frente "${f.nombre}".`);
      }
    }
    // Agarre: techo de la tira + clearance = borde inferior del frente superior.
    const superior = frentes.find((f) => Math.abs(Number(f.pos_z) - (z + alto + cfg.golaFingerClearance)) <= 1.5);
    if (!superior) {
      warnings.push(`Gola: la tira "${t.id}" no deja exactamente ${cfg.golaFingerClearance} mm de agarre bajo ningún frente.`);
    }
  });

  // Interferencia en profundidad (eje Y; y=0 en el fondo del casco y +y hacia
  // el frente, misma referencia que drawerGeometry/golaGeometry). La tira va
  // retranqueada detrás del plano de frentes (yFace = moduleD − espesor +
  // drawerGap 15) y se extiende golaStripDepth hacia el fondo. Las cajas
  // ocupan aprox. [espesor, moduleD − espesor − 10] (profundidad de caja =
  // moduleD − 2·espesor − 10). Como ambos rangos se solapan casi siempre, el
  // chequeo útil es que la tira no sobresalga por detrás de las cajas ni
  // quede retranqueada hasta detrás del plano interior del fondo.
  const DRAWER_GAP_REF = 15;
  const TOLERANCIA_PROF = 1;
  if (tiras.length && casco && casco.profundidad > 0) {
    const yTira = casco.profundidad - casco.espesor + DRAWER_GAP_REF - cfg.golaStripSetback;
    const yTraseroTira = yTira - cfg.golaStripDepth;
    if (yTira < casco.espesor) {
      errors.push(
        `Gola: retranqueo excesivo (golaStripSetback ${cfg.golaStripSetback} mm): la tira quedaría detrás del plano interior del fondo (frente de tira a ${Math.round(yTira)} mm < espesor ${casco.espesor} mm).`
      );
    } else if (yTraseroTira < casco.espesor - TOLERANCIA_PROF) {
      errors.push(
        `Gola: la tira sobresale por detrás de las cajas (golaStripDepth ${cfg.golaStripDepth} mm en módulo de ${casco.profundidad} mm de fondo: trasero de tira a ${Math.round(yTraseroTira)} mm < espesor ${casco.espesor} mm). Reduzca la profundidad de la tira o aumente el fondo del módulo.`
      );
    }
  }

  // Extensión L del último frente y span total.
  const ultima = unidades[N - 1];
  const altoUltima = Math.max(...ultima.frentes.map((f) => Number(f.alto) || 0));
  const techoUltima = Math.max(...ultima.frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)));
  const extension = ultima.latAltoCaja != null ? altoUltima - ultima.latAltoCaja : 0;
  const capped = extension >= cfg.golaMaxOverhang - 0.5;
  if (extension > cfg.golaMaxOverhang + 0.5) {
    errors.push(
      `Gola: la extensión del frente L (${Math.round(extension)} mm) supera el máximo (${cfg.golaMaxOverhang} mm).`
    );
  }
  if (!capped) {
    const topRef = topRefDe(pieces, modId, techoUltima, techoInterior);
    const bottom = unidades[0].minZ;
    const H_new = topRef - cfg.golaFingerClearance - bottom;
    const suma = unidades.reduce((s, u) => s + Math.max(...u.frentes.map((f) => Number(f.alto) || 0)), 0) + (N - 1) * G;
    if (Math.abs(suma - H_new) > 2) {
      errors.push(
        `Gola: el reparto vertical no cierra (Σ ${Math.round(suma)} mm vs span objetivo ${Math.round(H_new)} mm).`
      );
    }
  }

  return { errors, warnings };
}

// Módulo raíz de una pieza: '11' → '1', '1.2' → '1' (misma convención que
// perteneceAModulo). Sin prefijo numérico, devuelve el módulo tal cual.
function raizDe(modulo) {
  const m = String(modulo || '').trim();
  const match = m.match(/^(\d+)/);
  return match ? match[1] : m;
}

function materialDe(p) {
  const color = String(p?.color || '').trim();
  return color ? `Melamina (${color})` : 'Melamina';
}

/**
 * Reporte de perfiles gola para el manual de ensamblaje: una fila por tira
 * (ubicación relativa a los frentes, longitud de corte, material, fijación)
 * más una fila por frente L (el de la unidad superior del módulo recibe la
 * L-gola por construcción de applyGola; ids adicionales pueden pasarse en
 * opts.lFrontIds, p. ej. desde el meta persistido por app.js).
 *
 * @returns {Array<{id:string, ubicacion:string, corteMm:number, cantidad:number, material:string, fijacion:string}>}
 *          [] cuando no hay tiras ni frentes L declarados.
 */
export function golaReport(pieces, userConfig = {}, opts = {}) {
  const cfg = getGolaCfg(userConfig);
  const lista = pieces || [];
  const tiras = lista.filter(esTiraGola);
  const lFrontIds = new Set((opts.lFrontIds || []).map(String));
  const porId = new Map(lista.map((p) => [String(p.id), p]));
  const raices = new Set(tiras.map((t) => String(t.modulo)));
  for (const id of lFrontIds) {
    const p = porId.get(id);
    if (p) raices.add(raizDe(p.modulo));
  }
  if (!raices.size) return [];

  const rows = [];
  for (const raiz of raices) {
    const unidades = drawerUnits(lista, raiz);
    const tirasMod = tiras
      .filter((t) => String(t.modulo) === raiz)
      .sort((a, b) => Number(a.pos_z) - Number(b.pos_z));
    tirasMod.forEach((t, i) => {
      rows.push({
        id: String(t.id),
        ubicacion: `Entre cajón ${i + 1} e ${i + 2}`,
        corteMm: Math.round(Number(t.ancho) || 0),
        cantidad: Math.max(1, Math.round(Number(t.cantidad) || 1)),
        material: materialDe(t),
        fijacion: cfg.golaFijacion,
      });
    });
    const esL = new Set(lFrontIds);
    if (tirasMod.length && unidades.length) {
      for (const f of unidades[unidades.length - 1].frentes) esL.add(String(f.id));
    }
    for (const u of unidades) {
      for (const f of u.frentes) {
        if (!esL.has(String(f.id))) continue;
        rows.push({
          id: String(f.id),
          ubicacion: 'L-gola: bajo la repisa',
          corteMm: Math.round(Number(f.ancho) || 0),
          cantidad: Math.max(1, Math.round(Number(f.cantidad) || 1)),
          material: materialDe(f),
          fijacion: cfg.golaFijacion,
        });
      }
    }
  }
  return rows;
}
