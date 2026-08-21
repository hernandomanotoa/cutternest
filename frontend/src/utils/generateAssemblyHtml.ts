import type { AssemblyResponse, AssemblyStep } from '../types';

function escapeHtml(text: string | number | undefined | null): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString('es-EC', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderStepRow(step: AssemblyStep, index: number): string {
  const pieces = step.piezas_3d.map((p) => p.id).join(', ') || '—';
  const connectors = step.conectores.map((c) => c.tipo).join(', ') || '—';
  const tools = step.herramientas.join(', ') || '—';
  const prereq = step.dependencies.join(', ') || '—';

  return `
    <tr class="border-b border-slate-200">
      <td class="px-4 py-3 text-sm text-slate-700">${index + 1}</td>
      <td class="px-4 py-3 text-sm font-medium text-slate-900">${escapeHtml(step.titulo)}</td>
      <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(pieces)}</td>
      <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(connectors)}</td>
      <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(tools)}</td>
      <td class="px-4 py-3 text-sm text-slate-700">${step.tiempo_estimado_min} min</td>
      <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(prereq)}</td>
    </tr>
  `;
}

function renderLevelTimeline(levels: string[][]): string {
  return levels
    .map(
      (level, index) => `
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-2 text-sm font-semibold text-slate-800">Nivel ${index + 1}</h3>
        <div class="flex flex-wrap gap-2">
          ${level
            .map(
              (id) => `
            <span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              ${escapeHtml(id)}
            </span>
          `
            )
            .join('')}
        </div>
      </div>
    `
    )
    .join('');
}

function renderDependencyGraph(response: AssemblyResponse, levels?: string[][]): string {
  const pieces = response.vista_completa || [];
  if (pieces.length === 0) return '';

  const graphLevels = levels && levels.length > 0 ? levels : response.levels || [];

  const levelHeight = 80;
  const boxWidth = 80;
  const boxHeight = 40;
  const gapX = 24;
  const gapY = 48;
  const maxCount = Math.max(1, ...graphLevels.map((l) => l.length));
  const width = Math.max(600, maxCount * (boxWidth + gapX) + 80);
  const height = Math.max(200, graphLevels.length * (boxHeight + levelHeight) + 80);

  let svg = `<svg viewBox="0 0 ${width} ${height}" class="h-auto w-full rounded-lg border border-slate-200 bg-white" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" class="fill-slate-500" /></marker></defs>`;

  const positions: Record<string, { x: number; y: number }> = {};

  graphLevels.forEach((level, li) => {
    const count = level.length;
    const totalW = count * boxWidth + (count - 1) * gapX;
    const startX = (width - totalW) / 2;
    const y = 40 + li * (boxHeight + gapY);

    level.forEach((id, i) => {
      const x = startX + i * (boxWidth + gapX);
      positions[id] = { x, y };
      const piece = pieces.find((p) => p.id === id);
      svg += `
        <g>
          ${piece
            ? `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="${escapeHtml(piece.color)}" class="stroke-slate-600" stroke-width="2" />`
            : `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" class="fill-slate-400 stroke-slate-600" stroke-width="2" />`
          }
          <text x="${x + boxWidth / 2}" y="${y + boxHeight / 2 + 4}" text-anchor="middle" class="fill-white text-xs font-semibold">${escapeHtml(id)}</text>
        </g>
      `;
    });

    if (li < graphLevels.length - 1) {
      const nextLevel = graphLevels[li + 1];
      level.forEach((fromId) => {
        nextLevel.forEach((toId) => {
          const from = positions[fromId];
          const to = positions[toId];
          if (!from || !to) return;
          const x1 = from.x + boxWidth / 2;
          const y1 = from.y + boxHeight;
          const x2 = to.x + boxWidth / 2;
          const y2 = to.y;
          svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="stroke-slate-500" stroke-width="2" marker-end="url(#arr)" />`;
        });
      });
    }
  });

  svg += '</svg>';
  return svg;
}

export function generateAssemblyHtml(response: AssemblyResponse, levels?: string[][]): string {
  const steps = response.pasos || [];
  const pieces = response.vista_completa || [];
  const connectors = response.conectores_completos || [];
  const totalTime = steps.reduce((sum, s) => sum + s.tiempo_estimado_min, 0);
  const title = response.pasos[0]?.titulo
    ? `Manual: ${response.pasos[0].titulo}`
    : 'Manual de ensamblaje';

  const levelTimeline =
    levels && levels.length > 0
      ? renderLevelTimeline(levels)
      : response.levels && response.levels.length > 0
        ? renderLevelTimeline(response.levels)
        : '<p class="text-sm text-slate-600">No hay niveles definidos.</p>';

  const rows = steps.map((step, i) => renderStepRow(step, i)).join('');
  const graph = renderDependencyGraph(response, levels);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print {
      .no-print { display: none; }
      body { background: white; }
    }
  </style>
</head>
<body class="min-h-screen bg-slate-50 p-6 text-slate-900">
  <div class="mx-auto max-w-5xl space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <header class="space-y-1 border-b border-slate-200 pb-6">
      <h1 class="text-2xl font-bold text-slate-900">${escapeHtml(title)}</h1>
      <p class="text-sm text-slate-500">Generado el ${formatDate()}</p>
    </header>

    <section>
      <h2 class="mb-3 text-lg font-semibold text-slate-800">Resumen</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs uppercase text-slate-500">Pasos</p>
          <p class="text-2xl font-bold text-slate-900">${steps.length}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs uppercase text-slate-500">Piezas</p>
          <p class="text-2xl font-bold text-slate-900">${pieces.length}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs uppercase text-slate-500">Conectores</p>
          <p class="text-2xl font-bold text-slate-900">${connectors.length}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs uppercase text-slate-500">Tiempo total</p>
          <p class="text-2xl font-bold text-slate-900">${totalTime} min</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 text-lg font-semibold text-slate-800">Línea de niveles</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${levelTimeline}
      </div>
    </section>

    <section>
      <h2 class="mb-3 text-lg font-semibold text-slate-800">Grafo de dependencias</h2>
      ${graph || '<p class="text-sm text-slate-600">No hay piezas para graficar.</p>'}
    </section>

    <section>
      <h2 class="mb-3 text-lg font-semibold text-slate-800">Pasos detallados</h2>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="w-full text-left">
          <thead class="bg-slate-100">
            <tr>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">#</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Título</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Piezas</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Conectores</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Herramientas</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Tiempo</th>
              <th class="px-4 py-3 text-xs font-semibold uppercase text-slate-600">Prerrequisitos</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</body>
</html>`;
}
