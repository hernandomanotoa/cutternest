import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Edges, Grid, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { AssemblyConnector, AssemblyPiece3D, AssemblyPieceState, Point3D, Transform3D } from '../../types'
import { PieceLabel } from './PieceLabel'

interface Assembly3DV2Props {
  pieces: AssemblyPiece3D[]
  expectedPieces?: AssemblyPieceState[]
  connectors?: AssemblyConnector[]
  highlightedIds?: string[]
  selectedCode?: string | null
  currentTransforms?: Record<string, Transform3D>
  transformMode?: 'translate' | 'rotate'
  snap?: boolean
  snapThreshold?: number
  explodeFactor?: number
  currentStep?: number
  camera?: Record<string, unknown> | null
  cameraResetKey?: number
  showLabels?: boolean
  levels?: string[][]
  pieceStates?: Record<string, 'active' | 'placed' | 'future'>
  className?: string
  onSelectPiece?: (code: string | null) => void
  onTransformChange?: (id: string, transform: Transform3D) => void
  onTransformEnd?: (id: string, transform: Transform3D) => void
}

export const SCALE = 0.025
const MIN_THICKNESS = 1.0
const EXPLODE_DISTANCE_MM = 120

const MODULE_PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
]

export function getModuleColor(modulo?: string): string {
  if (!modulo) return '#64748b'
  let hash = 0
  for (let i = 0; i < modulo.length; i++) hash = modulo.charCodeAt(i) + ((hash << 5) - hash)
  const index = Math.abs(hash) % MODULE_PALETTE.length
  return MODULE_PALETTE[index]
}

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

function pointToVec3(p: Point3D): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z)
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref.current
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface PieceMeshProps {
  piece: AssemblyPiece3D
  transform: Transform3D
  explodedOffset: [number, number, number]
  highlighted: boolean
  selected: boolean
  currentStep?: number
  transformMode: 'translate' | 'rotate'
  snapEnabled: boolean
  snapThreshold: number
  snapTarget?: Transform3D
  showLabels?: boolean
  pieceState?: 'active' | 'placed' | 'future'
  onSelect: () => void
  onTransformEnd: (id: string, transform: Transform3D) => void
}

function PieceMesh({
  piece,
  transform,
  explodedOffset,
  highlighted,
  selected,
  currentStep,
  transformMode,
  snapEnabled,
  snapThreshold,
  snapTarget,
  showLabels,
  pieceState,
  onSelect,
  onTransformEnd,
}: PieceMeshProps) {
  const dims = visualDimensions(piece)
  const fillColor = piece.modulo ? getModuleColor(piece.modulo) : piece.color
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const labelVisible = selected || hovered || (showLabels ?? false)

  const opacity = pieceState === 'future' ? 0.25 : pieceState === 'placed' ? 0.85 : 0.92
  const emissiveColor = highlighted || selected ? piece.color : '#000000'
  const emissiveIntensity = highlighted ? 0.35 : selected ? 0.55 : 0

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

  const animRef = useRef({
    active: false,
    progress: 1,
    startPos: new THREE.Vector3(),
    startRot: new THREE.Quaternion(),
    targetPos: new THREE.Vector3(),
    targetRot: new THREE.Quaternion(),
  })

  useEffect(() => {
    animRef.current.targetPos.copy(targetPos)
    animRef.current.targetRot.setFromEuler(targetRot)
  }, [targetPos, targetRot])

  const prevStep = usePrevious(currentStep)

  useEffect(() => {
    if (prevStep !== undefined && currentStep !== prevStep && highlighted) {
      const mesh = meshRef.current
      if (!mesh) return
      const entryOffset = new THREE.Vector3(0, Math.max(dims.alto, 5) * SCALE * 2, 0)
      animRef.current.startPos.copy(animRef.current.targetPos).add(entryOffset)
      const startEuler = targetRot.clone()
      startEuler.y += Math.PI / 8
      animRef.current.startRot.setFromEuler(startEuler)
      animRef.current.progress = 0
      animRef.current.active = true
      mesh.position.copy(animRef.current.startPos)
      mesh.quaternion.copy(animRef.current.startRot)
      mesh.updateMatrix()
    }
  }, [currentStep, prevStep, highlighted, targetRot, dims.alto])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || !animRef.current.active) return

    animRef.current.progress += delta * 2.5
    if (animRef.current.progress >= 1) {
      animRef.current.progress = 1
      animRef.current.active = false
    }

    const t = easeOutCubic(animRef.current.progress)
    mesh.position.lerpVectors(animRef.current.startPos, animRef.current.targetPos, t)
    mesh.quaternion.slerpQuaternions(animRef.current.startRot, animRef.current.targetRot, t)
    mesh.updateMatrix()
  })

  const handleChange = () => {
    const mesh = meshRef.current
    if (!mesh) return
    const pos = mesh.position
    const rot = mesh.quaternion

    let basePos: Point3D = {
      x: pos.x / SCALE - explodedOffset[0],
      y: pos.y / SCALE - explodedOffset[1],
      z: pos.z / SCALE - explodedOffset[2],
    }
    let baseRotEuler = new THREE.Euler().setFromQuaternion(rot)
    let baseRot: Point3D = toDegrees(baseRotEuler)

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
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[dims.ancho * SCALE, dims.alto * SCALE, dims.profundidad * SCALE]} />
      <meshStandardMaterial
        color={fillColor}
        transparent
        opacity={opacity}
        roughness={0.6}
        metalness={0.1}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
      />
      <Edges threshold={5} color='#1f2937' lineWidth={1} />
      <PieceLabel piece={piece} visible={labelVisible} />
    </mesh>
  )

  if (!selected) return mesh

  const snapProps: { translationSnap?: number; rotationSnap?: number } = snapEnabled
    ? { translationSnap: 0.5 * SCALE, rotationSnap: Math.PI / 8 }
    : {}

  return (
    <TransformControls
      mode={transformMode}
      onMouseUp={handleChange}
      {...snapProps}
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

function parseCameraTarget(
  camera: Record<string, unknown>,
  fallbackTarget: THREE.Vector3,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const toVec3 = (value: unknown): THREE.Vector3 | null => {
    if (Array.isArray(value) && value.length >= 3) {
      return new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]))
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if (typeof obj.x === 'number' && typeof obj.y === 'number' && typeof obj.z === 'number') {
        return new THREE.Vector3(obj.x, obj.y, obj.z)
      }
    }
    return null
  }

  const pos =
    toVec3(camera.position) ??
    toVec3(camera.eye) ??
    new THREE.Vector3(fallbackTarget.x + SCALE * 100, fallbackTarget.y + SCALE * 100, fallbackTarget.z + SCALE * 100)

  const target = toVec3(camera.target) ?? toVec3(camera.lookAt) ?? toVec3(camera.center) ?? fallbackTarget

  return { position: pos, target }
}

function CameraDirector({
  camera,
  center,
  defaultDistance,
  resetKey = 0,
}: {
  camera?: Record<string, unknown> | null
  center: Point3D
  defaultDistance: number
  resetKey?: number
}) {
  const controlsRef = useRef<ElementRef<typeof CameraControls>>(null)

  const applyCamera = useMemo(() => {
    return () => {
      const controls = controlsRef.current
      if (!controls) return

      const target = pointToVec3(center).multiplyScalar(SCALE)

      let position: THREE.Vector3
      let lookAt: THREE.Vector3

      if (camera) {
        const parsed = parseCameraTarget(camera, target)
        position = parsed.position.clone().multiplyScalar(SCALE)
        lookAt = parsed.target.clone().multiplyScalar(SCALE)
      } else {
        const d = defaultDistance
        position = new THREE.Vector3(target.x + d, target.y + d, target.z + d)
        lookAt = target
      }

      controls.setLookAt(position.x, position.y, position.z, lookAt.x, lookAt.y, lookAt.z, true)
    }
  }, [camera, center, defaultDistance])

  useEffect(() => {
    applyCamera()
  }, [applyCamera, resetKey])

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={5}
      maxDistance={Math.max(defaultDistance * 4, 200)}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  )
}

function Scene({
  pieces,
  expectedPieces,
  connectors,
  highlightedIds,
  selectedCode,
  currentTransforms,
  transformMode,
  snap,
  snapThreshold,
  explodeFactor,
  currentStep,
  camera,
  cameraResetKey,
  showLabels,
  levels,
  pieceStates,
  onSelectPiece,
  onTransformEnd,
}: Required<Pick<
  Assembly3DV2Props,
  | 'pieces'
  | 'connectors'
  | 'highlightedIds'
  | 'currentTransforms'
  | 'transformMode'
  | 'snap'
  | 'snapThreshold'
  | 'explodeFactor'
  | 'currentStep'
  | 'camera'
  | 'cameraResetKey'
  | 'showLabels'
  | 'levels'
  | 'pieceStates'
  | 'onSelectPiece'
  | 'onTransformEnd'
>> & {
  expectedPieces?: AssemblyPieceState[]
  selectedCode?: string | null
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
    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity
    let minZ = Infinity,
      maxZ = -Infinity
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

  const cameraDistance = Math.max(maxDim * SCALE * 2.5, 60)

  const pieceLevels = useMemo(() => {
    const map = new Map<string, number>()
    if (!levels) return map
    levels.forEach((level, idx) => {
      for (const id of level) map.set(id, idx)
    })
    return map
  }, [levels])

  const explodedOffsets = useMemo(() => {
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
      const level = pieceLevels.get(p.id) ?? 0
      const levelFactor = levels && levels.length > 0 ? level + 1 : 1
      offsets.set(p.id, [
        (dx / length) * EXPLODE_DISTANCE_MM * explodeFactor * levelFactor,
        (dy / length) * EXPLODE_DISTANCE_MM * explodeFactor * levelFactor,
        (dz / length) * EXPLODE_DISTANCE_MM * explodeFactor * levelFactor,
      ])
    }
    return offsets
  }, [pieces, center, explodeFactor, pieceLevels, levels])

  const transforms = useMemo(() => {
    const map = new Map<string, Transform3D>()
    for (const p of pieces) {
      map.set(p.id, currentTransforms[p.id] ?? { position: p.posicion, rotation: p.rotacion })
    }
    return map
  }, [pieces, currentTransforms])

  const pieceStateById = useMemo(() => {
    const map = new Map<string, 'active' | 'placed' | 'future'>()
    if (!pieceStates) return map
    for (const [id, state] of Object.entries(pieceStates)) map.set(id, state)
    return map
  }, [pieceStates])

  return (
    <>
      <CameraDirector camera={camera} center={center} defaultDistance={cameraDistance} resetKey={cameraResetKey} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[30, 50, 30]} intensity={1.2} castShadow />
      <directionalLight position={[-30, 20, -30]} intensity={0.4} />
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
          selected={selectedCode === p.id}
          currentStep={currentStep}
          transformMode={transformMode}
          snapEnabled={snap}
          snapThreshold={snapThreshold}
          snapTarget={expectedByCode.get(p.id)}
          showLabels={showLabels}
          pieceState={pieceStateById.get(p.id)}
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
  selectedCode,
  currentTransforms = {},
  transformMode = 'translate',
  snap = false,
  snapThreshold = 2.0,
  explodeFactor = 0,
  currentStep,
  camera,
  cameraResetKey,
  showLabels = false,
  levels = [],
  pieceStates = {},
  className = 'w-full h-full',
  onSelectPiece,
  onTransformChange,
  onTransformEnd,
}: Assembly3DV2Props) {
  const handleTransformEnd = (id: string, transform: Transform3D) => {
    onTransformChange?.(id, transform)
    onTransformEnd?.(id, transform)
  }

  return (
    <div className={className}>
      <Canvas
        camera={{ fov: 50 }}
        shadows
        gl={{ alpha: false }}
        style={{ background: 'hsl(var(--background))' }}
      >
        <Scene
          pieces={pieces}
          expectedPieces={expectedPieces}
          connectors={connectors}
          highlightedIds={highlightedIds}
          selectedCode={selectedCode}
          currentTransforms={currentTransforms}
          transformMode={transformMode}
          snap={snap}
          snapThreshold={snapThreshold}
          explodeFactor={explodeFactor}
          currentStep={currentStep ?? 0}
          camera={camera ?? null}
          cameraResetKey={cameraResetKey ?? 0}
          showLabels={showLabels}
          levels={levels}
          pieceStates={pieceStates}
          onSelectPiece={(id) => onSelectPiece?.(id)}
          onTransformEnd={handleTransformEnd}
        />
      </Canvas>
    </div>
  )
}
