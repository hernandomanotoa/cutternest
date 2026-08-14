import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type {
  AssemblyPiece3D,
  AssemblyResponse,
  AssemblyValidationResult,
  Transform3D,
} from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { Link } from 'react-router-dom'
import { Assembly3D } from './Assembly3D'
import { Assembly3DV2 } from './Assembly3DV2'

const SNAP_THRESHOLD_CM = 2.0

function buildInitialTransforms(pieces: AssemblyPiece3D[]): Record<string, Transform3D> {
  const map: Record<string, Transform3D> = {}
  for (const p of pieces) {
    map[p.id] = { position: p.posicion, rotation: p.rotacion }
  }
  return map
}

export function AssemblyPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [response, setResponse] = useState<AssemblyResponse | null>(null)
  const [current, setCurrent] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [assemblyView, setAssemblyView] = useState<'v1' | 'v2'>('v2')
  const [exploded, setExploded] = useState(false)
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [currentTransforms, setCurrentTransforms] = useState<Record<string, Transform3D>>({})
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate')
  const [validation, setValidation] = useState<AssemblyValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [completing, setCompleting] = useState(false)

  const loadAssembly = useCallback(() => {
    if (!projectId) return
    api
      .get(`/projects/${projectId}/assembly`)
      .then((res) => {
        const data = res.data as AssemblyResponse
        setResponse(data)
        setCurrentTransforms(buildInitialTransforms(data.vista_completa ?? []))
        setValidation(null)
      })
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar ensamblaje'))
  }, [projectId])

  useEffect(() => {
    loadAssembly()
  }, [loadAssembly])

  const steps = response?.pasos ?? []
  const step = steps[current] ?? null

  const activePieceIds = useMemo(() => new Set(step?.piezas_3d.map((p) => p.id) ?? []), [step])

  const selectedPiece = useMemo(() => {
    if (!selectedPieceId) return null
    return response?.vista_completa.find((p) => p.id === selectedPieceId) ?? null
  }, [selectedPieceId, response])

  const selectedExpected = useMemo(() => {
    if (!selectedPieceId) return null
    return response?.pieces.find((p) => p.codigo === selectedPieceId) ?? null
  }, [selectedPieceId, response])

  const totalTime = useMemo(() => steps.reduce((sum, s) => sum + s.tiempo_estimado_min, 0), [steps])

  const accumulatedPieces = useMemo<AssemblyPiece3D[]>(() => {
    if (!response) return []
    if (showComplete) return response.vista_completa ?? []
    const pieces: AssemblyPiece3D[] = []
    for (let i = 0; i <= current; i++) {
      if (steps[i]) pieces.push(...steps[i].piezas_3d)
    }
    return pieces
  }, [response, steps, current, showComplete])

  const accumulatedConnectors = useMemo(() => {
    if (!response) return []
    if (showComplete) return response.conectores_completos ?? []
    const connectors = []
    for (let i = 0; i <= current; i++) {
      if (steps[i]) connectors.push(...steps[i].conectores)
    }
    return connectors
  }, [response, steps, current, showComplete])

  const highlightedIds = useMemo(() => {
    if (showComplete || !step) return []
    return step.piezas_3d.map((p) => p.id)
  }, [showComplete, step])

  const handleSelectPiece = useCallback(
    (id: string | null) => {
      if (id && !activePieceIds.has(id)) {
        toast('Selecciona una pieza del paso actual')
        return
      }
      setSelectedPieceId(id)
      setValidation(null)
    },
    [activePieceIds],
  )

  const handleTransformEnd = useCallback((id: string, transform: Transform3D) => {
    setCurrentTransforms((prev) => ({ ...prev, [id]: transform }))
    setValidation(null)
  }, [])

  const handleResetSelected = useCallback(() => {
    if (!selectedPieceId || !response) return
    const piece = response.pieces.find((p) => p.codigo === selectedPieceId)
    if (!piece) return
    setCurrentTransforms((prev) => ({
      ...prev,
      [selectedPieceId]: {
        position: piece.posicion_esperada,
        rotation: piece.rotacion_esperada,
      },
    }))
    toast.success('Pieza reposicionada')
  }, [selectedPieceId, response])

  const stepPieceUpdates = useMemo(() => {
    if (!step) return {}
    const updates: Record<string, Transform3D> = {}
    for (const p of step.piezas_3d) {
      updates[p.id] = currentTransforms[p.id] ?? { position: p.posicion, rotation: p.rotacion }
    }
    return updates
  }, [step, currentTransforms])

  const handleValidate = useCallback(async () => {
    if (!projectId || !step) return
    setValidating(true)
    try {
      const res = await api.post(`/projects/${projectId}/assembly/steps/${step.id}/validate`, {
        piece_transforms: stepPieceUpdates,
      })
      setValidation(res.data as AssemblyValidationResult)
      if (res.data.valid) {
        toast.success('Paso validado correctamente')
      } else {
        toast.error('Hay piezas fuera de tolerancia')
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Error al validar paso')
    } finally {
      setValidating(false)
    }
  }, [projectId, step, stepPieceUpdates])

  const handleCompleteStep = useCallback(async () => {
    if (!projectId || !step) return
    setCompleting(true)
    try {
      await api.post(`/projects/${projectId}/assembly/steps/${step.id}/progress`, {
        piece_updates: stepPieceUpdates,
        status: 'ALIGNED',
      })
      toast.success('Paso completado')
      loadAssembly()
      if (current < steps.length - 1) {
        setCurrent((c) => c + 1)
        setSelectedPieceId(null)
      } else {
        setShowComplete(true)
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Error al guardar progreso')
    } finally {
      setCompleting(false)
    }
  }, [projectId, step, stepPieceUpdates, loadAssembly, current, steps.length])

  if (!response || response.pasos.length === 0) {
    return <div className='p-8 text-center text-slate-600'>Cargando ensamblaje...</div>
  }

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-6xl mx-auto space-y-6'>
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
              <button
                onClick={() => setAssemblyView('v1')}
                className={`px-3 py-1.5 rounded text-sm font-medium ${assemblyView === 'v1' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Ensamblaje 1
              </button>
              <button
                onClick={() => setAssemblyView('v2')}
                className={`px-3 py-1.5 rounded text-sm font-medium ${assemblyView === 'v2' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Ensamblaje 2
              </button>
              {assemblyView === 'v2' && (
                <>
                  <button
                    onClick={() => setExploded(!exploded)}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${exploded ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {exploded ? 'Vista normal' : 'Vista despiece'}
                  </button>
                  <button
                    onClick={() => setSnapEnabled(!snapEnabled)}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${snapEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {snapEnabled ? 'Snap ON' : 'Snap OFF'}
                  </button>
                  <button
                    onClick={() => setTransformMode((m) => (m === 'translate' ? 'rotate' : 'translate'))}
                    className='px-3 py-1.5 rounded text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200'
                  >
                    {transformMode === 'translate' ? 'Mover' : 'Rotar'}
                  </button>
                </>
              )}
            </div>
            {assemblyView === 'v1' ? (
              <Assembly3D pieces={accumulatedPieces} highlightedIds={highlightedIds} />
            ) : (
              <Assembly3DV2
                pieces={accumulatedPieces}
                expectedPieces={response.pieces}
                connectors={accumulatedConnectors}
                highlightedIds={highlightedIds}
                selectedId={selectedPieceId}
                currentTransforms={currentTransforms}
                transformMode={transformMode}
                snap={snapEnabled}
                snapThreshold={SNAP_THRESHOLD_CM}
                exploded={exploded}
                onSelectPiece={handleSelectPiece}
                onTransformEnd={handleTransformEnd}
              />
            )}
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
                    <button
                      key={p.id}
                      onClick={() => handleSelectPiece(p.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${selectedPieceId === p.id ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-500' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <span className='w-3 h-3 rounded' style={{ backgroundColor: p.color }} />
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div className='mb-4'>
                <p className='text-xs font-medium text-slate-500 uppercase mb-1'>Conectores en este paso</p>
                <div className='flex flex-wrap gap-2'>
                  {step.conectores.length === 0 ? (
                    <span className='text-sm text-slate-500'>Ninguno</span>
                  ) : (
                    step.conectores.map((c, i) => (
                      <span key={i} className='px-2 py-1 bg-slate-100 rounded text-sm text-slate-700'>
                        {c.tipo}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className='mb-4'>
                <p className='text-xs font-medium text-slate-500 uppercase mb-1'>Herramientas</p>
                <p className='text-sm text-slate-600'>{step.herramientas.join(', ')}</p>
              </div>
              <p className='text-sm text-slate-600'>Tiempo estimado: <span className='font-medium'>{step.tiempo_estimado_min} min</span></p>
            </div>

            {selectedPiece && (
              <div className='card'>
                <h3 className='text-sm font-semibold text-slate-800 mb-2'>Pieza seleccionada</h3>
                <p className='text-sm text-slate-600 mb-1'>{selectedPiece.nombre}</p>
                <p className='text-xs text-slate-500 mb-3'>Código: {selectedPiece.id}</p>
                <div className='grid grid-cols-3 gap-2 text-xs mb-3'>
                  <div>
                    <span className='text-slate-500'>X</span>
                    <p className='font-medium'>{currentTransforms[selectedPiece.id]?.position.x.toFixed(1) ?? selectedPiece.posicion.x.toFixed(1)} cm</p>
                  </div>
                  <div>
                    <span className='text-slate-500'>Y</span>
                    <p className='font-medium'>{currentTransforms[selectedPiece.id]?.position.y.toFixed(1) ?? selectedPiece.posicion.y.toFixed(1)} cm</p>
                  </div>
                  <div>
                    <span className='text-slate-500'>Z</span>
                    <p className='font-medium'>{currentTransforms[selectedPiece.id]?.position.z.toFixed(1) ?? selectedPiece.posicion.z.toFixed(1)} cm</p>
                  </div>
                </div>
                {selectedExpected && (
                  <button onClick={handleResetSelected} className='w-full btn-secondary text-sm'>
                    Corregir posición
                  </button>
                )}
              </div>
            )}

            <div className='card'>
              <p className='text-xs font-medium text-slate-500 uppercase mb-2'>Resumen</p>
              <p className='text-sm text-slate-600'>Pasos: <span className='font-medium'>{steps.length}</span></p>
              <p className='text-sm text-slate-600'>Tiempo total estimado: <span className='font-medium'>{totalTime} min</span></p>
              <p className='text-sm text-slate-600'>Piezas totales: <span className='font-medium'>{response.vista_completa.length}</span></p>
              <p className='text-sm text-slate-600'>Conectores totales: <span className='font-medium'>{response.conectores_completos.length}</span></p>
            </div>

            <div className='space-y-3'>
              <button
                onClick={handleValidate}
                disabled={validating}
                className='w-full btn-secondary disabled:opacity-50'
              >
                {validating ? 'Validando...' : 'Validar paso'}
              </button>
              <button
                onClick={handleCompleteStep}
                disabled={completing || (validation ? !validation.valid : false)}
                className='w-full btn-primary disabled:opacity-50'
              >
                {completing ? 'Guardando...' : 'Completar paso'}
              </button>
            </div>

            {validation && !validation.valid && (
              <div className='card border-l-4 border-amber-500'>
                <h3 className='text-sm font-semibold text-amber-700 mb-2'>Errores de validación</h3>
                <ul className='list-disc list-inside text-sm text-slate-700 space-y-1'>
                  {validation.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {Object.entries(validation.piece_results)
                  .filter(([, r]) => !r.valid)
                  .map(([code, r]) => (
                    <div key={code} className='mt-2 text-sm text-slate-700'>
                      <span className='font-medium'>{code}:</span>{' '}
                      {r.errors.join(', ')}
                    </div>
                  ))}
              </div>
            )}

            <div className='flex gap-3'>
              <button disabled={current === 0} onClick={() => { setShowComplete(false); setCurrent(current - 1); setSelectedPieceId(null); setValidation(null) }} className='btn-secondary disabled:opacity-50'>Anterior</button>
              <button disabled={current === steps.length - 1} onClick={() => { setShowComplete(false); setCurrent(current + 1); setSelectedPieceId(null); setValidation(null) }} className='btn-primary disabled:opacity-50'>Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
