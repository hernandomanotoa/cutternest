import type { PieceGroup } from '../../utils/pieceCounter'

interface PieceCountTabProps {
  groups: PieceGroup[]
  totalPieces: number
  totalGroups: number
}

export function PieceCountTab({ groups, totalPieces, totalGroups }: PieceCountTabProps) {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <div className='bg-slate-50 p-3 rounded border border-slate-200'>
          <p className='text-xs text-slate-500 uppercase'>Piezas totales</p>
          <p className='text-xl font-semibold text-slate-800'>{totalPieces}</p>
        </div>
        <div className='bg-slate-50 p-3 rounded border border-slate-200'>
          <p className='text-xs text-slate-500 uppercase'>Grupos distintos</p>
          <p className='text-xl font-semibold text-slate-800'>{totalGroups}</p>
        </div>
        <div className='bg-slate-50 p-3 rounded border border-slate-200'>
          <p className='text-xs text-slate-500 uppercase'>Diferentes piezas</p>
          <p className='text-xl font-semibold text-slate-800'>{groups.length}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className='text-sm text-slate-500'>No hay piezas para agrupar.</p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-100 text-slate-700'>
              <tr>
                <th className='p-2 text-left'>Dimensiones</th>
                <th className='p-2 text-left'>Espesor</th>
                <th className='p-2 text-left'>Cantidad total</th>
                <th className='p-2 text-left'>Nombres</th>
                <th className='p-2 text-left'>Colores</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className='border-b border-gray-100'>
                  <td className='p-2'>{g.ancho.toFixed(1)} x {g.alto.toFixed(1)} cm</td>
                  <td className='p-2'>{g.espesor} mm</td>
                  <td className='p-2 font-medium'>{g.cantidad}</td>
                  <td className='p-2'>{g.nombres.join(', ')}</td>
                  <td className='p-2'>
                    <div className='flex gap-1'>
                      {g.colores.map((c, i) => (
                        <div key={i} className='w-4 h-4 rounded border' style={{ backgroundColor: c }} title={c} />
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
