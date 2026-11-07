import { useState } from 'react'
import toast from 'react-hot-toast'
import { Scan, Save } from 'lucide-react'
import { api } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'
import { Button } from '../ui/Button'

export interface OffcutCandidate {
  x: number
  y: number
  ancho: number
  alto: number
}

// SHAPE asumido del endpoint (backend-agent):
//   GET  /projects/{id}/layouts/{index}/offcuts
//        → { sobrantes: [{x, y, ancho, alto, area_m2}] }        (backend real)
//   POST /projects/{id}/layouts/{index}/offcuts?registrar=true
//        → { sobrantes: [...], offcut_ids: [id, ...] }          (backend real)
// Se aceptan también los alias `offcuts`/`registrados` (contrato temprano).
// Defensivo: tolera campos alternos (w/h, width_mm/height_mm) y respuestas
// sin `registrados`; un 404 se informa sin romper (backend aún no desplegado).
interface OffcutRegistrarProps {
  projectId: string
  boardIndex: number
}

function normalizar(raw: unknown): OffcutCandidate[] {
  if (!Array.isArray(raw)) return []
  const lista: OffcutCandidate[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const ancho = Number(o.ancho ?? o.w ?? o.width_mm)
    const alto = Number(o.alto ?? o.h ?? o.height_mm)
    const x = Number(o.x ?? 0)
    const y = Number(o.y ?? 0)
    if (Number.isFinite(ancho) && Number.isFinite(alto) && ancho > 0 && alto > 0) {
      lista.push({ x, y, ancho, alto })
    }
  }
  return lista
}

export function OffcutRegistrar({ projectId, boardIndex }: OffcutRegistrarProps) {
  const [candidatos, setCandidatos] = useState<OffcutCandidate[] | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [registrando, setRegistrando] = useState(false)

  const url = `/projects/${projectId}/layouts/${boardIndex}/offcuts`

  const detectar = async () => {
    setLoading(true)
    try {
      const response = await api.get(url)
      const data = response.data as { sobrantes?: unknown; offcuts?: unknown }
      const lista = normalizar(data.sobrantes ?? data.offcuts)
      setCandidatos(lista)
      setSeleccionados(new Set(lista.map((_, i) => i)))
      if (!lista.length) {
        toast('No se detectaron sobrantes en este tablero')
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        toast('El detector de sobrantes aún no está disponible en el backend')
      } else {
        toast.error(getApiErrorMessage(err) || 'Error al detectar sobrantes')
      }
    } finally {
      setLoading(false)
    }
  }

  const toggle = (i: number) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const registrar = async () => {
    if (!candidatos) return
    const elegidos = candidatos.filter((_, i) => seleccionados.has(i))
    setRegistrando(true)
    try {
      const response = await api.post(url, { offcuts: elegidos }, { params: { registrar: true } })
      const data = response.data as { offcut_ids?: unknown; registrados?: unknown }
      const ids = data.offcut_ids ?? data.registrados
      const texto = Array.isArray(ids) && ids.length ? `: ${ids.join(', ')}` : ` (${elegidos.length})`
      toast.success(`Sobrantes registrados${texto}`)
      setCandidatos(null)
      setSeleccionados(new Set())
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al registrar sobrantes')
    } finally {
      setRegistrando(false)
    }
  }

  return (
    <div className='rounded-md border border-border bg-muted/30 p-3 space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={detectar}
          isLoading={loading}
          leftIcon={<Scan className='h-4 w-4' />}
        >
          Detectar sobrantes
        </Button>
        <span className='text-xs text-muted-foreground'>
          Busca rectángulos libres del tablero {boardIndex + 1} para devolverlos al inventario.
        </span>
      </div>

      {candidatos && candidatos.length > 0 && (
        <div className='space-y-2'>
          <ul className='flex flex-wrap gap-2'>
            {candidatos.map((c, i) => (
              <li key={`${c.x}-${c.y}-${c.ancho}-${c.alto}`}>
                <label className='flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground'>
                  <input
                    type='checkbox'
                    checked={seleccionados.has(i)}
                    onChange={() => toggle(i)}
                    className='h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring'
                  />
                  {c.ancho}×{c.alto} mm
                </label>
              </li>
            ))}
          </ul>
          <Button
            size='sm'
            onClick={registrar}
            disabled={seleccionados.size === 0 || registrando}
            isLoading={registrando}
            leftIcon={<Save className='h-4 w-4' />}
          >
            Registrar seleccionados ({seleccionados.size})
          </Button>
        </div>
      )}
    </div>
  )
}
