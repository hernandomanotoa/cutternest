import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { API_BASE_URL } from '../../api/client'
import type { BoardResult } from '../../types'
import { Button } from '../ui/Button'

export interface PresentationSheetProps {
  projectName: string
  projectId: string
  boards: BoardResult[]
  /** Piezas totales del lote (suma de cantidades). */
  totalPieces: number
  /** Precio del tablero por m²; 0 o negativo oculta el costo estimado. */
  precioM2: number
  onClose: () => void
}

// Hoja de presentación comercial: nombre del proyecto, fecha, imagen de cada
// tablero y tabla resumen. Se imprime con window.print(); el portal a
// document.body + la clase cn-printing en <body> aislan la hoja del resto
// de la app en @media print (index.css).
export function PresentationSheet({
  projectName,
  projectId,
  boards,
  totalPieces,
  precioM2,
  onClose,
}: PresentationSheetProps) {
  useEffect(() => {
    document.body.classList.add('cn-printing')
    return () => document.body.classList.remove('cn-printing')
  }, [])

  const fecha = new Date().toLocaleDateString('es', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const avgUtilization = boards.length
    ? Math.round(boards.reduce((sum, b) => sum + b.utilizacion, 0) / boards.length)
    : 0
  const areaM2 = boards.reduce((sum, b) => sum + (b.ancho * b.alto) / 1_000_000, 0)
  const costo = precioM2 > 0 ? Math.round(areaM2 * precioM2) : null

  return createPortal(
    <div className='cn-presentation-sheet fixed inset-0 z-[100] overflow-y-auto bg-background'>
      <div className='sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-background/95 p-2 print:hidden'>
        <Button variant='outline' size='sm' onClick={() => window.print()} leftIcon={<Printer className='h-4 w-4' />}>
          Imprimir
        </Button>
        <Button variant='ghost' size='icon' onClick={onClose} aria-label='Cerrar presentación'>
          <X className='h-4 w-4' />
        </Button>
      </div>

      <div className='mx-auto max-w-3xl space-y-8 p-8'>
        <header className='space-y-1'>
          <p className='text-xs uppercase tracking-wide text-muted-foreground'>Presentación</p>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>{projectName}</h1>
          <p className='text-sm text-muted-foreground'>{fecha}</p>
        </header>

        <section className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
          <div className='rounded-md border border-border p-3'>
            <p className='text-xs text-muted-foreground'>Piezas</p>
            <p className='text-xl font-bold text-foreground'>{totalPieces}</p>
          </div>
          <div className='rounded-md border border-border p-3'>
            <p className='text-xs text-muted-foreground'>Tableros</p>
            <p className='text-xl font-bold text-foreground'>{boards.length}</p>
          </div>
          <div className='rounded-md border border-border p-3'>
            <p className='text-xs text-muted-foreground'>Aprovechamiento prom.</p>
            <p className='text-xl font-bold text-foreground'>{avgUtilization}%</p>
          </div>
          {costo !== null && (
            <div className='rounded-md border border-border p-3'>
              <p className='text-xs text-muted-foreground'>Costo estimado</p>
              <p className='text-xl font-bold text-foreground'>${costo.toLocaleString('es')}</p>
            </div>
          )}
        </section>

        <section className='space-y-6'>
          {boards.map((b) => (
            <figure key={b.board_index} className='break-inside-avoid space-y-2'>
              <img
                src={`${API_BASE_URL}/projects/${projectId}/layouts/${b.board_index}/png`}
                alt={`Layout del tablero ${b.board_index + 1}`}
                className='w-full rounded-md border border-border'
              />
              <figcaption className='text-sm text-muted-foreground'>
                Tablero {b.board_index + 1} · {b.ancho}×{b.alto} mm · {b.utilizacion}% de aprovechamiento
              </figcaption>
            </figure>
          ))}
        </section>

        <footer className='border-t border-border pt-4 text-center text-sm text-muted-foreground'>
          CutterNest
        </footer>
      </div>
    </div>,
    document.body
  )
}
