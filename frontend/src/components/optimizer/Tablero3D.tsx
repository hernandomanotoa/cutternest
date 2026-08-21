import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { BoardResult } from '../../types'

function Piece3D({
  x,
  y,
  w,
  h,
  thickness,
  color,
  boardW,
  boardH,
}: {
  x: number
  y: number
  w: number
  h: number
  thickness: number
  color: string
  boardW: number
  boardH: number
}) {
  const threeX = x - boardW / 2 + w / 2
  const threeZ = y - boardH / 2 + h / 2
  const threeY = thickness / 20

  return (
    <mesh position={[threeX / 10, threeY, threeZ / 10]} castShadow receiveShadow>
      <boxGeometry args={[w / 10, thickness / 10, h / 10]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  )
}

export function Tablero3D({ board }: { board: BoardResult }) {
  return (
    <div className='h-96 w-full overflow-hidden rounded-xl border border-border bg-card'>
      <Canvas camera={{ position: [30, 30, 30], fov: 45 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 40, 20]} intensity={1.2} castShadow />
        <directionalLight position={[-20, 20, -20]} intensity={0.4} />
        <OrbitControls enablePan enableZoom enableRotate />
        <mesh position={[0, -0.5, 0]} receiveShadow>
          <boxGeometry args={[board.ancho / 10, 0.2, board.alto / 10]} />
          <meshStandardMaterial color='hsl(var(--muted))' />
        </mesh>
        {board.placements.map((p, i) => (
          <Piece3D
            key={i}
            x={p.x}
            y={p.y}
            w={p.w}
            h={p.h}
            thickness={p.espesor}
            color={p.color}
            boardW={board.ancho}
            boardH={board.alto}
          />
        ))}
      </Canvas>
    </div>
  )
}
