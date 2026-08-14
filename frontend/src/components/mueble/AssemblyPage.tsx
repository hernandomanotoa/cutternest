import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { AssemblyPiece3D, AssemblyResponse } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { Link } from 'react-router-dom'
import { Assembly3D } from './Assembly3D'

export function AssemblyPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [response, setResponse] = useState<AssemblyResponse | null>(null)
  const [current, setCurrent] = useState(0)
  const [showComplete, setShowComplete] = useState(false)

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/assembly`)
      .then((res) => setResponse(res.data))
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar ensamblaje'))
  }, [projectId])

  if (!response || response.pasos.length === 0) {
    return <div className='p-8 text-center text-slate-600'>Cargando ensamblaje...</div>
  }

  const steps = response.pasos
  const step = steps[current]
  const totalTime = steps.reduce((sum, s) => sum + s.tiempo_estimado_min, 0)

  const accumulatedPieces = useMemo<AssemblyPiece3D[]>(() => {
    if (showComplete) return response.vista_completa
    const pieces: AssemblyPiece3D[] = []
    for (let i = 0; i <= current; i++) {
      pieces.push(...steps[i].piezas_3d)
    }
    return pieces
  }, [response, steps, current, showComplete])

  const highlightedIds = showComplete ? [] : step.piezas_3d.map((p) => p.id)

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-5xl mx-auto space-y-6'>
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-slate-800'>Ensamblaje</h1>
          <Link to='/projects' className='btn-secondary'>Volver</Link>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <div className='lg:col-span-2 space-y-4'>
            <div className='flex items-center gap-2 flex-wrap'>
              <button
                onClick={() => setShowComplete(false)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${!showComplete ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Paso a paso
              </button>
              <button
                onClick={() => setShowComplete(true)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${showComplete ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Vista completa
              </button>
            </div>
            <Assembly3D pieces={accumulatedPieces} highlightedIds={highlightedIds} />
          </div>

          <div className='space-y-6'>
            <div className='card'>
              <div className='flex items-center justify-between mb-4'>
                <h2 className='text-lg font-semibold'>Paso {step.numero}: {step.titulo}</h2>
                <span className='text-sm text-slate-500'>{current + 1} / {steps.length}</span>
              </div>
              <p className='text-sm text-slate-600 mb-4'>{step.descripcion}</p>
              <div className='mb-4'>
                <p className='text-xs font-medium text-slate-500 uppercase mb-1'>Piezas en este paso</p>
                <div className='flex flex-wrap gap-2'>
                  {step.piezas_3d.map((p) => (
                    <span key={p.id} className='inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-sm text-slate-700'>
                      <span className='w-3 h-3 rounded' style={{ backgroundColor: p.color }} />
                      {p.nombre}
                    </span>
                  ))}
                </div>
              </div>
              <div className='mb-4'>
                <p className='text-xs font-medium text-slate-500 uppercase mb-1'>Herramientas</p>
                <p className='text-sm text-slate-600'>{step.herramientas.join(', ')}</p>
              </div>
              <p className='text-sm text-slate-600'>Tiempo estimado: <span className='font-medium'>{step.tiempo_estimado_min} min</span></p>
            </div>

            <div className='card'>
              <p className='text-xs font-medium text-slate-500 uppercase mb-2'>Resumen</p>
              <p className='text-sm text-slate-600'>Pasos: <span className='font-medium'>{steps.length}</span></p>
              <p className='text-sm text-slate-600'>Tiempo total estimado: <span className='font-medium'>{totalTime} min</span></p>
              <p className='text-sm text-slate-600'>Piezas totales: <span className='font-medium'>{response.vista_completa.length}</span></p>
            </div>

            <div className='flex gap-3'>
              <button disabled={current === 0} onClick={() => { setShowComplete(false); setCurrent(current - 1) }} className='btn-secondary disabled:opacity-50'>Anterior</button>
              <button disabled={current === steps.length - 1} onClick={() => { setShowComplete(false); setCurrent(current + 1) }} className='btn-primary disabled:opacity-50'>Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
