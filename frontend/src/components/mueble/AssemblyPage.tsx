import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { AssemblyStep } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'

export function AssemblyPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [steps, setSteps] = useState<AssemblyStep[]>([])
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/assembly`)
      .then((response) => setSteps(response.data.pasos))
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar ensamblaje'))
  }, [projectId])

  if (steps.length === 0) {
    return <div className='p-8 text-center text-slate-600'>Cargando ensamblaje...</div>
  }

  const step = steps[current]

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-2xl font-bold text-slate-800 mb-6'>Ensamblaje</h1>
        <div className='card mb-6'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-lg font-semibold'>Paso {step.numero}: {step.titulo}</h2>
            <span className='text-sm text-slate-500'>{current + 1} / {steps.length}</span>
          </div>
          <p className='text-sm text-slate-600 mb-2'>Piezas: {step.piezas.join(', ')}</p>
          <p className='text-sm text-slate-600 mb-2'>Herramientas: {step.herramientas.join(', ')}</p>
          <p className='text-sm text-slate-600'>Tiempo estimado: {step.tiempo_estimado_min} min</p>
        </div>
        <div className='flex gap-3'>
          <button disabled={current === 0} onClick={() => setCurrent(current - 1)} className='btn-secondary disabled:opacity-50'>Anterior</button>
          <button disabled={current === steps.length - 1} onClick={() => setCurrent(current + 1)} className='btn-primary disabled:opacity-50'>Siguiente</button>
        </div>
      </div>
    </div>
  )
}
