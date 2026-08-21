import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCcw, Save, Play, FileText, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { topologicalLevels, detectCycle } from '../../utils/topologicalSort';
import type { AssemblyPiece3D } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Separator } from '../ui/Separator';

export interface AssemblyPlannerProps {
  pieces: AssemblyPiece3D[];
  dependencies: Array<[string, string]>;
  levels?: string[][];
  onChange: (dependencies: Array<[string, string]>) => void;
  onSave?: (dependencies: Array<[string, string]>) => void;
  onSimulate?: (levelIndex: number) => void;
  onExportHtml?: () => void;
  onExportPdf?: () => void;
  readOnly?: boolean;
}

const NODE_RADIUS = 28;
const HORIZONTAL_GAP = 40;
const VERTICAL_GAP = 100;
const PADDING = 60;

type Point = { x: number; y: number };

function edgeKey(from: string, to: string) {
  return `${from}->${to}`;
}

function computeLayout(
  pieceIds: string[],
  levels?: string[][]
): Record<string, Point> {
  const layout: Record<string, Point> = {};

  if (!levels || levels.length === 0) {
    const count = pieceIds.length || 1;
    const width = Math.max(400, count * (NODE_RADIUS * 2 + HORIZONTAL_GAP) + PADDING);
    pieceIds.forEach((id, index) => {
      layout[id] = {
        x: width / 2 - ((count - 1) * (NODE_RADIUS * 2 + HORIZONTAL_GAP)) / 2 + index * (NODE_RADIUS * 2 + HORIZONTAL_GAP),
        y: NODE_RADIUS + PADDING,
      };
    });
    return layout;
  }

  const maxCount = Math.max(1, ...levels.map((l) => l.length));
  const columnWidth = NODE_RADIUS * 2 + HORIZONTAL_GAP;
  const width = Math.max(400, maxCount * columnWidth + PADDING);

  levels.forEach((level, levelIndex) => {
    const count = level.length || 1;
    const totalWidth = (count - 1) * columnWidth;
    level.forEach((id, index) => {
      layout[id] = {
        x: width / 2 - totalWidth / 2 + index * columnWidth,
        y: NODE_RADIUS + PADDING + levelIndex * (NODE_RADIUS * 2 + VERTICAL_GAP),
      };
    });
  });

  return layout;
}

function computeViewBoxSize(levels?: string[][]) {
  if (!levels || levels.length === 0) {
    return { width: 400, height: 200 };
  }
  const maxCount = Math.max(1, ...levels.map((l) => l.length));
  const width = Math.max(400, maxCount * (NODE_RADIUS * 2 + HORIZONTAL_GAP) + PADDING);
  const height = Math.max(200, levels.length * (NODE_RADIUS * 2 + VERTICAL_GAP) + PADDING);
  return { width, height };
}

function getSvgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): Point {
  if (!svg || typeof svg.getScreenCTM !== 'function') {
    return { x: clientX, y: clientY };
  }
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: clientX, y: clientY };
  }
  const point = svg.ownerSVGElement?.createSVGPoint?.() ?? svg.createSVGPoint?.();
  if (!point) {
    return { x: clientX, y: clientY };
  }
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

export function AssemblyPlanner({
  pieces,
  dependencies,
  levels,
  onChange,
  onSave,
  onSimulate,
  onExportHtml,
  onExportPdf,
  readOnly = false,
}: AssemblyPlannerProps) {
  const nodeIds = useMemo(() => pieces.map((p) => p.id), [pieces]);
  const pieceById = useMemo(() => {
    const map = new Map<string, AssemblyPiece3D>();
    for (const p of pieces) {
      map.set(p.id, p);
    }
    return map;
  }, [pieces]);

  const [edges, setEdges] = useState<Array<[string, string]>>(() => [...dependencies]);
  const [positions, setPositions] = useState<Record<string, Point>>(() =>
    computeLayout(nodeIds, levels)
  );
  const [draggedNodes, setDraggedNodes] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<
    | { type: 'node'; id: string; offset: Point }
    | { type: 'pan'; start: Point; startPan: Point }
    | null
  >(null);
  const [cycle, setCycle] = useState<string[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const levelsRef = useRef<string[][] | undefined>(levels);

  const viewBox = useMemo(() => computeViewBoxSize(levels), [levels]);

  useEffect(() => {
    if (!levels || levels === levelsRef.current) {
      return;
    }
    levelsRef.current = levels;
    if (draggedNodes.size === 0) {
      setPositions(computeLayout(nodeIds, levels));
    }
  }, [levels, nodeIds, draggedNodes.size]);

  useEffect(() => {
    setCycle(detectCycle(nodeIds, edges));
  }, [edges, nodeIds]);

  const incoming = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const id of nodeIds) {
      map.set(id, []);
    }
    for (const [from, to] of edges) {
      map.get(to)?.push(from);
    }
    return map;
  }, [edges, nodeIds]);

  const outgoing = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const id of nodeIds) {
      map.set(id, []);
    }
    for (const [from, to] of edges) {
      map.get(from)?.push(to);
    }
    return map;
  }, [edges, nodeIds]);

  const currentLevels = useMemo(() => topologicalLevels(nodeIds, edges).levels, [edges, nodeIds]);

  const selectedLevel = useMemo(() => {
    if (!selectedId) return 0;
    for (let i = 0; i < currentLevels.length; i++) {
      if (currentLevels[i].includes(selectedId)) {
        return i;
      }
    }
    return 0;
  }, [currentLevels, selectedId]);

  const selectedPiece = selectedId ? pieceById.get(selectedId) : null;

  const toggleEdge = useCallback(
    (from: string, to: string) => {
      if (readOnly) return;
      const exists = edges.some((e) => e[0] === from && e[1] === to);
      let next: Array<[string, string]>;
      if (exists) {
        next = edges.filter((e) => !(e[0] === from && e[1] === to));
      } else {
        const candidate: Array<[string, string]> = [...edges, [from, to] as [string, string]];
        if (detectCycle(nodeIds, candidate)) {
          setCycle(detectCycle(nodeIds, candidate));
          return;
        }
        next = candidate;
      }
      setEdges(next);
      onChange(next);
    },
    [edges, nodeIds, onChange, readOnly]
  );

  const handleNodeClick = useCallback(
    (id: string) => {
      if (readOnly) {
        setSelectedId(id);
        return;
      }
      if (selectedId === null) {
        setSelectedId(id);
      } else if (selectedId === id) {
        setSelectedId(null);
      } else {
        toggleEdge(selectedId, id);
      }
    },
    [readOnly, selectedId, toggleEdge]
  );

  const removeEdge = useCallback(
    (from: string, to: string) => {
      if (readOnly) return;
      const next = edges.filter((e) => !(e[0] === from && e[1] === to));
      setEdges(next);
      onChange(next);
    },
    [edges, onChange, readOnly]
  );

  const handleReset = useCallback(() => {
    setEdges([...dependencies]);
    setDraggedNodes(new Set());
    setPositions(computeLayout(nodeIds, levels));
    setSelectedId(null);
    onChange([...dependencies]);
  }, [dependencies, levels, nodeIds, onChange]);

  const handlePointerDownNode = useCallback(
    (e: React.PointerEvent<SVGGElement>, id: string) => {
      if (readOnly || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const svg = svgRef.current;
      if (svg && e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      const pointer = getSvgPoint(svg, e.clientX, e.clientY);
      const pos = positions[id] ?? { x: 0, y: 0 };
      setDragState({
        type: 'node',
        id,
        offset: { x: pos.x - pointer.x, y: pos.y - pointer.y },
      });
    },
    [positions, readOnly]
  );

  const handlePointerDownBackground = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (readOnly || e.button !== 0) return;
      const svg = svgRef.current;
      if (svg && e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      const pointer = getSvgPoint(svg, e.clientX, e.clientY);
      setDragState({ type: 'pan', start: pointer, startPan: { ...pan } });
    },
    [pan, readOnly]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const svg = svgRef.current;
      const pointer = getSvgPoint(svg, e.clientX, e.clientY);

      if (dragState.type === 'pan') {
        setPan({
          x: dragState.startPan.x + (pointer.x - dragState.start.x),
          y: dragState.startPan.y + (pointer.y - dragState.start.y),
        });
      } else {
        const next: Point = {
          x: pointer.x + dragState.offset.x,
          y: pointer.y + dragState.offset.y,
        };
        setPositions((prev) => ({ ...prev, [dragState.id]: next }));
        setDraggedNodes((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(dragState.id);
          return nextSet;
        });
      }
    },
    [dragState]
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      if (readOnly) return;
      const delta = e.deltaY * -0.001;
      const nextScale = Math.min(3, Math.max(0.3, scale + delta));
      const centerX = viewBox.width / 2;
      const centerY = viewBox.height / 2;
      setPan((prev) => ({
        x: centerX - (centerX - prev.x) * (nextScale / scale),
        y: centerY - (centerY - prev.y) * (nextScale / scale),
      }));
      setScale(nextScale);
    },
    [readOnly, scale, viewBox.height, viewBox.width]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const edgeMarkers = useMemo(
    () =>
      edges.map(([from, to]) => {
        const fromPos = positions[from];
        const toPos = positions[to];
        if (!fromPos || !toPos) return null;
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const start = { x: fromPos.x + ux * NODE_RADIUS, y: fromPos.y + uy * NODE_RADIUS };
        const end = { x: toPos.x - ux * NODE_RADIUS, y: toPos.y - uy * NODE_RADIUS };
        return { key: edgeKey(from, to), from, to, start, end };
      }),
    [edges, positions]
  );

  return (
    <div className='flex h-full flex-col gap-3 lg:flex-row'>
      <div className='relative min-h-[24rem] flex-1 overflow-hidden rounded-xl border bg-card'>
        <svg
          ref={svgRef}
          role='img'
          aria-label='Editor de grafo de ensamblaje'
          className='h-full w-full cursor-grab active:cursor-grabbing'
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          onPointerDown={handlePointerDownBackground}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        >
          <defs>
            <marker
              id='arrowhead'
              markerWidth='10'
              markerHeight='7'
              refX='9'
              refY='3.5'
              orient='auto'
            >
              <polygon points='0 0, 10 3.5, 0 7' className='fill-foreground' />
            </marker>
          </defs>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {edgeMarkers.map(
              (edge) =>
                edge && (
                  <g key={edge.key}>
                    <line
                      x1={edge.start.x}
                      y1={edge.start.y}
                      x2={edge.end.x}
                      y2={edge.end.y}
                      className='stroke-foreground'
                      strokeWidth={2}
                      markerEnd='url(#arrowhead)'
                      opacity={selectedId && (edge.from === selectedId || edge.to === selectedId) ? 1 : 0.6}
                    />
                  </g>
                )
            )}
            {pieces.map((piece) => {
              const pos = positions[piece.id] ?? { x: 0, y: 0 };
              const selected = selectedId === piece.id;
              return (
                <g
                  key={piece.id}
                  role='button'
                  aria-label={piece.id}
                  tabIndex={0}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onPointerDown={(e) => handlePointerDownNode(e, piece.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(piece.id);
                  }}
                  onKeyDown={(e: React.KeyboardEvent<SVGGElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNodeClick(piece.id);
                    }
                  }}
                  className={cn(
                    'cursor-pointer outline-none',
                    selected && 'ring-2 ring-primary ring-offset-2'
                  )}
                >
                  <circle
                    r={NODE_RADIUS}
                    fill={piece.color}
                    className={cn(
                      'stroke-2',
                      selected ? 'stroke-primary' : 'stroke-border'
                    )}
                  />
                  <text
                    textAnchor='middle'
                    dy='5'
                    className='fill-card-foreground text-xs font-medium'
                  >
                    {piece.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className='flex w-full shrink-0 flex-col gap-4 lg:w-80'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Plan de ensamblaje</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={handleReset}
                disabled={readOnly}
              >
                <RotateCcw className='mr-1.5 h-4 w-4' />
                Restaurar
              </Button>
              {onSave && (
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => onSave(edges)}
                  disabled={readOnly}
                >
                  <Save className='mr-1.5 h-4 w-4' />
                  Guardar plan
                </Button>
              )}
              {onSimulate && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onSimulate(selectedLevel)}
                >
                  <Play className='mr-1.5 h-4 w-4' />
                  Simular nivel
                </Button>
              )}
              {onExportHtml && (
                <Button variant='outline' size='sm' onClick={onExportHtml}>
                  <FileText className='mr-1.5 h-4 w-4' />
                  Manual HTML
                </Button>
              )}
              {onExportPdf && (
                <Button variant='outline' size='sm' onClick={onExportPdf}>
                  <FileText className='mr-1.5 h-4 w-4' />
                  Manual PDF
                </Button>
              )}
            </div>

            {selectedPiece && (
              <>
                <Separator />
                <div className='space-y-2'>
                  <div className='flex items-center gap-2'>
                    <span
                      className='h-4 w-4 rounded'
                      style={{ backgroundColor: selectedPiece.color }}
                    />
                    <span className='font-medium text-foreground'>
                      {selectedPiece.id}
                    </span>
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    {selectedPiece.nombre}
                  </p>
                  <div>
                    <span className='text-xs text-muted-foreground'>Prerrequisitos</span>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {incoming.get(selectedPiece.id)?.length ? (
                        incoming.get(selectedPiece.id)!.map((id) => (
                          <Badge key={id} variant='secondary'>
                            {id}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-xs text-muted-foreground'>Ninguno</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className='text-xs text-muted-foreground'>Dependientes</span>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {outgoing.get(selectedPiece.id)?.length ? (
                        outgoing.get(selectedPiece.id)!.map((id) => (
                          <Badge key={id} variant='secondary'>
                            {id}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-xs text-muted-foreground'>Ninguno</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div>
              <h4 className='mb-2 text-sm font-medium text-foreground'>
                Dependencias
              </h4>
              {edges.length === 0 ? (
                <p className='text-xs text-muted-foreground'>
                  No hay dependencias. Selecciona dos piezas para conectarlas.
                </p>
              ) : (
                <div className='flex flex-wrap gap-2'>
                  {edges.map(([from, to]) => (
                    <Badge key={edgeKey(from, to)} variant='secondary'>
                      {from} → {to}
                      {!readOnly && (
                        <button
                          type='button'
                          aria-label={`Eliminar dependencia ${from} → ${to}`}
                          className='ml-1 inline-flex items-center rounded-full hover:bg-secondary-foreground/10'
                          onClick={() => removeEdge(from, to)}
                        >
                          <X className='h-3 w-3' />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {cycle && cycle.length > 0 && (
              <Badge variant='danger' className='w-full justify-center'>
                Ciclo detectado: {cycle.join(' → ')}
              </Badge>
            )}

            {selectedId && !readOnly && (
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => {
                  setSelectedId(null);
                }}
              >
                <Trash2 className='mr-1.5 h-4 w-4' />
                Limpiar selección
              </Button>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default AssemblyPlanner;
