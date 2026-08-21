import type { PieceGroup } from '../../utils/pieceCounter'
import {
  Card,
  CardContent,
} from '../ui/Card'

interface PieceCountTabProps {
  groups: PieceGroup[]
  totalPieces: number
  totalGroups: number
}

export function PieceCountTab({ groups, totalPieces, totalGroups }: PieceCountTabProps) {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-xs font-medium uppercase text-muted-foreground'>Piezas totales</p>
            <p className='text-2xl font-semibold text-foreground'>{totalPieces}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-xs font-medium uppercase text-muted-foreground'>Grupos distintos</p>
            <p className='text-2xl font-semibold text-foreground'>{totalGroups}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-xs font-medium uppercase text-muted-foreground'>Diferentes piezas</p>
            <p className='text-2xl font-semibold text-foreground'>{groups.length}</p>
          </CardContent>
        </Card>
      </div>

      {groups.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No hay piezas para agrupar.</p>
      ) : (
        <div className='overflow-x-auto rounded-md border'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th className='p-3 text-left font-medium'>Dimensiones</th>
                <th className='p-3 text-left font-medium'>Espesor</th>
                <th className='p-3 text-left font-medium'>Cantidad total</th>
                <th className='p-3 text-left font-medium'>Nombres</th>
                <th className='p-3 text-left font-medium'>Colores</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {groups.map((g) => (
                <tr key={g.key} className='hover:bg-muted/30'>
                  <td className='p-3 text-foreground'>
                    {g.ancho.toFixed(1)} × {g.alto.toFixed(1)} mm
                  </td>
                  <td className='p-3 text-foreground'>{g.espesor} mm</td>
                  <td className='p-3 font-medium text-foreground'>{g.cantidad}</td>
                  <td className='p-3 text-foreground'>{g.nombres.join(', ')}</td>
                  <td className='p-3'>
                    <div className='flex gap-1'>
                      {g.colores.map((c, i) => (
                        <div
                          key={i}
                          className='h-4 w-4 rounded border border-border'
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
