// js/services/golaSectionService.js — Modelos de datos de las secciones
// transversales acotadas de los canales gola (vista lateral Y-Z), para los
// planos de taller: canal horizontal tipo C (entre frentes) y canal vertical
// tipo L (bajo la repisa). Servicio PURO: sin DOM ni SVG (el SVG lo arma
// js/components/renderers/frontElevationRenderer.js, modo sección).
//
// Referencias del corte: y = 0 en el plano de frentes, creciendo hacia el
// fondo del módulo; z = altura (mm desde el borde inferior del fondo). Las
// medidas reales salen del cfg de taller (getGolaCfg) y de las piezas del
// canal (fondo, pestañas) creadas por applyGola.
//
// buildGolaSections(pieces, userConfig?) → Array<{
//   tipo:'C'|'L', canalId, indice, modulo, descripcion,
//   perfilMm, pasoMm, retranqueoMm, profundidadMm, espesorMm,
//   abertura: { utilMm, altoMm, profundidadMm, desdeZ, hastaZ, etiqueta },
//   piezas: [{ id, rol:'fondo'|'pestana'|'frente'|'repisa', y, z,
//              profundidad, alto, etiqueta, fija }],
//   puntosFijacion: [{ zMm, nota }],
//   anclajeSuperior: { tipo, id, descripcion } | null,
//   plan, planTxt,
//   cotas: [{ eje:'y'|'z', inicio, fin, valor, etiqueta }],
// }>

import { inferRole } from './classifierService.js';
import {
  getGolaCfg,
  aberturaCanalGola,
  drawerUnits,
  planFijacionCanal,
  fijacionGolaReport,
  resumenPlanFijacion,
  agrupaCanalesGola,
  GOLA_PESTANA_ALTO_MM,
} from './golaService.js';

const mm = (v) => Math.round(Number(v) * 10) / 10;
const ESP_TIRA = 15; // espesor de la melamina de la tira (mm)

// Módulo raíz de una pieza: '11' → '1', '1.2' → '1'.
function raizDe(modulo) {
  const m = String(modulo || '').trim();
  const match = m.match(/^(\d+)/);
  return match ? match[1] : m;
}

function esTiraGola(p) {
  return inferRole(p) === 'gola_strip';
}

// Techo (pos_z + alto) más alto de los frentes de una unidad-cajón.
function techoUnidad(u) {
  return Math.max(...u.frentes.map((f) => (Number(f.pos_z) || 0) + (Number(f.alto) || 0)));
}

/**
 * Secciones transversales acotadas de todos los canales gola del diseño,
 * ordenadas por módulo y canal. Sin canales devuelve [].
 *
 * @param {object[]} pieces piezas del diseño (con tiras gola aplicadas).
 * @param {object} [userConfig] config del usuario (perfil de taller).
 */
export function buildGolaSections(pieces, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const lista = pieces || [];
  const tiras = lista.filter(esTiraGola);
  if (!tiras.length) return [];

  // Plan de fijación calculado por canal (incluye el anclaje superior real
  // de la L: repisa o tapa). canalId = id del fondo sin el sufijo '-fondo'.
  const { planes } = fijacionGolaReport(lista, userConfig);
  const planPorCanal = new Map(planes.map((p) => [p.canalId, p]));

  const secciones = [];
  const porRaiz = new Map();
  for (const t of tiras) {
    const raiz = raizDe(t.modulo);
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz).push(t);
  }

  for (const [raiz, ts] of porRaiz) {
    const unidades = drawerUnits(lista, raiz);
    const canales = [...agrupaCanalesGola(ts).entries()]
      .map(([, canal]) => canal)
      .sort((a, b) => a.indice - b.indice);

    for (const canal of canales) {
      const fondo = canal.piezas.find((p) => String(p.id).endsWith('-fondo'));
      if (!fondo) continue;
      const tipo = canal.tipo === 'c' ? 'C' : 'L';
      const zBase = Number(fondo.pos_z) || 0;
      const perfil = cfg.golaPerfilHeight;
      const paso = cfg.golaPaso;
      const setback = cfg.golaStripSetback;
      const depth = cfg.golaStripDepth;
      const ab = aberturaCanalGola(tipo, cfg);
      const canalId = String(fondo.id).replace(/-fondo$/, '');
      const plan = planPorCanal.get(canalId)
        || planFijacionCanal(fondo, { tipo, indice: canal.indice }, cfg);

      const piezas = [];
      const frente = (u, zDesde, zHasta) => {
        for (const f of u.frentes) {
          piezas.push({
            id: String(f.id),
            rol: 'frente',
            y: -ESP_TIRA, z: mm(zDesde),
            profundidad: ESP_TIRA, alto: mm(zHasta - zDesde),
            etiqueta: `Frente ${mm(Number(f.ancho) || 0)}×${mm(Number(f.alto) || 0)}`,
            fija: false,
          });
        }
      };

      // Cuerpo del canal: fondo vertical retranqueado + pestañas horizontales.
      piezas.push({
        id: String(fondo.id), rol: 'fondo',
        y: setback, z: mm(zBase),
        profundidad: depth, alto: perfil,
        etiqueta: `Fondo ${mm(Number(fondo.ancho) || 0)}×${perfil}`,
        fija: true,
      });
      const pestInf = canal.piezas.find((p) => /-pestana-inf$/.test(String(p.id)))
        || (tipo === 'L' ? canal.piezas.find((p) => /-pestana$/.test(String(p.id))) : null);
      if (pestInf) {
        piezas.push({
          id: String(pestInf.id), rol: 'pestana',
          y: 0, z: mm(zBase),
          profundidad: setback + ESP_TIRA, alto: ESP_TIRA,
          etiqueta: `Pestaña ${mm(Number(pestInf.ancho) || 0)}×${mm(Number(pestInf.alto) || depth)}`,
          fija: true,
        });
      }

      let abertura;
      if (tipo === 'C') {
        const pestSup = canal.piezas.find((p) => /-pestana-sup$/.test(String(p.id)));
        if (pestSup) {
          piezas.push({
            id: String(pestSup.id), rol: 'pestana',
            y: 0, z: mm(zBase + perfil - ESP_TIRA),
            profundidad: setback + ESP_TIRA, alto: ESP_TIRA,
            etiqueta: `Pestaña ${mm(Number(pestSup.ancho) || 0)}×${mm(Number(pestSup.alto) || depth)}`,
            fija: true,
          });
        }
        // Frentes adyacentes: unidad inferior (techo = zBase − paso) y
        // unidad superior (pos_z = zBase + perfil + paso).
        const uInf = unidades[canal.indice - 1];
        const uSup = unidades[canal.indice];
        if (uInf) frente(uInf, techoUnidad(uInf) - (Number(uInf.frentes[0].alto) || 0), techoUnidad(uInf));
        if (uSup) frente(uSup, Number(uSup.frentes[0].pos_z) || 0, (Number(uSup.frentes[0].pos_z) || 0) + (Number(uSup.frentes[0].alto) || 0));
        abertura = {
          utilMm: ab.aberturaUtilMm,
          altoMm: ab.aberturaUtilMm,
          profundidadMm: ab.profundidadEntradaMm,
          desdeZ: mm(zBase + ESP_TIRA),
          hastaZ: mm(zBase + perfil - ESP_TIRA),
          yDesde: 0, yHasta: setback,
          etiqueta: `Abertura útil ${ab.aberturaUtilMm} mm`,
        };
      } else {
        // Canal L: el frente superior (la propia L) tapa la pestaña inferior
        // y el agarre entra desde arriba, bajo la repisa/tapa.
        const uSup = unidades[unidades.length - 1];
        const topRef = zBase + perfil + paso;
        const techoFrente = topRef - cfg.golaFingerClearance;
        if (uSup) frente(uSup, zBase, techoFrente);
        if (plan.anclajeSuperior?.tipo === 'repisa') {
          const repisa = lista.find((p) => String(p.id) === String(plan.anclajeSuperior.id));
          piezas.push({
            id: String(plan.anclajeSuperior.id), rol: 'repisa',
            y: 0, z: mm(topRef),
            profundidad: depth + setback, alto: ESP_TIRA,
            etiqueta: repisa
              ? `Repisa ${mm(Number(repisa.ancho) || 0)}×${mm(Number(repisa.alto) || ESP_TIRA)}`
              : 'Repisa',
            fija: true,
          });
        }
        abertura = {
          utilMm: ab.aberturaUtilMm,
          altoMm: ab.aberturaUtilMm,
          profundidadMm: ab.profundidadEntradaMm,
          desdeZ: mm(techoFrente),
          hastaZ: mm(topRef),
          yDesde: setback, yHasta: setback + depth,
          etiqueta: `Abertura útil ${ab.aberturaUtilMm} mm (bajo la repisa)`,
        };
      }

      const puntosFijacion = (plan.tornillos?.posicionZmm || []).map((z) => ({
        zMm: mm(zBase + z),
        distDesdeBordeMm: mm(z),
        nota: `Tornillo ${plan.tornillos.diametro} a ${mm(z)} mm del borde inferior`,
      }));

      const cotas = [
        { eje: 'z', inicio: mm(zBase), fin: mm(zBase + perfil), valor: perfil, etiqueta: `Cuerpo del perfil ${perfil}` },
        { eje: 'y', inicio: 0, fin: setback, valor: setback, etiqueta: `Retranqueo ${setback}` },
        { eje: 'y', inicio: setback, fin: setback + depth, valor: depth, etiqueta: `Profundidad tira ${depth}` },
        { eje: 'z', inicio: mm(zBase - paso), fin: mm(zBase), valor: paso, etiqueta: `Paso ${paso}` },
      ];

      secciones.push({
        tipo,
        canalId,
        indice: canal.indice,
        modulo: raiz,
        descripcion: tipo === 'C'
          ? `Canal C ${canal.indice} (entre cajones)`
          : 'Canal L (bajo la repisa)',
        perfilMm: perfil,
        pasoMm: paso,
        retranqueoMm: setback,
        profundidadMm: depth,
        espesorMm: ESP_TIRA,
        pestanaAltoMm: GOLA_PESTANA_ALTO_MM,
        abertura,
        piezas,
        puntosFijacion,
        anclajeSuperior: plan.anclajeSuperior || null,
        plan,
        planTxt: resumenPlanFijacion(plan),
        cotas,
      });
    }
  }

  return secciones.sort((a, b) => a.modulo.localeCompare(b.modulo, undefined, { numeric: true }) || a.indice - b.indice);
}
