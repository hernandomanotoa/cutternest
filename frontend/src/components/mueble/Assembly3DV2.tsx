import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Edges, Grid } from '@react-three/drei'
import type { AssemblyConnector, AssemblyPiece3D } from '../../types'

interface Assembly3DV2Props {
  pieces: AssemblyPiece3D[]
  connectors?: AssemblyConnector[]
  highlightedIds?: string[]
  exploded?: boolean
  className?: string
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

function PieceMesh({ piece, highlighted, explodedOffset }: { piece: AssemblyPiece3D; highlighted: boolean; explodedOffset: [number, number, number] }) {
  const dims = visualDimensions(piece)
  const { x, y, z } = piece.posicion
  const { x: rx, y: ry, z: rz } = piece.rotacion
  const position: [number, number, number] = [
    (x + explodedOffset[0]) * SCALE,
    (y + explodedOffset[1]) * SCALE,
    (z + explodedOffset[2]) * SCALE,
  ]

  return (
    <mesh position={position} rotation={[rx * (Math.PI / 180), ry * (Math.PI / 180), rz * (Math.PI / 180)]} castShadow receiveShadow>
      <boxGeometry args={[dims.ancho * SCALE, dims.alto * SCALE, dims.profundidad * SCALE]} />
      <meshStandardMaterial
        color={piece.color}
        transparent
        opacity={0.92}
        roughness={0.6}
        metalness={0.1}
        emissive={highlighted ? piece.color : '#000000'}
        emissiveIntensity={highlighted ? 0.25 : 0}
      />
      <Edges threshold={5} color='#1f2937' lineWidth={1} />
    </mesh>
  )
}

function ConnectorMesh({ connector }: { connector: AssemblyConnector }) {
  const { x, y, z } = connector.posicion
  const { x: dx, z: dz } = connector.direccion
  const color = CONNECTOR_COLORS[connector.tipo] || '#94a3b8'
  const position: [number, number, number] = [x * SCALE, y * SCALE, z * SCALE]

  // Cylinder orientation: default along Y. If direction is X, rotate Z 90°; if Z, rotate X 90°.
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

export function Assembly3DV2({
  pieces,
  connectors = [],
  highlightedIds = [],
  exploded = false,
  className = 'w-full h-96 border border-gray-300 rounded-lg overflow-hidden',
}: Assembly3DV2Props) {
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

  const cameraDistance = Math.max(maxDim * SCALE * 2.5, 40)

  return (
    <div className={className}>
      <Canvas camera={{ position: [cameraDistance, cameraDistance, cameraDistance], fov: 50 }} shadows>
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
            highlighted={highlightedIds.includes(p.id)}
            explodedOffset={explodedOffsets.get(p.id) ?? [0, 0, 0]}
          />
        ))}
        {connectors.map((c, i) => (
          <ConnectorMesh key={`${c.tipo}-${i}`} connector={c} />
        ))}
      </Canvas>
    </div>
  )
}
