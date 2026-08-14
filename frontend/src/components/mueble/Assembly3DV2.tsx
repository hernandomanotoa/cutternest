import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Edges, Grid, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { AssemblyConnector, AssemblyPiece3D, AssemblyPieceState, Point3D, Transform3D } from '../../types'

interface Assembly3DV2Props {
  pieces: AssemblyPiece3D[]
  expectedPieces?: AssemblyPieceState[]
  connectors?: AssemblyConnector[]
  highlightedIds?: string[]
  selectedId?: string | null
  currentTransforms?: Record<string, Transform3D>
  transformMode?: 'translate' | 'rotate'
  snap?: boolean
  snapThreshold?: number
  exploded?: boolean
  className?: string
  onSelectPiece?: (id: string | null) => void
  onTransformChange?: (id: string, transform: Transform3D) => void
  onTransformEnd?: (id: string, transform: Transform3D) => void
}

const SCALE = 0.25
const MIN_THICKNESS = 1.0

const CONNECTOR_COLORS: Record<string, string> = {
  confirmat: '#94a3b8',
  bisagra: '#475569',
  taco: '#d97706',
  tornillo: '#64748b',
  pata: '#1f2937',
  tirador: '#e5e7eb',
}

function pieceKind(id: string): string {
  const lower = id.toLowerCase()
  if (lower.includes('base')) return 'base'
  if (lower.includes('tapa')) return 'tapa'
  if (lower.includes('lateral')) return 'lateral'
  if (lower.includes('estante')) return 'estante'
  if (lower.includes('fondo')) return 'fondo'
  if (lower.includes('puerta')) return 'puerta'
  if (lower.includes('pata')) return 'pata'
  if (lower.includes('cajon')) return 'cajon'
  return 'other'
}

function visualDimensions(piece: AssemblyPiece3D) {
  const kind = pieceKind(piece.id)
  let { ancho, alto, profundidad } = piece
  if (kind === 'base' || kind === 'tapa' || kind === 'estante' || kind === 'cajon') {
    alto = Math.max(alto, MIN_THICKNESS)
  }
  if (kind === 'lateral') {
    ancho = Math.max(ancho, MIN_THICKNESS)
  }
  if (kind === 'fondo' || kind === 'puerta') {
    profundidad = Math.max(profundidad, MIN_THICKNESS)
  }
  if (kind === 'pata') {
    ancho = Math.max(ancho, MIN_THICKNESS)
    profundidad = Math.max(profundidad, MIN_THICKNESS)
  }
  return { ancho, alto, profundidad }
}

function toRadians(deg: Point3D): THREE.Euler {
  return new THREE.Euler(deg.x * (Math.PI / 180), deg.y * (Math.PI / 180), deg.z * (Math.PI / 180))
}

function toDegrees(rad: THREE.Euler): Point3D {
  return { x: rad.x * (180 / Math.PI), y: rad.y * (180 / Math.PI), z: rad.z * (180 / Math.PI) }
}

interface PieceMeshProps {
  piece: AssemblyPiece3D
  transform: Transform3D
  explodedOffset: [number, number, number]
  highlighted: boolean
  selected: boolean
  transformMode: 'translate' | 'rotate'
  snapEnabled: boolean
  snapThreshold: number
  snapTarget?: Transform3D
  onSelect: () => void
  onTransformEnd: (id: string, transform: Transform3D) => void
}

function PieceMesh({
  piece,
  transform,
  explodedOffset,
  highlighted,
  selected,
  transformMode,
  snapEnabled,
  snapThreshold,
  snapTarget,
  onSelect,
  onTransformEnd,
}: PieceMeshProps) {
  const dims = visualDimensions(piece)
  const meshRef = useRef<THREE.Mesh>(null)

  const targetPos = useMemo(
    () =>
      new THREE.Vector3(
        (transform.position.x + explodedOffset[0]) * SCALE,
        (transform.position.y + explodedOffset[1]) * SCALE,
        (transform.position.z + explodedOffset[2]) * SCALE,
      ),
    [transform.position, explodedOffset],
  )

  const targetRot = useMemo(() => toRadians(transform.rotation), [transform.rotation])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.copy(targetPos)
    mesh.rotation.copy(targetRot)
    mesh.updateMatrix()
    mesh.updateMatrixWorld()
  }, [targetPos, targetRot])

  const handleChange = () => {
    const mesh = meshRef.current
    if (!mesh) return
    const pos = mesh.position
    const rot = mesh.rotation

    let basePos: Point3D = {
      x: pos.x / SCALE - explodedOffset[0],
      y: pos.y / SCALE - explodedOffset[1],
      z: pos.z / SCALE - explodedOffset[2],
    }
    let baseRot: Point3D = toDegrees(rot)

    if (snapEnabled && snapTarget) {
      const dx = basePos.x - snapTarget.position.x
      const dy = basePos.y - snapTarget.position.y
      const dz = basePos.z - snapTarget.position.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist <= snapThreshold) {
        basePos = { ...snapTarget.position }
        baseRot = { ...snapTarget.rotation }
        mesh.position.set(
          (basePos.x + explodedOffset[0]) * SCALE,
          (basePos.y + explodedOffset[1]) * SCALE,
          (basePos.z + explodedOffset[2]) * SCALE,
        )
        mesh.rotation.copy(toRadians(baseRot))
        mesh.updateMatrix()
        mesh.updateMatrixWorld()
      }
    }

    onTransformEnd(piece.id, { position: basePos, rotation: baseRot })
  }

  const mesh = (
    <mesh
      ref={meshRef}
      position={targetPos}
      rotation={targetRot}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[dims.ancho * SCALE, dims.alto * SCALE, dims.profundidad * SCALE]} />
      <meshStandardMaterial
        color={piece.color}
        transparent
        opacity={0.92}
        roughness={0.6}
        metalness={0.1}
        emissive={highlighted || selected ? piece.color : '#000000'}
        emissiveIntensity={highlighted ? 0.25 : selected ? 0.45 : 0}
      />
      <Edges threshold={5} color='#1f2937' lineWidth={1} />
    </mesh>
  )

  if (!selected) return mesh

  return (
    <TransformControls
      mode={transformMode}
      translationSnap={snapEnabled ? 0.5 * SCALE : undefined}
      rotationSnap={snapEnabled ? Math.PI / 8 : undefined}
      onMouseUp={handleChange}
    >
      {mesh}
    </TransformControls>
  )
}

function ConnectorMesh({
  connector,
  explodedOffset,
}: {
  connector: AssemblyConnector
  explodedOffset: [number, number, number]
}) {
  const { x, y, z } = connector.posicion
  const { x: dx, z: dz } = connector.direccion
  const color = CONNECTOR_COLORS[connector.tipo] || '#94a3b8'
  const position: [number, number, number] = [
    (x + explodedOffset[0]) * SCALE,
    (y + explodedOffset[1]) * SCALE,
    (z + explodedOffset[2]) * SCALE,
  ]

  let rotation: [number, number, number] = [0, 0, 0]
  if (Math.abs(dx) > 0.5) rotation = [0, 0, Math.PI / 2]
  else if (Math.abs(dz) > 0.5) rotation = [Math.PI / 2, 0, 0]

  if (connector.tipo === 'confirmat' || connector.tipo === 'pata') {
    return (
      <mesh position={position} rotation={rotation} castShadow>
        <cylinderGeometry args={[0.25 * SCALE, 0.25 * SCALE, 3 * SCALE, 8]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
    )
  }

  if (connector.tipo === 'bisagra') {
    return (
      <mesh position={position} rotation={rotation} castShadow>
        <boxGeometry args={[0.8 * SCALE, 2 * SCALE, 0.4 * SCALE]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
      </mesh>
    )
  }

  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[0.5 * SCALE, 12, 12]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
    </mesh>
  )
}

function Scene({
  pieces,
  expectedPieces,
  connectors,
  highlightedIds,
  selectedId,
  currentTransforms,
  transformMode,
  snap,
  snapThreshold,
  exploded,
  onSelectPiece,
  onTransformEnd,
}: Required<Pick<Assembly3DV2Props, 'pieces' | 'connectors' | 'highlightedIds' | 'currentTransforms' | 'transformMode' | 'snap' | 'snapThreshold' | 'exploded' | 'onSelectPiece' | 'onTransformEnd'>> & {
  expectedPieces?: AssemblyPieceState[]
  selectedId?: string | null
}) {
  const expectedByCode = useMemo(() => {
    const map = new Map<string, Transform3D>()
    if (!expectedPieces) return map
    for (const p of expectedPieces) {
      map.set(p.codigo, {
        position: p.posicion_esperada,
        rotation: p.rotacion_esperada,
      })
    }
    return map
  }, [expectedPieces])

  const center = useMemo(() => {
    if (pieces.length === 0) return { x: 0, y: 0, z: 0 }
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const p of pieces) {
      const dims = visualDimensions(p)
      minX = Math.min(minX, p.posicion.x)
      maxX = Math.max(maxX, p.posicion.x + dims.ancho)
      minY = Math.min(minY, p.posicion.y)
      maxY = Math.max(maxY, p.posicion.y + dims.alto)
      minZ = Math.min(minZ, p.posicion.z)
      maxZ = Math.max(maxZ, p.posicion.z + dims.profundidad)
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
  }, [pieces])

  const maxDim = useMemo(() => {
    let max = 0
    for (const p of pieces) {
      const dims = visualDimensions(p)
      max = Math.max(max, dims.ancho, dims.alto, dims.profundidad)
    }
    return max || 1
  }, [pieces])

  const explodedOffsets = useMemo(() => {
    if (!exploded) return new Map<string, [number, number, number]>()
    const offsets = new Map<string, [number, number, number]>()
    for (const p of pieces) {
      const dims = visualDimensions(p)
      const cx = p.posicion.x + dims.ancho / 2
      const cy = p.posicion.y + dims.alto / 2
      const cz = p.posicion.z + dims.profundidad / 2
      const dx = cx - center.x
      const dy = cy - center.y
      const dz = cz - center.z
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      offsets.set(p.id, [(dx / length) * 8, (dy / length) * 8, (dz / length) * 8])
    }
    return offsets
  }, [exploded, pieces, center])

  const transforms = useMemo(() => {
    const map = new Map<string, Transform3D>()
    for (const p of pieces) {
      map.set(p.id, currentTransforms[p.id] ?? { position: p.posicion, rotation: p.rotacion })
    }
    return map
  }, [pieces, currentTransforms])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[30, 50, 30]} intensity={1.2} castShadow />
      <directionalLight position={[-30, 20, -30]} intensity={0.4} />
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        target={[center.x * SCALE, center.y * SCALE, center.z * SCALE]}
      />
      <Grid
        position={[center.x * SCALE, -0.1, center.z * SCALE]}
        args={[maxDim * 3, maxDim * 3]}
        cellSize={5 * SCALE}
        sectionSize={20 * SCALE}
        fadeDistance={200}
        infiniteGrid
      />
      {pieces.map((p) => (
        <PieceMesh
          key={p.id}
          piece={p}
          transform={transforms.get(p.id) ?? { position: p.posicion, rotation: p.rotacion }}
          explodedOffset={explodedOffsets.get(p.id) ?? [0, 0, 0]}
          highlighted={highlightedIds.includes(p.id)}
          selected={selectedId === p.id}
          transformMode={transformMode}
          snapEnabled={snap}
          snapThreshold={snapThreshold}
          snapTarget={expectedByCode.get(p.id)}
          onSelect={() => onSelectPiece(p.id)}
          onTransformEnd={onTransformEnd}
        />
      ))}
      {connectors.map((c, i) => (
        <ConnectorMesh key={`${c.tipo}-${i}`} connector={c} explodedOffset={[0, 0, 0]} />
      ))}
    </>
  )
}

export function Assembly3DV2({
  pieces,
  expectedPieces,
  connectors = [],
  highlightedIds = [],
  selectedId,
  currentTransforms = {},
  transformMode = 'translate',
  snap = false,
  snapThreshold = 2.0,
  exploded = false,
  className = 'w-full h-96 border border-gray-300 rounded-lg overflow-hidden',
  onSelectPiece,
  onTransformChange,
  onTransformEnd,
}: Assembly3DV2Props) {
  const maxDim = useMemo(() => {
    let max = 0
    for (const p of pieces) {
      const dims = visualDimensions(p)
      max = Math.max(max, dims.ancho, dims.alto, dims.profundidad)
    }
    return max || 1
  }, [pieces])

  const cameraDistance = Math.max(maxDim * SCALE * 2.5, 40)

  const handleTransformEnd = (id: string, transform: Transform3D) => {
    onTransformChange?.(id, transform)
    onTransformEnd?.(id, transform)
  }

  return (
    <div className={className}>
      <Canvas camera={{ position: [cameraDistance, cameraDistance, cameraDistance], fov: 50 }} shadows>
        <Scene
          pieces={pieces}
          expectedPieces={expectedPieces}
          connectors={connectors}
          highlightedIds={highlightedIds}
          selectedId={selectedId}
          currentTransforms={currentTransforms}
          transformMode={transformMode}
          snap={snap}
          snapThreshold={snapThreshold}
          exploded={exploded}
          onSelectPiece={(id) => onSelectPiece?.(id)}
          onTransformEnd={handleTransformEnd}
        />
      </Canvas>
    </div>
  )
}
