import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { FileText } from 'lucide-react'
import type { PieceInput } from '../../types'
import { api } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'
import { CATEGORIAS_CANTO, clasificarCantos } from '../../utils/cantoClasificacion'
import { Button } from '../ui/Button'

/**
 * Sección «Clasificación de cantos» DENTRO de la pestaña Conteo (no toca
 * la tabla de conteo: columnas, dimensiones, cantidades ni nombres). Las
 * 9 categorías del taller con unidades y metros lineales de tapacanto.
 */
export function ClasificacionCantos({ pieces, projectId }: { pieces: PieceInput[]; projectId: string | null }) {
  const { filas, totalMetros, totalUnidades } = useMemo(() => clasificarCantos(pieces), [pieces])

  const exportarPdf = async () => {
    if (!projectId) return
    try {
      const response = await api.post(`/projects/${projectId}/cantos/pdf`)
      const path = (response.data as { pdf_path?: string }).pdf_path
      if (path) {
        window.open(path, '_blank')
        toast.success('Clasificación de cantos generada')
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al generar PDF')
    }
  }

  return (
    <div className='mt-4 rounded-md border border-border'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2'>
        <h3 className='text-sm font-semibold text-foreground'>Clasificación de cantos</h3>
        <Button variant='outline' size='sm' onClick={exportarPdf} disabled={!projectId} leftIcon={<FileText className='h-4 w-4' />}>
          PDF cantos
        </Button>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th className='p-2 text-left font-medium'>Categoría</th>
              <th className='p-2 text-left font-medium'>Medidas (mm)</th>
              <th className='p-2 text-left font-medium'>Cantos</th>
              <th className='p-2 text-right font-medium'>Und.</th>
              <th className='p-2 text-right font-medium'>Metros lineales</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {CATEGORIAS_CANTO.map((nombre, cat) => {
              const delGrupo = filas.filter((f) => f.categoria === cat)
              const unidades = delGrupo.reduce((s, f) => s + f.unidades, 0)
              const metros = delGrupo.reduce((s, f) => s + f.metros, 0)
              if (!delGrupo.length) {
                return (
                  <tr key={nombre} className='text-muted-foreground/60'>
                    <td className='p-2'>{nombre}</td>
                    <td className='p-2'>—</td>
                    <td className='p-2'>—</td>
                    <td className='p-2 text-right'>0</td>
                    <td className='p-2 text-right'>0.00</td>
                  </tr>
                )
              }
              return delGrupo.map((f, i) => (
                <tr key={`${nombre}-${f.medidas}-${f.cantos}`} className={i === 0 ? '' : 'text-muted-foreground'}>
                  {i === 0 && (
                    <td className='p-2 align-top font-medium text-foreground' rowSpan={delGrupo.length}>
                      {nombre}
                      <span className='ml-1 text-xs text-muted-foreground'>
                        ({unidades} und · {metros.toFixed(2)} m)
                      </span>
                    </td>
                  )}
                  <td className='p-2'>{f.medidas} <span className='text-xs text-muted-foreground'>×{f.espesor} mm</span></td>
                  <td className='p-2 font-mono text-xs'>{f.cantos || '—'}</td>
                  <td className='p-2 text-right'>{f.unidades}</td>
                  <td className='p-2 text-right'>{f.metros.toFixed(2)}</td>
                </tr>
              ))
            })}
            <tr className='border-t-2 border-border bg-muted/40 font-semibold text-foreground'>
              <td className='p-2' colSpan={3}>Total</td>
              <td className='p-2 text-right'>{totalUnidades}</td>
              <td className='p-2 text-right'>{totalMetros.toFixed(2)} m</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
