import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Maximize2,
  Move,
  RotateCw,
  Settings2,
  Wrench,
} from 'lucide-react'
import { api } from '../../api/client'
import type {
  AssemblyPiece3D,
  AssemblyPieceState,
  AssemblyResponse,
  AssemblyStep,
  AssemblyValidationResult,
  Point3D,
  Transform3D,
} from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { useSelectionStore } from '../../stores/selectionStore'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Separator } from '../ui/Separator'
import { Assembly3DV2, getModuleColor } from './Assembly3DV2'
import { StepTimeline } from './StepTimeline'
import { LevelTimeline } from './LevelTimeline'
import { ExplodeControl } from './ExplodeControl'
import { AssemblyPlanner } from './AssemblyPlanner'
import { AssemblyManual } from './AssemblyManual'

const SNAP_THRESHOLD_MM = 2.0
const POSITION_TOLERANCE_MM = 2
const ROTATION_TOLERANCE_DEG = 5

function distanceMm(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function rotationDiffDeg(a: Point3D, b: Point3D): number {
  const normalize = (deg: number) => {
    let v = deg % 360
    if (v < 0) v += 360
    if (v > 180) v -= 360
    return v
  }
  const dx = Math.abs(normalize(a.x - b.x))
  const dy = Math.abs(normalize(a.y - b.y))
  const dz = Math.abs(normalize(a.z - b.z))
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function buildInitialTransforms(
  pieces: AssemblyPiece3D[],
  states: AssemblyPieceState[],
): Record<string, Transform3D> {
  const stateByCode = new Map(states.map((p) => [p.codigo, p]))
  const map: Record<string, Transform3D> = {}
  for (const p of pieces) {
    const state = stateByCode.get(p.id)
    map[p.id] = {
      position: state?.posicion_actual ?? p.posicion,
      rotation: state?.rotacion_actual ?? p.rotacion,
    }
  }
  return map
}

interface ValidationDetail {
  code: string
  valid: boolean
  deltaPosMm: number
  deltaRotDeg: number
  errors: string[]
}

function computeValidationDetails(
  validation: AssemblyValidationResult | null,
  step: AssemblyStep | null,
  currentTransforms: Record<string, Transform3D>,
  expectedPieces: AssemblyPieceState[],
): ValidationDetail[] {
  if (!step || !validation) return []
  const expectedByCode = new Map(expectedPieces.map((p) => [p.codigo, p]))
  return step.piezas_3d.map((p) => {
    const expected = expectedByCode.get(p.id)
    const current = currentTransforms[p.id] ?? { position: p.posicion, rotation: p.rotacion }
    const deltaPosMm = expected ? distanceMm(current.position, expected.posicion_esperada) : 0
    const deltaRotDeg = expected ? rotationDiffDeg(current.rotation, expected.rotacion_esperada) : 0
    const apiResult = validation.piece_results[p.id]
    const withinTolerance = deltaPosMm <= POSITION_TOLERANCE_MM && deltaRotDeg <= ROTATION_TOLERANCE_DEG
    return {
      code: p.id,
      valid: apiResult?.valid ?? withinTolerance,
      deltaPosMm,
      deltaRotDeg,
      errors: apiResult?.errors ?? [],
    }
  })
}

export function AssemblyPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [response, setResponse] = useState<AssemblyResponse | null>(null)
  const [current, setCurrent] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [explodeFactor, setExplodeFactor] = useState(0)
  const [currentTransforms, setCurrentTransforms] = useState<Record<string, Transform3D>>({})
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate')
  const [validation, setValidation] = useState<AssemblyValidationResult | null>(null)
  const [validationDetails, setValidationDetails] = useState<ValidationDetail[]>([])
  const [validating, setValidating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraResetKey, setCameraResetKey] = useState(0)
  const [mode, setMode] = useState<'assistant' | 'preview' | 'planner'>('preview')
  const [showHelp, setShowHelp] = useState(true)
  const [levelsOpen, setLevelsOpen] = useState(true)

  const [pdfLoading, setPdfLoading] = useState(false)

  const { selectedPieceCode, setSelectedPieceCode, clearSelection } = useSelectionStore()

  const handleGenerateAssemblyPdf = useCallback(async () => {
    if (!projectId) return
    setPdfLoading(true)
    try {
      const res = await api.post(`/projects/${projectId}/assembly/pdf`)
      const path = (res.data as { pdf_path?: string }).pdf_path
      if (path) {
        window.open(path, '_blank')
        toast.success('Manual de ensamblaje generado')
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Error al generar manual')
    } finally {
      setPdfLoading(false)
    }
  }, [projectId])

  const loadAssembly = useCallback(() => {
    if (!projectId) return
    setError(null)
    api
      .get(`/projects/${projectId}/assembly`)
      .then((res) => {
        const data = res.data as AssemblyResponse
        setResponse(data)
        setCurrentTransforms(buildInitialTransforms(data.vista_completa ?? [], data.pieces ?? []))
        setValidation(null)
        setValidationDetails([])

        const completed = new Set(data.state?.completed_step_ids ?? [])
        const currentId = data.state?.current_step_id
        let index = 0
        if (currentId) {
          index = data.pasos.findIndex((s) => s.id === currentId)
          if (index < 0) index = 0
        } else {
          const next = data.pasos.findIndex((s) => !completed.has(s.id))
          if (next >= 0) index = next
        }
        setCurrent(index)
      })
      .catch((err) => {
        const msg = getApiErrorMessage(err) || 'Error al cargar ensamblaje'
        setError(msg)
        toast.error(msg)
      })
  }, [projectId])

  const handleSavePlan = useCallback(
    async (dependencies: Array<[string, string]>) => {
      if (!projectId) return
      try {
        await api.post(`/projects/${projectId}/assembly/plan`, {
          dependencies,
          save: true,
        })
        toast.success('Plan de ensamblaje guardado')
        loadAssembly()
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Error al guardar el plan')
      }
    },
    [projectId, loadAssembly]
  )

  const handleSimulateLevel = useCallback(
    (levelIndex: number) => {
      if (!response?.levels || !response.pasos.length) return
      const levelPieces = new Set(response.levels[levelIndex] ?? [])
      const stepIndex = response.pasos.findIndex((s) =>
        s.piezas.some((code) => levelPieces.has(code))
      )
      if (stepIndex >= 0) {
        setMode('assistant')
        setCurrent(stepIndex)
        clearSelection()
        setValidation(null)
        setValidationDetails([])
        setShowComplete(false)
        toast(`Simulando nivel ${levelIndex + 1}`)
      } else {
        toast.error('No hay un paso asociado a ese nivel')
      }
    },
    [response?.levels, response?.pasos, clearSelection]
  )

  useEffect(() => {
    loadAssembly()
  }, [loadAssembly])

  const steps = response?.pasos ?? []
  const step = steps[current] ?? null

  const currentLevelIndex = useMemo(() => {
    if (!step || !response?.levels) return -1
    const stepCodes = new Set(step.piezas)
    return response.levels.findIndex((level) => level.some((code) => stepCodes.has(code)))
  }, [step, response?.levels])

  const activePieceIds = useMemo(() => {
    if (mode === 'preview') return new Set(response?.vista_completa.map((p) => p.id) ?? [])
    return new Set(step?.piezas_3d.map((p) => p.id) ?? [])
  }, [mode, response?.vista_completa, step])

  const selectedPiece = useMemo(() => {
    if (!selectedPieceCode) return null
    return response?.vista_completa.find((p) => p.id === selectedPieceCode) ?? null
  }, [selectedPieceCode, response])

  const selectedExpected = useMemo(() => {
    if (!selectedPieceCode) return null
    return response?.pieces.find((p) => p.codigo === selectedPieceCode) ?? null
  }, [selectedPieceCode, response])

  const moduleLegend = useMemo(() => {
    if (!response) return []
    const map = new Map<string, number>()
    for (const p of response.vista_completa) {
      if (p.modulo) map.set(p.modulo, (map.get(p.modulo) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [response])

  const totalTime = useMemo(
    () => steps.reduce((sum, s) => sum + s.tiempo_estimado_min, 0),
    [steps],
  )

  const accumulatedPieces = useMemo<AssemblyPiece3D[]>(() => {
    if (!response) return []
    if (showComplete || mode === 'preview') return response.vista_completa ?? []
    const pieces: AssemblyPiece3D[] = []
    for (let i = 0; i <= current; i++) {
      if (steps[i]) pieces.push(...steps[i].piezas_3d)
    }
    return pieces
  }, [response, steps, current, showComplete, mode])

  const accumulatedConnectors = useMemo(() => {
    if (!response) return []
    if (showComplete || mode === 'preview') return response.conectores_completos ?? []
    const connectors: typeof response.conectores_completos = []
    for (let i = 0; i <= current; i++) {
      if (steps[i]) connectors.push(...steps[i].conectores)
    }
    return connectors
  }, [response, steps, current, showComplete, mode])

  const pieceStates = useMemo(() => {
    if (mode !== 'assistant' || !response) return undefined
    const states: Record<string, 'active' | 'placed' | 'future'> = {}
    const currentIds = new Set(step?.piezas ?? [])
    const previousIds = new Set<string>()
    for (let i = 0; i < current; i++) {
      for (const id of steps[i]?.piezas ?? []) previousIds.add(id)
    }
    for (const p of response.vista_completa) {
      if (currentIds.has(p.id)) states[p.id] = 'active'
      else if (previousIds.has(p.id)) states[p.id] = 'placed'
      else states[p.id] = 'future'
    }
    return states
  }, [mode, response, steps, current, step])

  const highlightedIds = useMemo(() => {
    if (showComplete || mode === 'preview' || !step) return []
    return step.piezas_3d.map((p) => p.id)
  }, [showComplete, step, mode])

  const handleSelectPiece = useCallback(
    (id: string | null) => {
      if (id && !activePieceIds.has(id) && !showComplete) {
        toast('Selecciona una pieza del paso actual')
        return
      }
      setSelectedPieceCode(id)
      setValidation(null)
      setValidationDetails([])
    },
    [activePieceIds, setSelectedPieceCode, showComplete],
  )

  const handleTransformEnd = useCallback((id: string, transform: Transform3D) => {
    setCurrentTransforms((prev) => ({ ...prev, [id]: transform }))
    setValidation(null)
    setValidationDetails([])
  }, [])

  const handleResetSelected = useCallback(() => {
    if (!selectedPieceCode || !selectedExpected) return
    setCurrentTransforms((prev) => ({
      ...prev,
      [selectedPieceCode]: {
        position: selectedExpected.posicion_esperada,
        rotation: selectedExpected.rotacion_esperada,
      },
    }))
    toast.success('Pieza reposicionada')
  }, [selectedPieceCode, selectedExpected])

  const handleAutoAlignStep = useCallback(() => {
    if (!step || !response?.pieces) return
    const updates: Record<string, Transform3D> = {}
    for (const p of step.piezas_3d) {
      const expected = response.pieces.find((ep) => ep.codigo === p.id)
      if (expected) {
        updates[p.id] = {
          position: expected.posicion_esperada,
          rotation: expected.rotacion_esperada,
        }
      }
    }
    if (Object.keys(updates).length === 0) {
      toast('Este paso no tiene piezas con posición esperada definida')
      return
    }
    setCurrentTransforms((prev) => ({ ...prev, ...updates }))
    toast.success(`${Object.keys(updates).length} pieza(s) colocadas automáticamente`)
    setValidation(null)
    setValidationDetails([])
  }, [step, response?.pieces])

  const handleStepChange = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return
      setCurrent(index)
      setShowComplete(false)
      clearSelection()
      setValidation(null)
      setValidationDetails([])
    },
    [steps.length, clearSelection],
  )

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
      const result = res.data as AssemblyValidationResult
      setValidation(result)
      const details = computeValidationDetails(result, step, currentTransforms, response?.pieces ?? [])
      setValidationDetails(details)
      if (result.valid && details.every((d) => d.valid)) {
        toast.success('Paso validado correctamente')
      } else {
        toast.error('Hay piezas fuera de tolerancia')
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Error al validar paso')
    } finally {
      setValidating(false)
    }
  }, [projectId, step, stepPieceUpdates, currentTransforms, response])

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
        clearSelection()
        setValidation(null)
        setValidationDetails([])
      } else {
        setShowComplete(true)
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Error al guardar progreso')
    } finally {
      setCompleting(false)
    }
  }, [projectId, step, stepPieceUpdates, loadAssembly, current, steps.length, clearSelection])

  if (error) {
    return (
      <div className='flex min-h-[50vh] flex-col items-center justify-center p-8 text-center'>
        <Card className='max-w-xl space-y-4 p-8'>
          <h2 className='text-xl font-bold text-foreground'>No se pudo cargar el ensamblaje</h2>
          <p className='text-muted-foreground'>{error}</p>
          <p className='text-sm text-muted-foreground'>
            Asegúrate de haber guardado u optimizado piezas en el proyecto. El ensamblaje se genera
            automáticamente desde las piezas del proyecto.
          </p>
          <div className='flex justify-center gap-3'>
            <Link to='/optimizer' state={{ projectId }} className='btn-primary'>
              Ir al optimizador
            </Link>
            <Button variant='secondary' onClick={loadAssembly}>
              Reintentar
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!response || response.pasos.length === 0) {
    return (
      <div className='flex min-h-[50vh] flex-col items-center justify-center p-8 text-center'>
        <Card className='max-w-xl space-y-4 p-8'>
          <h2 className='text-xl font-bold text-foreground'>Ensamblaje no disponible</h2>
          <p className='text-muted-foreground'>
            El proyecto no tiene piezas guardadas. Carga un CSV o agrega piezas en el optimizador y
            presiona "Guardar piezas".
          </p>
          <Link to='/optimizer' state={{ projectId }} className='btn-primary'>
            Ir al optimizador
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4 lg:h-[calc(100vh-5rem)]'>
      <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          {mode === 'preview' ? (
            <>
              <h1 className='text-2xl font-bold tracking-tight text-foreground'>Vista previa del mueble armado</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                Visualiza el proyecto completo, explota las piezas y revisa la lista de componentes.
              </p>
            </>
          ) : mode === 'planner' ? (
            <>
              <h1 className='text-2xl font-bold tracking-tight text-foreground'>Planificador de ensamblaje</h1>
              <p className='mt-1 text-sm text-muted-foreground'>
                Diseña las dependencias entre piezas. Clic en dos nodos para conectarlas; arrastra para
                organizar; guarda para regenerar los pasos.
              </p>
            </>
          ) : (
            <>
              <h1 className='text-2xl font-bold tracking-tight text-foreground'>Ensamblaje</h1>
              {step ? (
                <div className='mt-1 text-sm text-muted-foreground'>
                  <span className='font-medium text-foreground'>
                    Paso {step.numero}: {step.titulo}
                  </span>{' '}
                  — {step.descripcion}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex items-center rounded-md border bg-card p-0.5'>
            <Button
              variant={mode === 'assistant' ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setMode('assistant')}
            >
              <Settings2 className='mr-1.5 h-4 w-4' />
              Asistente
            </Button>
            <Button
              variant={mode === 'planner' ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setMode('planner')}
            >
              <Layers className='mr-1.5 h-4 w-4' />
              Planificador
            </Button>
            <Button
              variant={mode === 'preview' ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setMode('preview')}
            >
              <Maximize2 className='mr-1.5 h-4 w-4' />
              Vista previa
            </Button>
          </div>

          <Button
            variant='outline'
            size='sm'
            isLoading={pdfLoading}
            onClick={handleGenerateAssemblyPdf}
          >
            <FileText className='mr-1.5 h-4 w-4' />
            Manual PDF
          </Button>
          <AssemblyManual response={response} levels={response.levels} fileName={projectId} />

          <Button
            variant='outline'
            size='sm'
            onClick={() => window.open('/assembly-planner/', '_blank')}
            title='Abrir el nuevo Assembly Planner interactivo'
          >
            <ExternalLink className='mr-1.5 h-4 w-4' />
            Nuevo planner
          </Button>

          <Button variant='secondary' size='sm' asChild>
            <Link to='/projects'>Volver</Link>
          </Button>
        </div>
      </div>

      {showHelp && mode === 'assistant' && (
        <Card className='border border-primary/20 bg-primary/5'>
          ... (existing assistant help)
        </Card>
      )}

      {showHelp && mode === 'preview' && (
        <Card className='border border-success/20 bg-success/5'>
          <CardHeader className='pb-2'>
            <div className='flex items-start justify-between'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Info className='h-5 w-5 text-success' />
                Vista previa
              </CardTitle>
              <button
                onClick={() => setShowHelp(false)}
                className='text-sm text-muted-foreground hover:text-foreground'
              >
                Ocultar
              </button>
            </div>
          </CardHeader>
          <CardContent className='text-sm text-foreground'>
            <p className='text-muted-foreground'>
              Muestra el mueble completamente armado. Usa el slider <strong>Explosionar</strong> para separar las piezas y ver la estructura interna.
              Pasa al <strong>Modo asistente</strong> si quieres una guía paso a paso.
            </p>
          </CardContent>
        </Card>
      )}

      {showHelp && mode === 'planner' && (
        <Card className='border border-primary/20 bg-primary/5'>
          <CardHeader className='pb-2'>
            <div className='flex items-start justify-between'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Info className='h-5 w-5 text-primary' />
                Planificador
              </CardTitle>
              <button
                onClick={() => setShowHelp(false)}
                className='text-sm text-muted-foreground hover:text-foreground'
              >
                Ocultar
              </button>
            </div>
          </CardHeader>
          <CardContent className='text-sm text-foreground'>
            <p className='text-muted-foreground'>
              Clic en un nodo y luego en otro para crear una dependencia (<strong>primero va el prerrequisito</strong>).
              Arrastra los nodos para organizar, usa la rueda para hacer zoom y arrastra el fondo para desplazarte.
              Guarda el plan para regenerar los pasos del asistente.
            </p>
          </CardContent>
        </Card>
      )}

      {mode === 'planner' ? (
        <div className='min-h-0 flex-1 overflow-hidden rounded-xl border bg-card'>
          <AssemblyPlanner
            pieces={response.vista_completa}
            dependencies={
              (response.dependencies ?? []).filter((d): d is [string, string] => d.length === 2)
            }
            levels={response.levels}
            onChange={() => {}}
            onSave={handleSavePlan}
            onSimulate={handleSimulateLevel}
            onExportPdf={handleGenerateAssemblyPdf}
          />
        </div>
      ) : (
        <div className='min-h-0 flex-1 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]'>
          <div className='flex min-h-0 flex-col gap-3'>
            <div className='relative min-h-[24rem] flex-1 overflow-hidden rounded-xl border bg-card'>
              <Assembly3DV2
                pieces={mode === 'assistant' ? response.vista_completa : accumulatedPieces}
                expectedPieces={response.pieces}
                connectors={accumulatedConnectors}
                highlightedIds={highlightedIds}
                selectedCode={selectedPieceCode}
                currentTransforms={currentTransforms}
                transformMode={transformMode}
                snap={snapEnabled}
                snapThreshold={SNAP_THRESHOLD_MM}
                explodeFactor={explodeFactor}
                currentStep={current}
                camera={step?.camera}
                cameraResetKey={cameraResetKey}
                showLabels={mode === 'preview' || showComplete}
                levels={response?.levels}
                pieceStates={mode === 'assistant' ? pieceStates : undefined}
                onSelectPiece={handleSelectPiece}
                onTransformEnd={handleTransformEnd}
              />
            </div>

            <Card className='shrink-0'>
              <CardContent className='p-4'>
                <div className='space-y-4'>
                  <StepTimeline
                    steps={steps.map((s) => ({ id: s.id, numero: s.numero, titulo: s.titulo }))}
                    currentStep={current}
                    onStepChange={handleStepChange}
                  />

                  <Separator />

                  {mode === 'preview' ? (
                    <div className='flex flex-wrap items-center gap-3'>
                      <ExplodeControl value={explodeFactor} onChange={setExplodeFactor} />
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          setExplodeFactor(0)
                          setCameraResetKey((k) => k + 1)
                        }}
                      >
                        <RotateCw className='mr-1.5 h-4 w-4' />
                        Vista inicial
                      </Button>
                    </div>
                  ) : (
                    <div className='flex flex-wrap items-center gap-3'>
                      <ExplodeControl value={explodeFactor} onChange={setExplodeFactor} />

                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setCameraResetKey((k) => k + 1)}
                      >
                        <RotateCw className='mr-1.5 h-4 w-4' />
                        Reiniciar vista
                      </Button>

                      <Button
                        variant={snapEnabled ? 'default' : 'outline'}
                        size='sm'
                        onClick={() => setSnapEnabled((v) => !v)}
                      >
                        {snapEnabled ? (
                          <>
                            <Check className='mr-1.5 h-4 w-4' /> Snap
                          </>
                        ) : (
                          'Snap'
                        )}
                      </Button>

                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          setTransformMode((m) => (m === 'translate' ? 'rotate' : 'translate'))
                        }
                      >
                        {transformMode === 'translate' ? (
                          <>
                            <Move className='mr-1.5 h-4 w-4' /> Mover
                          </>
                        ) : (
                          <>
                            <RotateCw className='mr-1.5 h-4 w-4' /> Rotar
                          </>
                        )}
                      </Button>

                      <Button
                        variant='outline'
                        size='sm'
                        onClick={handleAutoAlignStep}
                        disabled={!step}
                      >
                        <Wrench className='mr-1.5 h-4 w-4' />
                        Alinear paso
                      </Button>

                      <div className='ml-auto flex items-center gap-2'>
                        <Button
                          variant='secondary'
                          size='sm'
                          isLoading={validating}
                          onClick={handleValidate}
                        >
                          <Wrench className='mr-1.5 h-4 w-4' />
                          Validar paso
                        </Button>
                        <Button
                          size='sm'
                          isLoading={completing}
                          disabled={completing}
                          onClick={handleCompleteStep}
                        >
                          <Check className='mr-1.5 h-4 w-4' />
                          Completar paso
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className='flex flex-col gap-4 overflow-y-auto lg:max-h-full'>
            {mode === 'preview' ? (
              <>
                {moduleLegend.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>Módulos</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-2'>
                      {moduleLegend.map(([modulo, count]) => (
                        <div key={modulo} className='flex items-center justify-between text-sm'>
                          <div className='flex items-center gap-2'>
                            <span
                              className='h-3 w-3 rounded-full'
                              style={{ backgroundColor: getModuleColor(modulo) }}
                            />
                            <span className='text-foreground'>{modulo}</span>
                          </div>
                          <span className='text-muted-foreground'>{count} pieza(s)</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>Componentes</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <p className='text-sm text-muted-foreground'>
                      {response.vista_completa.length} piezas en la vista previa.
                    </p>
                    <div>
                      <p className='text-xs font-medium uppercase text-muted-foreground'>Piezas</p>
                    <div className='mt-1 flex max-h-48 flex-wrap gap-2 overflow-y-auto'>
                      {response.vista_completa.map((p) => (
                        <Button
                          key={p.id}
                          variant={selectedPieceCode === p.id ? 'default' : 'outline'}
                          size='sm'
                          onClick={() => setSelectedPieceCode(p.id)}
                        >
                          <span
                            className='mr-1.5 h-2.5 w-2.5 rounded-full'
                            style={{ backgroundColor: p.color }}
                          />
                          {p.id}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {response.conectores_completos.length > 0 && (
                    <div>
                      <p className='text-xs font-medium uppercase text-muted-foreground'>Conectores totales</p>
                      <div className='mt-1 flex flex-wrap gap-2'>
                        {response.conectores_completos.map((c, i) => (
                          <Badge key={i} variant='secondary'>
                            {c.tipo}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center justify-between text-base'>
                    <span>Paso {step?.numero}</span>
                    {currentLevelIndex >= 0 && (
                      <Badge variant='secondary'>Nivel {currentLevelIndex + 1}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <p className='text-sm text-muted-foreground'>{step?.descripcion}</p>

                  <div>
                    <p className='text-xs font-medium uppercase text-muted-foreground'>Piezas</p>
                    <div className='mt-1 flex flex-wrap gap-2'>
                      {step?.piezas_3d.map((p) => (
                        <Button
                          key={p.id}
                          variant={selectedPieceCode === p.id ? 'default' : 'outline'}
                          size='sm'
                          onClick={() => handleSelectPiece(p.id)}
                        >
                          <span
                            className='mr-1.5 h-2.5 w-2.5 rounded-full'
                            style={{ backgroundColor: p.color }}
                          />
                          {p.id}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {step && step.conectores.length > 0 && (
                    <div>
                      <p className='text-xs font-medium uppercase text-muted-foreground'>Conectores</p>
                      <div className='mt-1 flex flex-wrap gap-2'>
                        {step.conectores.map((c, i) => (
                          <Badge key={i} variant='secondary'>
                            {c.tipo}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className='text-xs font-medium uppercase text-muted-foreground'>Herramientas</p>
                    <p className='text-sm text-foreground'>{step?.herramientas.join(', ')}</p>
                  </div>

                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground'>Tiempo estimado</span>
                    <span className='font-medium text-foreground'>{step?.tiempo_estimado_min} min</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedPiece && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Pieza seleccionada</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='flex items-center gap-2'>
                    <span
                      className='h-4 w-4 rounded'
                      style={{ backgroundColor: selectedPiece.color }}
                    />
                    <span className='font-medium text-foreground'>{selectedPiece.id}</span>
                  </div>
                  <p className='text-sm text-muted-foreground'>{selectedPiece.nombre}</p>

                  <div className='grid grid-cols-3 gap-2 text-xs'>
                    <div>
                      <span className='text-muted-foreground uppercase'>Ancho</span>
                      <p className='font-medium text-foreground'>{selectedPiece.ancho} mm</p>
                    </div>
                    <div>
                      <span className='text-muted-foreground uppercase'>Alto</span>
                      <p className='font-medium text-foreground'>{selectedPiece.alto} mm</p>
                    </div>
                    <div>
                      <span className='text-muted-foreground uppercase'>Prof.</span>
                      <p className='font-medium text-foreground'>{selectedPiece.profundidad} mm</p>
                    </div>
                  </div>

                  {selectedPiece.modulo && (
                    <div className='flex items-center gap-2 text-sm'>
                      <span
                        className='h-3 w-3 rounded-full'
                        style={{ backgroundColor: getModuleColor(selectedPiece.modulo) }}
                      />
                      <span className='text-muted-foreground'>Módulo:</span>
                      <span className='font-medium text-foreground'>{selectedPiece.modulo}</span>
                    </div>
                  )}

                  {selectedExpected && selectedExpected.dependencias.length > 0 && (
                    <div>
                      <p className='text-xs font-medium uppercase text-muted-foreground'>Dependencias</p>
                      <div className='mt-1 flex flex-wrap gap-1'>
                        {selectedExpected.dependencias.map((dep) => (
                          <Badge key={dep} variant='secondary'>
                            {dep}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className='grid grid-cols-3 gap-2 text-xs'>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <div key={axis}>
                        <span className='text-muted-foreground uppercase'>{axis}</span>
                        <p className='font-medium text-foreground'>
                          {(currentTransforms[selectedPiece.id]?.position[axis] ??
                            selectedPiece.posicion[axis]
                          ).toFixed(1)}{' '}
                          mm
                        </p>
                      </div>
                    ))}
                  </div>

                  {selectedExpected && (
                    <Button variant='outline' size='sm' className='w-full' onClick={handleResetSelected}>
                      Corregir posición
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {validation && (
              <Card className={validation.valid ? 'border-success' : 'border-destructive'}>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    Validación
                    {validation.valid ? (
                      <Badge variant='success'>OK</Badge>
                    ) : (
                      <Badge variant='danger'>Revisar</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {validationDetails.length === 0 && validation.errors.length > 0 && (
                    <ul className='list-disc space-y-1 pl-4 text-sm text-muted-foreground'>
                      {validation.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}

                  {validationDetails.map((d) => (
                    <div
                      key={d.code}
                      className='flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0'
                    >
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium text-foreground'>{d.code}</p>
                        {d.errors.length > 0 && (
                          <p className='text-xs text-destructive'>{d.errors.join(', ')}</p>
                        )}
                      </div>
                      <div className='flex shrink-0 gap-2'>
                        <Badge variant={d.deltaPosMm <= POSITION_TOLERANCE_MM ? 'success' : 'danger'}>
                          {d.deltaPosMm.toFixed(1)} mm
                        </Badge>
                        <Badge variant={d.deltaRotDeg <= ROTATION_TOLERANCE_DEG ? 'success' : 'danger'}>
                          {d.deltaRotDeg.toFixed(1)}°
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {!validation.valid && selectedPieceCode && selectedExpected && (
                    <Button variant='outline' size='sm' className='w-full' onClick={handleResetSelected}>
                      Ajustar pieza seleccionada
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {mode === 'assistant' && response.levels && response.levels.length > 0 && (
              <Card>
                <CardHeader className='pb-2'>
                  <button
                    onClick={() => setLevelsOpen((v) => !v)}
                    className='flex w-full items-center justify-between text-left'
                  >
                    <CardTitle className='text-base'>Niveles de ensamblaje</CardTitle>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        levelsOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </CardHeader>
                {levelsOpen && (
                  <CardContent>
                    <LevelTimeline
                      levels={response.levels}
                      currentLevel={currentLevelIndex >= 0 ? currentLevelIndex : 0}
                      onLevelChange={(index) => handleSimulateLevel(index)}
                      getPieceLabel={(id) => response.vista_completa.find((p) => p.id === id)?.nombre ?? id}
                    />
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Resumen</CardTitle>
              </CardHeader>
              <CardContent className='space-y-1 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Pasos</span>
                  <span className='font-medium text-foreground'>{steps.length}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Tiempo total</span>
                  <span className='font-medium text-foreground'>{totalTime} min</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Piezas</span>
                  <span className='font-medium text-foreground'>
                    {response.vista_completa.length}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Conectores</span>
                  <span className='font-medium text-foreground'>
                    {response.conectores_completos.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  )
}

export default AssemblyPage
