/**
 * test_isometric_examples.mjs
 *
 * Renderiza todos los ejemplos CSV con la vista isométrica, guarda los SVGs
 * en un directorio temporal y valida que el viewBox contenga todas las piezas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseCSV } from '../js/csvParser.js';
import { IsometricRenderer } from '../js/isometricRenderer.js';

const OUT_DIR = '/tmp/iso-tests';
const SCALE = 0.06;
const PADDING = 80;

function getRootModules(pieces) {
  const ids = new Set(pieces.map((p) => String(p.modulo || '1').split('.')[0]));
  return [...ids].sort();
}

function validateSvg(svg, label) {
  const errors = [];
  const warnings = [];

  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  if (!vbMatch) {
    errors.push(`${label}: no tiene viewBox`);
    return { ok: false, errors, warnings };
  }
  const vb = vbMatch[1].split(/\s+/).map(Number);
  const [vbx, vby, vbw, vbh] = vb;

  const polygons = [];
  const polyMatches = svg.matchAll(/<polygon points="([^"]+)"/g);
  for (const m of polyMatches) {
    const pts = m[1].split(' ').filter(Boolean).map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });
    polygons.push(pts);
  }

  if (!polygons.length) {
    errors.push(`${label}: no tiene polígonos`);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  polygons.forEach((pts) => {
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  if (minX < vbx - 1 || minY < vby - 1 || maxX > vbx + vbw + 1 || maxY > vby + vbh + 1) {
    errors.push(
      `${label}: viewBox ${vbMatch[1]} no contiene todas las coordenadas. Extremos: (${minX.toFixed(1)}, ${minY.toFixed(1)}) - (${maxX.toFixed(1)}, ${maxY.toFixed(1)})`
    );
  }

  if (minX < 0 || minY < 0) {
    warnings.push(`${label}: coordenadas negativas detectadas antes del origen (puede ser correcto si viewBox las cubre)`);
  }

  // Verificar polígonos degenerados (área ~0)
  let degenerate = 0;
  polygons.forEach((pts) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    if (Math.abs(area) < 0.5) degenerate++;
  });
  if (degenerate) {
    warnings.push(`${label}: ${degenerate} polígono(s) con área casi nula`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    polygonCount: polygons.length,
    viewBox: vbMatch[1],
  };
}

function renderModule(csvName, moduleId, pieces, isoFlip) {
  const label = `${csvName}-M${moduleId}${isoFlip ? '-flipped' : ''}`;
  const container = {
    innerHTML: '',
    set innerHTML(v) {
      this.innerHTML = v;
    },
    get innerHTML() {
      return this._innerHTML;
    },
  };
  Object.defineProperty(container, 'innerHTML', {
    set(v) {
      this._innerHTML = v;
    },
    get() {
      return this._innerHTML;
    },
  });

  const renderer = new IsometricRenderer(container, {
    scale: SCALE,
    padding: PADDING,
    showAxes: false,
    showDimensions: false,
    drawerGap: 30,
    doorAngle: 0,
    isoFlip,
    labelMode: 'none',
  });

  renderer.render(moduleId, pieces, []);
  const svg = container.innerHTML;

  const fileName = `${label}.svg`;
  const filePath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(filePath, svg);

  const result = validateSvg(svg, label);
  return { ...result, filePath, fileName };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const dataDir = path.resolve(process.cwd(), 'data');
  const csvFiles = fs
    .readdirSync(dataDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort();

  const allResults = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of csvFiles) {
    const filePath = path.join(dataDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = parseCSV(text);

    if (!parsed.ok) {
      console.log(`\n⚠️  ${file}: parse error, skipped`);
      parsed.errors.forEach((e) => console.log('   ', e));
      continue;
    }

    const roots = getRootModules(parsed.pieces);
    console.log(`\n📁 ${file} — ${parsed.pieces.length} piezas — módulos: ${roots.join(', ')}`);

    for (const mod of roots) {
      for (const flip of [false, true]) {
        try {
          const result = renderModule(file.replace(/\.csv$/i, ''), mod, parsed.pieces, flip);
          allResults.push(result);
          totalErrors += result.errors.length;
          totalWarnings += result.warnings.length;
          const status = result.ok ? '✅' : '❌';
          console.log(
            `   ${status} ${result.fileName} — viewBox=${result.viewBox}, polígonos=${result.polygonCount}, errores=${result.errors.length}, warnings=${result.warnings.length}`
          );
          result.errors.forEach((e) => console.log(`      ❌ ${e}`));
          result.warnings.forEach((w) => console.log(`      ⚠️  ${w}`));
        } catch (err) {
          console.log(`   ❌ ${file} M${mod} flip=${flip} — excepción: ${err.message}`);
          console.error(err);
        }
      }
    }
  }

  // Generar índice HTML
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Test isométricos — CutterNest</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f1f5f9; padding: 20px; }
    h1 { font-size: 1.5rem; }
    .summary { background: #1e293b; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .card { background: #1e293b; border-radius: 8px; padding: 10px; }
    .card h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
    .card svg { width: 100%; height: auto; border: 1px solid #334155; border-radius: 4px; background: #0f172a; }
    .card .meta { font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; }
    .error { color: #f87171; }
    .warning { color: #fbbf24; }
  </style>
</head>
<body>
  <h1>Test isométricos</h1>
  <div class="summary">
    <strong>Total ejemplos renderizados:</strong> ${allResults.length}<br>
    <strong>Errores:</strong> ${totalErrors}<br>
    <strong>Warnings:</strong> ${totalWarnings}
  </div>
  <div class="grid">
    ${allResults
      .map(
        (r) => `
      <div class="card">
        <h3>${r.fileName}</h3>
        ${fs.readFileSync(r.filePath, 'utf8')}
        <div class="meta">
          viewBox: ${r.viewBox} — polígonos: ${r.polygonCount}
          ${r.errors.length ? `<div class="error">${r.errors.join('<br>')}</div>` : ''}
          ${r.warnings.length ? `<div class="warning">${r.warnings.join('<br>')}</div>` : ''}
        </div>
      </div>`
      )
      .join('\n')}
  </div>
</body>
</html>`;

  const indexPath = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(indexPath, html);

  console.log(`\n📝 Resultados guardados en: ${OUT_DIR}`);
  console.log(`🌐 Abre este archivo en el navegador: ${indexPath}`);
  console.log(`\nResumen final: ${allResults.length} SVGs, ${totalErrors} errores, ${totalWarnings} warnings.`);

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

main();
