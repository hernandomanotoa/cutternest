import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { BoardResult } from '../../types'

function Box({ x, y, w, h, thickness, color }: {
  x: number
  y: number
  w: number
  h: number
  thickness: number
  color: string
}) {
  const boardW = 244
  const boardH = 122
  const threeX = x - boardW / 2 + w / 2
  const threeZ = y - boardH / 2 + h / 2
  const threeY = thickness / 20

  return (
    <mesh position={[threeX / 10, threeY, threeZ / 10]}>
      <boxGeometry args={[w / 10, thickness / 10, h / 10]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

export function Tablero3D({ board }: { board: BoardResult }) {
  return (
    <div className='w-full h-96 border border-gray-300 rounded-lg overflow-hidden'>
      <Canvas camera={{ position: [30, 30, 30], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[20, 40, 20]} intensity={1} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        <mesh position={[0, -0.5, 0]}>
          <boxGeometry args={[board.ancho / 10, 0.2, board.alto / 10]} />
          <meshStandardMaterial color='#e5e7eb' />
        </mesh>
        {board.placements.map((p, i) => (
          <Box
            key={i}
            x={p.x}
            y={p.y}
            w={p.w}
            h={p.h}
            thickness={p.espesor}
            color={p.color}
          />
        ))}
      </Canvas>
    </div>
  )
}
