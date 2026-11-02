// src/utils/texturasMadera.ts — Texturas procedurales de melamina con veta
// para el configurador 3D (Three.js). Todo se genera en runtime con Canvas
// 2D: sin archivos de imagen ni URLs externas. La veta respeta la dirección
// por tipo de pieza (costados verticales; repisas/frentes horizontales) y la
// escala es real (MM_POR_TILE mm por tile de textura).
//
// Determinismo: el generador pseudoaleatorio (mulberry32) se siembra con
// `semilla`; la misma semilla produce exactamente la misma textura en cada
// recarga. Al cambiar de acabado se liberan texturas y materiales anteriores
// (liberarMaterial) para no fugar memoria GPU.

import * as THREE from 'three';

// ── Paleta de acabados comerciales ────────────────────────────────────────
// Agregar un acabado = agregar una entrada aquí (y nada más).
export interface AcabadoMadera {
  nombre: string;
  colorBase: string;
  colorVeta: string;
  colorPoros: string;
  /** multiplicador del alpha de las vetas (0.5–1.5) */
  intensidad: number;
  roughness: number;
}

export const ACABADOS: Record<string, AcabadoMadera> = {
  roble: { nombre: 'Roble Claro', colorBase: '#c9a876', colorVeta: '#9c7a4e', colorPoros: '#8a6a42', intensidad: 1.0, roughness: 0.65 },
  nogal: { nombre: 'Nogal', colorBase: '#7a5a3a', colorVeta: '#4e3520', colorPoros: '#3e2a18', intensidad: 1.1, roughness: 0.60 },
  wengue: { nombre: 'Wengué', colorBase: '#4a3325', colorVeta: '#2b1c11', colorPoros: '#201409', intensidad: 1.2, roughness: 0.55 },
  caoba: { nombre: 'Caoba', colorBase: '#8a4a32', colorVeta: '#5a2c1c', colorPoros: '#482218', intensidad: 1.0, roughness: 0.60 },
  blanco: { nombre: 'Blanco Liso', colorBase: '#f2f0ec', colorVeta: '#dcd8d0', colorPoros: '#cfccc4', intensidad: 0.3, roughness: 0.80 },
  grafito: { nombre: 'Gris Grafito', colorBase: '#5a5a5e', colorVeta: '#3c3c40', colorPoros: '#323236', intensidad: 0.5, roughness: 0.75 },
  negro: { nombre: 'Negro Mate', colorBase: '#26262a', colorVeta: '#101012', colorPoros: '#0a0a0c', intensidad: 0.6, roughness: 0.85 },
};

export function getAcabado(nombre: string | null | undefined): AcabadoMadera | null {
  if (!nombre) return null;
  return ACABADOS[nombre] ?? Object.values(ACABADOS).find((a) => a.nombre === nombre) ?? null;
}

// ── Escala real ────────────────────────────────────────────────────────────
/** mm reales que cubre un tile de textura (repetición). */
export const MM_POR_TILE = 600;

export function calcularRepeat(anchoMm: number, altoMm: number): { x: number; y: number } {
  return { x: Math.max(anchoMm / MM_POR_TILE, 0.01), y: Math.max(altoMm / MM_POR_TILE, 0.01) };
}

// ── Generador pseudoaleatorio con semilla (mulberry32) ────────────────────
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' + alpha → 'rgba(r,g,b,a)'. */
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const rango = (rng: () => number, min: number, max: number) => min + rng() * (max - min);
const entero = (rng: () => number, min: number, max: number) => Math.floor(rango(rng, min, max + 1));

export type DireccionVeta = 'vertical' | 'horizontal';

export interface BandaTonal {
  /** centro de la banda en el eje transversal a la veta (0..1) */
  v: number;
  ancho: number;
  alpha: number;
  /** 1 = más claro que la base, -1 = más oscuro */
  signo: 1 | -1;
}

export interface VetaFina {
  /** posición base en el eje transversal (0..1) */
  v: number;
  amplitud1: number;
  frecuencia1: number;
  fase1: number;
  amplitud2: number;
  frecuencia2: number;
  fase2: number;
  grosor: number;
  alpha: number;
}

export interface Poro {
  /** centro (u a lo largo de la veta, v transversal), 0..1 */
  u: number;
  v: number;
  largo: number;
  alpha: number;
}

export interface ParametrosVeta {
  bandas: BandaTonal[];
  vetas: VetaFina[];
  poros: Poro[];
}

/**
 * Parámetros deterministas de la textura (bandas, vetas, poros) para una
 * semilla, dirección y acabado. Puro y testeable: `crearTexturaMadera` solo
 * lo dibuja. Rangos (spec): 6–10 bandas (alpha 0.04–0.10), 80–100 vetas
 * (amplitud 2–11 px, frecuencia 0.004–0.019, grosor 0.4–2, alpha 0.05–0.19),
 * 300–400 poros (largo 2–10 px en un canvas de 512, alpha 0.05–0.15).
 */
export function generarParametrosVeta(
  semilla: number,
  _direccion: DireccionVeta,
  acabado: AcabadoMadera,
  tamanoPx = 512,
): ParametrosVeta {
  const rng = mulberry32(semilla);
  const bandas: BandaTonal[] = [];
  for (let i = 0; i < entero(rng, 6, 10); i += 1) {
    bandas.push({
      v: rng(),
      ancho: rango(rng, 0.06, 0.22),
      alpha: rango(rng, 0.04, 0.1),
      signo: rng() < 0.5 ? 1 : -1,
    });
  }
  const vetas: VetaFina[] = [];
  for (let i = 0; i < entero(rng, 80, 100); i += 1) {
    vetas.push({
      v: rng(),
      amplitud1: rango(rng, 2, 11),
      frecuencia1: rango(rng, 0.004, 0.019),
      fase1: rango(rng, 0, Math.PI * 2),
      amplitud2: rango(rng, 2, 7),
      frecuencia2: rango(rng, 0.004, 0.019),
      fase2: rango(rng, 0, Math.PI * 2),
      grosor: rango(rng, 0.4, 2),
      alpha: rango(rng, 0.05, 0.19) * acabado.intensidad,
    });
  }
  const poros: Poro[] = [];
  for (let i = 0; i < entero(rng, 300, 400); i += 1) {
    poros.push({
      u: rng(),
      v: rng(),
      largo: rango(rng, 2, 10) / tamanoPx,
      alpha: rango(rng, 0.05, 0.15),
    });
  }
  return { bandas, vetas, poros };
}

// ── Dirección de veta por tipo de pieza ───────────────────────────────────
// Costados/laterales/puertas → vertical; repisas, fondos, zócalo, tapas y
// frentes de cajón/zapatera → horizontal (a lo ancho).
export function direccionVetaPieza(pieza: { nombre?: string; id?: string }): DireccionVeta {
  const texto = `${pieza.nombre ?? ''} ${pieza.id ?? ''}`.toLowerCase();
  if (/(lateral|costado|montante|puerta)/.test(texto)) return 'vertical';
  return 'horizontal';
}

// ── Dibujo en canvas ──────────────────────────────────────────────────────
export interface OpcionesTextura {
  acabado: string;
  direccion?: DireccionVeta;
  tamanoPx?: number;
  semilla?: number;
}

export const SEMILLA_DEFAULT = 20261102;

/**
 * Dibuja la textura de melamina en un canvas offscreen y lo devuelve.
 * En entornos sin Canvas 2D (tests jsdom) devuelve el canvas en blanco sin
 * lanzar: el pipeline completo se ejercita en el navegador.
 */
export function crearTexturaMadera(opciones: OpcionesTextura): HTMLCanvasElement {
  const acabado = getAcabado(opciones.acabado);
  const tamano = opciones.tamanoPx ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = tamano;
  canvas.height = tamano;
  if (!acabado) return canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const direccion: DireccionVeta = opciones.direccion ?? 'horizontal';
  const semilla = opciones.semilla ?? SEMILLA_DEFAULT;
  const { bandas, vetas, poros } = generarParametrosVeta(semilla, direccion, acabado, tamano);

  // Mapa (u,v) en coordenadas de veta → (x,y) de pantalla: la veta corre a
  // lo largo de u. Vertical: u=baja→y, v→x. Horizontal: u→x, v→y.
  const px = (u: number, v: number): [number, number] =>
    direccion === 'vertical' ? [v * tamano, u * tamano] : [u * tamano, v * tamano];

  // Fondo: color base del acabado.
  ctx.fillStyle = acabado.colorBase;
  ctx.fillRect(0, 0, tamano, tamano);

  // Bandas amplias de tonalidad suave (gradientes alpha 0.04–0.10).
  for (const b of bandas) {
    const centro = b.v * tamano;
    const ancho = b.ancho * tamano;
    const claro = b.signo > 0;
    const g = direccion === 'vertical' ? ctx.createLinearGradient(centro - ancho, 0, centro + ancho, 0)
      : ctx.createLinearGradient(0, centro - ancho, 0, centro + ancho);
    const color = claro ? '#ffffff' : '#000000';
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(0.5, hexA(color, b.alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    if (direccion === 'vertical') ctx.fillRect(centro - ancho, 0, ancho * 2, tamano);
    else ctx.fillRect(0, centro - ancho, tamano, ancho * 2);
  }

  // Vetas finas onduladas: desplazamiento sinusoidal doble a lo largo de u.
  ctx.strokeStyle = acabado.colorVeta;
  const paso = 2;
  for (const v of vetas) {
    ctx.globalAlpha = Math.min(v.alpha, 0.35);
    ctx.lineWidth = v.grosor;
    ctx.beginPath();
    for (let u = 0; u <= tamano; u += paso) {
      const desplaz =
        v.amplitud1 * Math.sin(u * v.frecuencia1 + v.fase1) +
        v.amplitud2 * Math.sin(u * v.frecuencia2 + v.fase2);
      const transversal = (v.v * tamano + desplaz) / tamano;
      const [x, y] = px(u / tamano, transversal);
      if (u === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Poros alargados (1 px de ancho × 2–10 px de largo) orientados según la veta.
  ctx.strokeStyle = acabado.colorPoros;
  for (const p of poros) {
    ctx.globalAlpha = p.alpha;
    const largo = p.largo * tamano;
    const [x, y] = px(p.u, p.v);
    ctx.beginPath();
    if (direccion === 'vertical') {
      ctx.moveTo(x, y - largo / 2);
      ctx.lineTo(x, y + largo / 2);
    } else {
      ctx.moveTo(x - largo / 2, y);
      ctx.lineTo(x + largo / 2, y);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

// ── Integración Three.js ──────────────────────────────────────────────────
export interface MaterialMadera extends THREE.MeshStandardMaterial {
  userData: { texturaMadera: THREE.CanvasTexture; acabado: string; direccion: DireccionVeta };
}

/**
 * Canvas → MeshStandardMaterial: RepeatWrapping, SRGB, anisotropy máxima del
 * renderer, roughness del acabado y metalness 0.
 */
export function materialMadera(
  renderer: THREE.WebGLRenderer,
  acabadoNombre: string,
  direccion: DireccionVeta,
  repetirX: number,
  repetirY: number,
  semilla: number = SEMILLA_DEFAULT,
): MaterialMadera {
  const acabado = getAcabado(acabadoNombre);
  const canvas = crearTexturaMadera({ acabado: acabadoNombre, direccion, semilla });
  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.repeat.set(repetirX, repetirY);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshStandardMaterial({
    map: textura,
    roughness: acabado?.roughness ?? 0.7,
    metalness: 0,
  }) as MaterialMadera;
  material.userData = { texturaMadera: textura, acabado: acabadoNombre, direccion };
  return material;
}

/** Material + dirección para una pieza con medidas reales (mm). */
export function materialMaderaParaPieza(
  renderer: THREE.WebGLRenderer,
  pieza: { nombre?: string; id?: string; ancho: number; alto: number },
  acabadoNombre: string,
  semilla: number = SEMILLA_DEFAULT,
): MaterialMadera {
  const direccion = direccionVetaPieza(pieza);
  const repeat = calcularRepeat(pieza.ancho, pieza.alto);
  return materialMadera(renderer, acabadoNombre, direccion, repeat.x, repeat.y, semilla);
}

/** Libera la textura y el material (fuga de memoria GPU al cambiar acabado). */
export function liberarMaterial(material: THREE.Material | null | undefined): void {
  if (!material) return;
  const map = (material as Partial<MaterialMadera>).userData?.texturaMadera
    ?? (material as THREE.MeshStandardMaterial).map;
  if (map) map.dispose();
  material.dispose();
}

/**
 * Aplica un acabado a todas las mallas de un grupo (escena Three.js
 * imperativa): dirección de veta por tipo de pieza y repeat según el tamaño
 * real de cada caja (spec, paso 4). Devuelve cuántas mallas se acabaron.
 * Los materiales anteriores de las mallas se liberan.
 */
export function aplicarAcabado(
  grupo: THREE.Object3D,
  nombreAcabado: string,
  renderer?: THREE.WebGLRenderer,
  semilla: number = SEMILLA_DEFAULT,
): number {
  if (!getAcabado(nombreAcabado)) return 0;
  const anisotropyFallback = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  let count = 0;
  grupo.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BoxGeometry;
    if (!geo?.parameters) return;
    const { width, height } = geo.parameters;
    const anterior = mesh.material as THREE.Material | THREE.Material[];
    const material = materialMadera(
      renderer ?? ({ capabilities: { getMaxAnisotropy: () => anisotropyFallback } } as THREE.WebGLRenderer),
      nombreAcabado,
      direccionVetaPieza({ nombre: mesh.name, id: mesh.name }),
      calcularRepeat(width, height).x,
      calcularRepeat(width, height).y,
      semilla,
    );
    if (Array.isArray(anterior)) anterior.forEach((m) => liberarMaterial(m));
    else liberarMaterial(anterior);
    mesh.material = material;
    count += 1;
  });
  return count;
}
