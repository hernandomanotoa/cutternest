import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { AssemblyPiece3D } from '../../types'

interface Assembly3DProps {
  pieces: AssemblyPiece3D[]
  highlightedIds?: string[]
  className?: string
}

function PieceMesh({ piece, highlighted }: { piece: AssemblyPiece3D; highlighted: boolean }) {
  const { x, y, z } = piece.posicion
  const { x: rx, y: ry, z: rz } = piece.rotacion
  const size = 0.1
  return (
    <mesh
      position={[x * size, y * size, z * size]}
      rotation={[rx * (Math.PI / 180), ry * (Math.PI / 180), rz * (Math.PI / 180)]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[piece.ancho * size, piece.alto * size, piece.profundidad * size]} />
      <meshStandardMaterial
        color={piece.color}
        transparent
        opacity={0.95}
        emissive={highlighted ? piece.color : '#000000'}
        emissiveIntensity={highlighted ? 0.3 : 0}
      />
    </mesh>
  )
}

export function Assembly3D({ pieces, highlightedIds = [], className = 'w-full h-96 border border-gray-300 rounded-lg overflow-hidden' }: Assembly3DProps) {
  const center = useMemo(() => {
    if (pieces.length === 0) return { x: 0, y: 0, z: 0 }
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const p of pieces) {
      const hx = p.ancho / 2
      const hy = p.alto / 2
      const hz = p.profundidad / 2
      minX = Math.min(minX, p.posicion.x - hx)
      maxX = Math.max(maxX, p.posicion.x + hx)
      minY = Math.min(minY, p.posicion.y - hy)
      maxY = Math.max(maxY, p.posicion.y + hy)
      minZ = Math.min(minZ, p.posicion.z - hz)
      maxZ = Math.max(maxZ, p.posicion.z + hz)
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
  }, [pieces])

  const maxDim = useMemo(() => {
    let max = 0
    for (const p of pieces) {
      max = Math.max(max, p.ancho, p.alto, p.profundidad)
    }
    return max || 1
  }, [pieces])

  const cameraDistance = Math.max(maxDim * 0.25, 30)

  return (
    <div className={className}>
      <Canvas camera={{ position: [cameraDistance, cameraDistance, cameraDistance], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 40, 20]} intensity={1} />
        <directionalLight position={[-20, 20, -20]} intensity={0.4} />
        <OrbitControls enablePan enableZoom enableRotate target={[center.x * 0.1, center.y * 0.1, center.z * 0.1]} />
        {pieces.map((p) => (
          <PieceMesh key={p.id} piece={p} highlighted={highlightedIds.includes(p.id)} />
        ))}
      </Canvas>
    </div>
  )
}
