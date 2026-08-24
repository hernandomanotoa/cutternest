# topologicalSort.js — Orden topológico Kahn

## Código fuente completo

Archivo: `frontend/public/assembly-planner/js/topologicalSort.js`

```javascript
// topologicalSort.js — Kahn's algorithm, detección de ciclos y niveles

export function buildAdjacency(nodes, edges) {
  const adj = {};
  const indeg = {};
  nodes.forEach((n) => {
    adj[n] = [];
    indeg[n] = 0;
  });
  edges.forEach(({ from, to }) => {
    if (adj[from] && indeg[to] !== undefined) {
      adj[from].push(to);
      indeg[to]++;
    }
  });
  return { adj, indeg };
}

export function detectCycle(nodes, edges) {
  const { adj, indeg } = buildAdjacency(nodes, edges);
  const queue = [];
  nodes.forEach((n) => {
    if (indeg[n] === 0) queue.push(n);
  });

  const removed = new Set();
  while (queue.length > 0) {
    const u = queue.shift();
    removed.add(u);
    adj[u].forEach((v) => {
      indeg[v]--;
      if (indeg[v] === 0) queue.push(v);
    });
  }

  const cycleNodes = nodes.filter((n) => !removed.has(n));
  if (cycleNodes.length === 0) return null;

  // Devolver un ciclo concreto
  const inCycle = new Set(cycleNodes);
  const visited = new Set();
  for (const start of cycleNodes) {
    if (visited.has(start)) continue;
    const stack = [start];
    const path = [start];
    visited.add(start);

    while (stack.length > 0) {
      const u = stack[stack.length - 1];
      let advanced = false;
      for (const v of adj[u]) {
        if (!inCycle.has(v)) continue;
        const idx = path.indexOf(v);
        if (idx >= 0) return path.slice(idx);
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
          path.push(v);
          advanced = true;
          break;
        }
      }
      if (!advanced) {
        stack.pop();
        path.pop();
      }
    }
  }

  return cycleNodes;
}

export function topologicalLevels(nodes, edges) {
  const { adj, indeg } = buildAdjacency(nodes, edges);
  const queue = [];
  const nodeLevel = {};
  nodes.forEach((n) => {
    if (indeg[n] === 0) {
      queue.push(n);
      nodeLevel[n] = 1;
    }
  });

  const sorted = [];
  while (queue.length > 0) {
    const levelNodes = [...queue];
    queue.length = 0;
    levelNodes.forEach((u) => {
      sorted.push({ id: u, level: nodeLevel[u] });
      adj[u].forEach((v) => {
        indeg[v]--;
        if (indeg[v] === 0) {
          queue.push(v);
          nodeLevel[v] = nodeLevel[u] + 1;
        }
      });
    });
  }

  if (sorted.length !== nodes.length) {
    return { ok: false, levels: [], sorted: [], cycle: detectCycle(nodes, edges) };
  }

  const maxLevel = Math.max(...sorted.map((o) => o.level), 0);
  const levels = [];
  for (let l = 1; l <= maxLevel; l++) {
    levels.push(sorted.filter((o) => o.level === l).map((o) => o.id));
  }

  return { ok: true, levels, sorted, cycle: null };
}

export function buildSteps(nodes, edges, piecesById) {
  const result = topologicalLevels(nodes, edges);
  if (!result.ok) return { ok: false, cycle: result.cycle, steps: [] };

  const steps = result.levels.map((level, idx) => ({
    paso: idx + 1,
    piezas: level,
    paralelo: level.length > 1,
    tiempo: estimateTime(level, piecesById),
  }));

  return { ok: true, steps, totalPasos: steps.length, totalPiezas: nodes.length };
}

function estimateTime(ids, piecesById) {
  if (ids.length === 0) return 0;
  let base = 5; // minutos de preparación
  ids.forEach((id) => {
    const p = piecesById[id];
    if (!p) return;
    const name = p.nombre.toLowerCase();
    if (name.includes('lateral')) base += 10;
    else if (name.includes('base') || name.includes('tapa')) base += 12;
    else if (name.includes('fondo')) base += 8;
    else if (name.includes('repisa') || name.includes('estante')) base += 6;
    else if (name.includes('puerta')) base += 15;
    else if (name.includes('cajon')) base += 10;
    else base += 5;
  });
  return Math.round(base);
}

```
