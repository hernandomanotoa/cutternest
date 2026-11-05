import type { PieceGroup } from '../../utils/pieceCounter'
import { nombreCategoria } from '../../utils/pieceCounter'
import { CATEGORIAS_CANTO } from '../../utils/cantoClasificacion'
import {
  Card,
  CardContent,
} from '../ui/Card'

interface PieceCountTabProps {
  groups: PieceGroup[]
  totalPieces: number
  totalGroups: number
  /** Edición masiva de cantos: aplica la categoría elegida a todas las
   * piezas del grupo (mismas medidas + espesor + clasificación actual).
   * Al cambiarla el grupo se re-clasifica y la fila se regenera. */
  onCambiarCantos?: (grupo: PieceGroup, nuevaCategoria: number) => void
}

export function PieceCountTab({ groups, totalPieces, totalGroups, onCambiarCantos }: PieceCountTabProps) {
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
                <th className='p-3 text-left font-medium'>Cantos</th>
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
                  <td className='p-3'>
                    <div className='space-y-0.5'>
                      {onCambiarCantos ? (
                        <select
                          className='w-full max-w-[10rem] rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground'
                          value={g.cantos[0]?.categoria ?? 0}
                          onChange={(e) => onCambiarCantos(g, Number(e.target.value))}
                          aria-label={`Cantos de ${g.ancho}×${g.alto}`}
                        >
                          {CATEGORIAS_CANTO.map((nombre, cat) => (
                            <option key={cat} value={cat}>{nombre}</option>
                          ))}
                        </select>
                      ) : null}
                      {g.cantos.map((c) => (
                        <div key={c.patron} className='flex items-baseline gap-1.5' title={nombreCategoria(c.categoria)}>
                          <span className='font-mono text-xs text-foreground'>{c.patron || '—'}</span>
                          <span className='text-[11px] text-muted-foreground'>
                            {nombreCategoria(c.categoria)}
                            {g.cantos.length > 1 ? ` · ${c.unidades} und` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
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
