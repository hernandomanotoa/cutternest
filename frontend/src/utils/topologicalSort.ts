export interface TopologicalResult {
  levels: string[][];
  cycle?: string[] | null;
  sorted: string[];
}

function buildAdjacency(nodes: string[], edges: Array<[string, string]>) {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const node of nodes) {
    adj.set(node, []);
    indeg.set(node, 0);
  }
  for (const [from, to] of edges) {
    if (!adj.has(from) || !indeg.has(to)) {
      continue;
    }
    adj.get(from)!.push(to);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
  }
  return { adj, indeg };
}

export function detectCycle(
  nodes: string[],
  edges: Array<[string, string]>
): string[] | null {
  const { adj, indeg } = buildAdjacency(nodes, edges);
  const queue: string[] = [];
  for (const [node, degree] of indeg) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  const sorted = new Set<string>();
  while (queue.length > 0) {
    const u = queue.shift()!;
    sorted.add(u);
    for (const v of adj.get(u) ?? []) {
      const next = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, next);
      if (next === 0) {
        queue.push(v);
      }
    }
  }

  const remaining = nodes.filter((n) => !sorted.has(n));
  if (remaining.length === 0) {
    return null;
  }

  const inRemaining = new Set(remaining);
  const visited = new Set<string>();

  for (const start of remaining) {
    if (visited.has(start)) {
      continue;
    }
    const stack: string[] = [start];
    const path: string[] = [start];
    visited.add(start);

    while (stack.length > 0) {
      const u = stack[stack.length - 1];
      const neighbors = adj.get(u) ?? [];
      let advanced = false;

      for (const v of neighbors) {
        if (!inRemaining.has(v)) {
          continue;
        }
        const cycleIndex = path.indexOf(v);
        if (cycleIndex >= 0) {
          return path.slice(cycleIndex);
        }
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

  return remaining;
}

export function topologicalLevels(
  nodes: string[],
  edges: Array<[string, string]>
): TopologicalResult {
  const { adj, indeg } = buildAdjacency(nodes, edges);
  const queue: string[] = [];
  for (const [node, degree] of indeg) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  const sorted: string[] = [];
  const levels: string[][] = [];

  while (queue.length > 0) {
    const level = [...queue];
    levels.push(level);
    const next: string[] = [];
    for (const u of level) {
      sorted.push(u);
      for (const v of adj.get(u) ?? []) {
        const updated = (indeg.get(v) ?? 0) - 1;
        indeg.set(v, updated);
        if (updated === 0) {
          next.push(v);
        }
      }
    }
    queue.length = 0;
    queue.push(...next);
  }

  if (sorted.length !== nodes.length) {
    return { levels: [], sorted: [], cycle: detectCycle(nodes, edges) };
  }

  return { levels, sorted };
}
