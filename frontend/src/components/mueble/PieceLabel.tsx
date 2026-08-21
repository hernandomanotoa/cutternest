import { Html } from '@react-three/drei';
import type { AssemblyPiece3D } from '../../types';
import { SCALE } from './Assembly3DV2';

interface PieceLabelProps {
  piece: AssemblyPiece3D;
  visible: boolean;
}

export function PieceLabel({ piece, visible }: PieceLabelProps) {
  if (!visible) return null;

  return (
    <Html
      distanceFactor={10}
      style={{ pointerEvents: 'none' }}
      position={[0, (piece.alto / 2) * SCALE + 0.2, 0]}
    >
      <div className='rounded-md border border-border bg-popover/95 px-2 py-1 text-xs text-popover-foreground shadow-md'>
        <div className='font-semibold'>{piece.id}</div>
        <div className='text-muted-foreground'>
          {piece.ancho}×{piece.alto}×{piece.profundidad} mm
        </div>
        {piece.modulo && (
          <div className='text-[10px] uppercase tracking-wide text-accent'>{piece.modulo}</div>
        )}
      </div>
    </Html>
  );
}
