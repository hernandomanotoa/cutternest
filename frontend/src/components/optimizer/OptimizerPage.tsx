import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { HexColorPicker } from 'react-colorful'
import toast from 'react-hot-toast'
import { Link, useLocation } from 'react-router-dom'
import {
  Box,
  Clipboard,
  Copy,
  Download,
  FileText,
  Image,
  Layers,
  Maximize2,
  Palette,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Scissors,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { api, API_BASE_URL } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'
import type {
  BoardFormat,
  BoardInput,
  BoardResult,
  CatalogColor,
  CatalogMaterial,
  CatalogResponse,
  PieceInput,
  Project,
} from '../../types'
import { Tablero3D } from './Tablero3D'
import { Layout2D } from './Layout2D'
import { PieceCountTab } from './PieceCountTab'
import { generateCsv, parseCsv, downloadCsv } from '../../utils/piecesCsv'
import { groupPiecesByDimensions, totalPieces } from '../../utils/pieceCounter'
import {
  loadTemplate,
  saveTemplate,
  clearTemplate,
  hasTemplate,
} from '../../utils/pieceTemplate'
import { fetchCatalog } from '../../utils/catalog'
import { Button } from '../ui/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Badge } from '../ui/Badge'
import { Tabs, TabsTrigger } from '../ui/Tabs'
import { Tooltip } from '../ui/Tooltip'
import { useSelectionStore } from '../../stores/selectionStore'

const ejemploEstanteria: PieceInput[] = [
  { id: 'base', nombre: 'Base', ancho: 1200, alto: 600, cantidad: 1, rotate: true, color: '#FF6B6B', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'tapa', nombre: 'Tapa', ancho: 1200, alto: 600, cantidad: 1, rotate: true, color: '#4ECDC4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'lateral-izq', nombre: 'Lateral Izq', ancho: 500, alto: 1800, cantidad: 1, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,L' },
  { id: 'lateral-der', nombre: 'Lateral Der', ancho: 500, alto: 1800, cantidad: 1, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,R' },
  { id: 'estante-1', nombre: 'Estante 1', ancho: 1000, alto: 300, cantidad: 1, rotate: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-2', nombre: 'Estante 2', ancho: 1000, alto: 300, cantidad: 1, rotate: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-3', nombre: 'Estante 3', ancho: 1000, alto: 300, cantidad: 1, rotate: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-4', nombre: 'Estante 4', ancho: 1000, alto: 300, cantidad: 1, rotate: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'puerta-izq', nombre: 'Puerta Izq', ancho: 800, alto: 400, cantidad: 1, rotate: true, color: '#FFEAA7', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'puerta-der', nombre: 'Puerta Der', ancho: 800, alto: 400, cantidad: 1, rotate: true, color: '#FFEAA7', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'fondo', nombre: 'Fondo', ancho: 600, alto: 1800, cantidad: 1, rotate: false, color: '#DDA0DD', espesor: 3, cantos: '' },
]

const DEFAULT_MATERIAL = 'MDF Melamina'
const DEFAULT_THICKNESS = 18
const CONFIG_KEY = 'cutternest-optimizer-config'

interface PersistedConfig {
  tablero?: BoardInput
  materialType?: string
  useOffcuts?: boolean
}

function loadConfig(): PersistedConfig {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PersistedConfig
  } catch {
    return {}
  }
}

function saveConfig(config: PersistedConfig) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

function utilizationTone(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 85) return 'success'
  if (value >= 70) return 'warning'
  return 'danger'
}

export function OptimizerPage() {
  const location = useLocation()
  const initialProjectId = (location.state as Record<string, unknown>)?.projectId as string | undefined
  const initialPieces = (location.state as Record<string, unknown>)?.pieces as PieceInput[] | undefined

  const config = loadConfig()

  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null)
  const [projectName, setProjectName] = useState('Proyecto nuevo')
  const [tablero, setTablero] = useState<BoardInput>(
    config.tablero ?? {
      ancho: 2440,
      alto: 1220,
      espesor: DEFAULT_THICKNESS,
      kerf_mm: 3,
      margen_mm: 5,
    }
  )
  const [materialType, setMaterialType] = useState(config.materialType ?? DEFAULT_MATERIAL)
  const [piezas, setPiezas] = useState<PieceInput[]>(() =>
    loadTemplate(initialPieces ? [...initialPieces] : [...ejemploEstanteria])
  )
  const [currentPiece, setCurrentPiece] = useState<PieceInput>({
    id: '',
    nombre: '',
    ancho: 0,
    alto: 0,
    cantidad: 1,
    rotate: true,
    color: '#3B82F6',
    espesor: DEFAULT_THICKNESS,
    cantos: '',
  })
  const [colorPickerOpenIndex, setColorPickerOpenIndex] = useState<number | null>(null)
  const [currentColorTarget, setCurrentColorTarget] = useState<'add' | number>('add')
  const [result, setResult] = useState<BoardResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [view3D, setView3D] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState(0)
  const [useOffcuts, setUseOffcuts] = useState(config.useOffcuts ?? false)
  const [activeTab, setActiveTab] = useState<'piezas' | 'conteo'>('piezas')
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [showTips, setShowTips] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem('cutternest-optimizer-tips') !== 'dismissed'
    } catch {
      return true
    }
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedPieceCode, setSelectedPieceCode, clearSelection } = useSelectionStore()

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        setCatalog(data)
        const hasConfig = Boolean(loadConfig().tablero)
        if (!hasConfig) {
          const ecuadorFormat =
            data.board_formats.find((f) => f.name.includes('Ecuador')) ||
            data.board_formats[0]
          if (ecuadorFormat) {
            setTablero((t) => ({
              ...t,
              ancho: ecuadorFormat.width_mm,
              alto: ecuadorFormat.height_mm,
            }))
          }
          if (data.materials[0]) {
            setMaterialType(data.materials[0].name)
          }
        }
      })
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar catalogo'))
  }, [])

  useEffect(() => {
    saveConfig({ tablero, materialType, useOffcuts })
  }, [tablero, materialType, useOffcuts])

  useEffect(() => {
    saveTemplate(piezas)
  }, [piezas])

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (selectedRowIndex != null) {
          duplicatePiece(selectedRowIndex)
          toast.success('Pieza duplicada')
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedRowIndex])

  const material = useMemo(
    () => catalog?.materials.find((m) => m.name === materialType),
    [catalog, materialType]
  )
  const thicknessOptions = useMemo(
    () => material?.thicknesses || [DEFAULT_THICKNESS],
    [material]
  )
  const colorPresets = useMemo(() => catalog?.colors || [], [catalog])

  useEffect(() => {
    if (material && !material.thicknesses.includes(tablero.espesor)) {
      setTablero((t) => ({ ...t, espesor: material.thicknesses[0] }))
    }
  }, [material, tablero.espesor])

  const addPiece = () => {
    if (!currentPiece.nombre || currentPiece.ancho <= 0 || currentPiece.alto <= 0) {
      toast.error('Completa nombre, ancho y alto')
      return
    }
    const id =
      currentPiece.id || currentPiece.nombre.toLowerCase().replace(/\s+/g, '-')
    setPiezas((prev) => [
      ...prev,
      { ...currentPiece, id, espesor: currentPiece.espesor || tablero.espesor },
    ])
    setCurrentPiece({
      id: '',
      nombre: '',
      ancho: 0,
      alto: 0,
      cantidad: 1,
      rotate: true,
      color: '#3B82F6',
      espesor: tablero.espesor,
      cantos: '',
    })
  }

  const addEmptyRow = () => {
    setPiezas((prev) => [
      ...prev,
      {
        id: '',
        nombre: '',
        ancho: 0,
        alto: 0,
        cantidad: 1,
        rotate: true,
        color: '#3B82F6',
        espesor: tablero.espesor,
        cantos: '',
      },
    ])
  }

  const removePiece = (index: number) => {
    setPiezas((prev) => prev.filter((_, i) => i !== index))
    if (colorPickerOpenIndex === index) setColorPickerOpenIndex(null)
  }

  const duplicatePiece = (index: number) => {
    const original = piezas[index]
    if (!original) return
    const copy: PieceInput = {
      ...original,
      id: `${original.id || original.nombre}-copy-${Date.now()}`,
      nombre: `${original.nombre} (copia)`,
    }
    setPiezas((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)])
  }

  const updatePiece = (index: number, patch: Partial<PieceInput>) => {
    setPiezas((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
    )
  }

  const cargarPlantilla = () => {
    const template = loadTemplate(ejemploEstanteria)
    setPiezas([...template])
    toast.success(hasTemplate() ? 'Plantilla personalizada cargada' : 'Ejemplo cargado: Estanteria Modular')
  }

  const guardarPlantilla = () => {
    saveTemplate(piezas)
    toast.success('Plantilla guardada para nuevos ingresos')
  }

  const restaurarEjemplo = () => {
    clearTemplate()
    setPiezas([...ejemploEstanteria])
    toast.success('Ejemplo restaurado: Estanteria Modular')
  }

  const descargarCsv = () => {
    const csv = generateCsv(piezas)
    const slug = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    downloadCsv(csv, `${slug || 'proyecto'}-piezas.csv`)
  }

  const pegarCsv = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const result = parseCsv(text)
      if (result.valid) {
        setPiezas((prev) => [...prev, ...result.pieces])
        toast.success(`${result.pieces.length} piezas pegadas desde portapapeles`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('No se pudo leer el portapapeles')
    }
  }

  const cargarCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = String(event.target?.result || '')
      const result = parseCsv(text)
      if (result.valid) {
        setPiezas(result.pieces)
        saveTemplate(result.pieces)
        toast.success(`${result.pieces.length} piezas cargadas y guardadas como plantilla`)
        if (projectId) {
          try {
            await api.post(`/projects/${projectId}/pieces`, { piezas: result.pieces })
            toast.success('Piezas guardadas en el proyecto')
          } catch (err: unknown) {
            toast.error(getApiErrorMessage(err) || 'Error al guardar piezas')
          }
        }
      } else {
        toast.error(result.error)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.onerror = () => {
      toast.error('Error al leer el archivo')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (projectId) {
      api
        .get(`/projects/${projectId}`)
        .then((response) => {
          const project: Project = response.data
          setProjectName(project.name)
          setTablero((t) => ({
            ...t,
            ancho: project.board_width_mm || t.ancho,
            alto: project.board_height_mm || t.alto,
            espesor: project.board_thickness_mm || t.espesor,
          }))
          if (project.material_type) {
            setMaterialType(project.material_type)
          }
        })
        .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar proyecto'))
    }
  }, [projectId])

  const groupedPieces = useMemo(() => groupPiecesByDimensions(piezas), [piezas])
  const totalPiecesCount = useMemo(() => totalPieces(piezas), [piezas])

  const ensureProject = async () => {
    if (projectId) return projectId
    const name = window.prompt('Nombre del proyecto', projectName)
    if (!name) return null
    try {
      const response = await api.post('/projects', {
        name,
        description: '',
        board_width_mm: tablero.ancho,
        board_height_mm: tablero.alto,
        board_thickness_mm: tablero.espesor,
        material_type: materialType,
        use_offcuts: useOffcuts,
      })
      const project: Project = response.data
      setProjectId(project.id)
      setProjectName(project.name)
      return project.id
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al crear proyecto')
      return null
    }
  }

  const optimize = async () => {
    setLoading(true)
    clearSelection()
    try {
      const pid = await ensureProject()
      if (!pid) {
        setLoading(false)
        return
      }
      const response = await api.post(`/projects/${pid}/optimize`, {
        tablero,
        piezas,
        use_offcuts: useOffcuts,
        material_type: materialType,
      })
      const data = response.data as { tableros: BoardResult[]; total_tableros: number }
      setResult(data.tableros)
      setSelectedBoard(0)
      toast.success(`Optimizado en ${data.total_tableros} tablero(s)`)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al optimizar')
    } finally {
      setLoading(false)
    }
  }

  const savePieces = async () => {
    const pid = await ensureProject()
    if (!pid) return
    setLoading(true)
    try {
      await api.post(`/projects/${pid}/pieces`, { piezas })
      toast.success('Piezas guardadas en el proyecto')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al guardar piezas')
    } finally {
      setLoading(false)
    }
  }

  const generatePdf = async (type: 'cutlist' | 'labels') => {
    if (!projectId) return
    try {
      const response = await api.post(`/projects/${projectId}/${type}`)
      const path = (response.data as { pdf_path?: string }).pdf_path
      if (path) {
        window.open(path, '_blank')
        toast.success(`${type === 'cutlist' ? 'Cut list' : 'Etiquetas'} generado`)
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al generar PDF')
    }
  }

  const descargarPng = () => {
    if (!projectId) {
      toast.error('Guarda el proyecto antes de descargar')
      return
    }
    if (!result || selectedBoard == null) {
      toast.error('Selecciona un tablero del resultado')
      return
    }
    const url = `${API_BASE_URL}/projects/${projectId}/layouts/${selectedBoard}/png`
    window.open(url, '_blank')
  }

  const applyBoardFormat = (format: BoardFormat) => {
    setTablero((t) => ({ ...t, ancho: format.width_mm, alto: format.height_mm }))
  }

  const setColorForCurrent = (hex: string) => {
    setCurrentPiece((p) => ({ ...p, color: hex }))
  }

  const setColorForRow = (index: number, hex: string) => {
    updatePiece(index, { color: hex })
  }

  const handleRowKeyDown = (e: KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (rowIndex === piezas.length - 1) {
        addEmptyRow()
      }
    }
  }

  const selectedBoardResult = result?.find((b) => b.board_index === selectedBoard) ?? result?.[0]

  const avgUtilization = useMemo(() => {
    if (!result?.length) return null
    return Math.round(result.reduce((sum, b) => sum + b.utilizacion, 0) / result.length)
  }, [result])

  const totalAreaM2 = useMemo(() => {
    if (!result?.length) return null
    return (result.reduce((sum, b) => sum + b.ancho * b.alto, 0) / 1_000_000).toFixed(2)
  }, [result])

  const boardSelectorValue = useMemo(() => {
    const f = catalog?.board_formats.find(
      (f) => f.width_mm === tablero.ancho && f.height_mm === tablero.alto
    )
    return f?.name || ''
  }, [catalog, tablero.ancho, tablero.alto])

  function pieceError(piece: PieceInput): string | null {
    if (piece.ancho <= 0 || piece.alto <= 0) return 'Dimensiones invalidas'
    if (piece.ancho > tablero.ancho || piece.alto > tablero.alto)
      return 'Excede tablero'
    return null
  }

  const renderColorSwatches = (
    value: string,
    onChange: (hex: string) => void,
    onCustomClick: () => void
  ) => (
    <div className='flex flex-wrap items-center gap-2'>
      {colorPresets.map((c: CatalogColor) => (
        <button
          key={c.hex}
          type='button'
          title={c.name}
          onClick={() => onChange(c.hex)}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            value === c.hex ? 'border-primary' : 'border-border'
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
      <button
        type='button'
        onClick={onCustomClick}
        className='flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted'
      >
        <Palette className='h-3 w-3' />
      </button>
    </div>
  )

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            Optimizador de cortes
          </h1>
          {projectId && (
            <p className='text-sm text-muted-foreground'>{projectName}</p>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to='/projects'>Proyectos</Link>
          </Button>
          <Button variant='outline' size='sm' onClick={() => window.history.back()}>
            Volver
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-12'>
        {/* Panel izquierdo: tablero + agregar pieza */}
        <div className='space-y-6 lg:col-span-4 xl:col-span-3'>
          <div className='lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:self-start pr-1 space-y-6'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>Tablero</CardTitle>
              <CardDescription className='text-xs'>Material y dimensiones de la placa base.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Select
                label='Material'
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
              >
                {catalog?.materials.map((m: CatalogMaterial) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </Select>

              <Select
                label='Espesor (mm)'
                value={String(tablero.espesor)}
                onChange={(e) =>
                  setTablero((t) => ({ ...t, espesor: parseFloat(e.target.value) || DEFAULT_THICKNESS }))
                }
              >
                {thicknessOptions.map((t) => (
                  <option key={t} value={t}>
                    {t} mm
                  </option>
                ))}
              </Select>

              <Select
                label='Formato de placa'
                value={boardSelectorValue}
                onChange={(e) => {
                  const format = catalog?.board_formats.find((f) => f.name === e.target.value)
                  if (format) applyBoardFormat(format)
                }}
              >
                {catalog?.board_formats.map((f: BoardFormat) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({f.width_mm}×{f.height_mm} mm)
                  </option>
                ))}
              </Select>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Ancho (mm)
                  </label>
                  <Input
                    type='number'
                    value={tablero.ancho}
                    onChange={(e) =>
                      setTablero((t) => ({ ...t, ancho: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Alto (mm)
                  </label>
                  <Input
                    type='number'
                    value={tablero.alto}
                    onChange={(e) =>
                      setTablero((t) => ({ ...t, alto: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Kerf (mm)
                  </label>
                  <Input
                    type='number'
                    value={tablero.kerf_mm}
                    onChange={(e) =>
                      setTablero((t) => ({ ...t, kerf_mm: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-muted-foreground'>
                    Margen (mm)
                  </label>
                  <Input
                    type='number'
                    value={tablero.margen_mm}
                    onChange={(e) =>
                      setTablero((t) => ({ ...t, margen_mm: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>

              <label className='flex items-center gap-2 text-sm text-foreground'>
                <input
                  type='checkbox'
                  checked={useOffcuts}
                  onChange={(e) => setUseOffcuts(e.target.checked)}
                  className='h-4 w-4 rounded border-border text-primary focus:ring-ring'
                />
                Usar sobrantes primero
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base'>Agregar pieza</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <Input
                  className='col-span-2'
                  placeholder='Nombre'
                  value={currentPiece.nombre}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({ ...p, nombre: e.target.value }))
                  }
                />
                <Input
                  type='number'
                  placeholder='Ancho (mm)'
                  value={currentPiece.ancho || ''}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({
                      ...p,
                      ancho: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                <Input
                  type='number'
                  placeholder='Alto (mm)'
                  value={currentPiece.alto || ''}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({
                      ...p,
                      alto: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                <Input
                  type='number'
                  placeholder='Cantidad'
                  value={currentPiece.cantidad}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({
                      ...p,
                      cantidad: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <Input
                  placeholder='Cantos (T,B,L,R)'
                  value={currentPiece.cantos || ''}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({ ...p, cantos: e.target.value }))
                  }
                />
                <Input
                  type='number'
                  placeholder='Espesor (mm)'
                  value={currentPiece.espesor || ''}
                  onChange={(e) =>
                    setCurrentPiece((p) => ({
                      ...p,
                      espesor: parseFloat(e.target.value) || tablero.espesor,
                    }))
                  }
                />
                <label className='flex items-center gap-2 text-sm text-foreground'>
                  <input
                    type='checkbox'
                    checked={currentPiece.rotate}
                    onChange={(e) =>
                      setCurrentPiece((p) => ({ ...p, rotate: e.target.checked }))
                    }
                    className='h-4 w-4 rounded border-border text-primary focus:ring-ring'
                  />
                  Rotar
                </label>
              </div>
              {renderColorSwatches(
                currentPiece.color,
                setColorForCurrent,
                () => setCurrentColorTarget('add')
              )}
              {currentColorTarget === 'add' && (
                <div className='relative'>
                  <HexColorPicker
                    color={currentPiece.color}
                    onChange={setColorForCurrent}
                    style={{ width: '100%' }}
                  />
                  <button
                    type='button'
                    onClick={() => setCurrentColorTarget(-1)}
                    className='absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent'
                  >
                    ×
                  </button>
                </div>
              )}
              <Button onClick={addPiece} className='w-full' leftIcon={<Plus className='h-4 w-4' />}>
                Agregar pieza
              </Button>
            </CardContent>
          </Card>

          {result && (
            <Card className='border-l-4 border-l-primary'>
              <CardHeader>
                <CardTitle className='text-lg'>Resumen</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-3 gap-3'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Tableros</p>
                    <p className='text-2xl font-bold text-foreground'>{result.length}</p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Piezas</p>
                    <p className='text-2xl font-bold text-foreground'>{totalPiecesCount}</p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Área total</p>
                    <p className='text-2xl font-bold text-foreground'>{totalAreaM2 ?? '—'} m²</p>
                  </div>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Utilización promedio</p>
                  <div className='flex items-baseline gap-2'>
                    <p className='text-3xl font-bold text-foreground'>{avgUtilization}%</p>
                    {avgUtilization !== null && (
                      <Badge variant={utilizationTone(avgUtilization)}>
                        {avgUtilization >= 85
                          ? 'Excelente'
                          : avgUtilization >= 70
                          ? 'Buena'
                          : 'Regular'}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-2 pt-2'>
                  {projectId && (
                    <>
                      <Button asChild>
                        <Link to={`/quote/${projectId}`}>
                          <FileText className='mr-2 h-4 w-4' /> Cotizar
                        </Link>
                      </Button>
                      <Button variant='secondary' asChild>
                        <Link to={`/assembly/${projectId}`}>
                          <Maximize2 className='mr-2 h-4 w-4' /> Ensamblaje
                        </Link>
                      </Button>
                    </>
                  )}
                  <Button
                    variant='outline'
                    onClick={() => generatePdf('cutlist')}
                    disabled={!projectId}
                  >
                    <FileText className='mr-2 h-4 w-4' /> Cut list
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => generatePdf('labels')}
                    disabled={!projectId}
                  >
                    <RotateCw className='mr-2 h-4 w-4' /> Etiquetas
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {showTips && (
            <Card>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-lg'>Consejos</CardTitle>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() => {
                      setShowTips(false)
                      if (typeof window !== 'undefined') {
                        try {
                          window.localStorage.setItem('cutternest-optimizer-tips', 'dismissed')
                        } catch {
                          /* ignore */
                        }
                      }
                    }}
                    aria-label='Ocultar consejos'
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ul className='list-disc space-y-1 pl-4 text-sm text-muted-foreground'>
                  <li>Presiona Enter en la última celda para agregar una fila.</li>
                  <li>Duplica piezas similares con el botón de copia.</li>
                  <li>Usa el margen para simular restricciones reales de corte.</li>
                  <li>El color de cada pieza se refleja en el layout 2D/3D.</li>
                </ul>
              </CardContent>
            </Card>
          )}
          </div>
        </div>

        {/* Panel central: editor + canvas */}
        <div className='space-y-6 lg:col-span-8 xl:col-span-9'>
          <Card>
            <CardHeader className='pb-2'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <CardTitle className='text-base'>Piezas</CardTitle>
                  <CardDescription className='text-xs'>
                    Edita inline, duplica filas o pega desde Excel/CSV.
                  </CardDescription>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'piezas' | 'conteo')}>
                    <TabsTrigger value='piezas'>Piezas ({piezas.length})</TabsTrigger>
                    <TabsTrigger value='conteo'>Conteo</TabsTrigger>
                  </Tabs>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={descargarCsv}
                  leftIcon={<Download className='h-4 w-4' />}
                >
                  Formato CSV
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => fileInputRef.current?.click()}
                  leftIcon={<Upload className='h-4 w-4' />}
                >
                  Cargar CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.csv'
                  onChange={cargarCsv}
                  className='hidden'
                />
                <Button
                  variant='outline'
                  size='sm'
                  onClick={pegarCsv}
                  leftIcon={<Clipboard className='h-4 w-4' />}
                >
                  Pegar CSV
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={guardarPlantilla}
                  leftIcon={<Save className='h-4 w-4' />}
                >
                  Guardar plantilla
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={cargarPlantilla}
                  leftIcon={<Layers className='h-4 w-4' />}
                >
                  Cargar plantilla
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={restaurarEjemplo}
                  leftIcon={<RefreshCcw className='h-4 w-4' />}
                >
                  Restaurar ejemplo
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPiezas([])}
                  leftIcon={<Trash2 className='h-4 w-4' />}
                >
                  Limpiar
                </Button>
              </div>

              {activeTab === 'piezas' ? (
                piezas.length === 0 ? (
                  <div className='flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-12 text-center'>
                    <Scissors className='h-8 w-8 text-muted-foreground' />
                    <p className='max-w-sm text-sm text-muted-foreground'>
                      No hay piezas todavía. Agrega una pieza, pega un CSV o carga el ejemplo.
                    </p>
                    <div className='flex flex-wrap justify-center gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={restaurarEjemplo}
                        leftIcon={<RefreshCcw className='h-4 w-4' />}
                      >
                        Cargar ejemplo
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={pegarCsv}
                        leftIcon={<Clipboard className='h-4 w-4' />}
                      >
                        Pegar CSV
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className='overflow-x-auto overflow-y-auto rounded-md border max-h-[50vh] lg:max-h-[calc(100vh-22rem)]'>
                    <table className='w-full text-sm'>
                      <thead className='sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur-sm'>
                        <tr>
                          <th className='p-2 text-left font-medium'>ID</th>
                          <th className='p-2 text-left font-medium'>Nombre</th>
                          <th className='p-2 text-left font-medium'>Ancho</th>
                          <th className='p-2 text-left font-medium'>Alto</th>
                          <th className='p-2 text-left font-medium w-16'>Esp.</th>
                          <th className='p-2 text-left font-medium w-20'>Cant.</th>
                          <th className='p-2 text-left font-medium w-16'>Rot.</th>
                          <th className='p-2 text-left font-medium'>Color</th>
                          <th className='p-2 text-left font-medium'>Cantos</th>
                          <th className='p-2 text-right font-medium'></th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-border'>
                        {piezas.map((p, i) => {
                          const globalIndex = i
                          const error = pieceError(p)
                          return (
                            <tr
                              key={globalIndex}
                              onClick={() => setSelectedRowIndex(globalIndex)}
                              className={`cursor-pointer ${
                                error
                                  ? 'bg-destructive/10'
                                  : selectedRowIndex === globalIndex
                                  ? 'bg-primary/10 ring-1 ring-primary'
                                  : 'hover:bg-muted/30'
                              }`}
                            >
                              <td className='p-2'>
                                <Input
                                  value={p.id || ''}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, { id: e.target.value })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  placeholder='auto'
                                  className='h-8 min-w-[6rem]'
                                />
                              </td>
                              <td className='p-2'>
                                <Input
                                  value={p.nombre}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, { nombre: e.target.value })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  className='h-8 min-w-[8rem]'
                                />
                              </td>
                              <td className='p-2'>
                                <Input
                                  type='number'
                                  value={p.ancho || ''}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, {
                                      ancho: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  className='h-8 w-20'
                                />
                              </td>
                              <td className='p-2'>
                                <Input
                                  type='number'
                                  value={p.alto || ''}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, {
                                      alto: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  className='h-8 w-20'
                                />
                              </td>
                              <td className='p-2'>
                                <Input
                                  type='number'
                                  value={p.espesor || ''}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, {
                                      espesor: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  className='h-8 w-16'
                                />
                              </td>
                              <td className='p-2'>
                                <Input
                                  type='number'
                                  value={p.cantidad}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, {
                                      cantidad: parseInt(e.target.value) || 1,
                                    })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  className='h-8 w-16'
                                />
                              </td>
                              <td className='p-2'>
                                <input
                                  type='checkbox'
                                  checked={p.rotate}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, { rotate: e.target.checked })
                                  }
                                  className='h-4 w-4 rounded border-border text-primary focus:ring-ring'
                                />
                              </td>
                              <td className='p-2'>
                                <div className='flex items-center gap-2'>
                                  <button
                                    type='button'
                                    onClick={() => {
                                      setCurrentColorTarget(globalIndex)
                                      setColorPickerOpenIndex(globalIndex)
                                    }}
                                    className='h-6 w-6 rounded-full border-2 border-border'
                                    style={{ backgroundColor: p.color }}
                                    title={p.color}
                                  />
                                  {colorPickerOpenIndex === globalIndex && (
                                    <div className='relative z-10'>
                                      <HexColorPicker
                                        color={p.color}
                                        onChange={(hex) => setColorForRow(globalIndex, hex)}
                                        style={{ width: 180, height: 120 }}
                                      />
                                      <button
                                        type='button'
                                        onClick={() => {
                                          setColorPickerOpenIndex(null)
                                          setCurrentColorTarget(-1)
                                        }}
                                        className='absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent'
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className='p-2'>
                                <Input
                                  value={p.cantos || ''}
                                  onChange={(e) =>
                                    updatePiece(globalIndex, { cantos: e.target.value })
                                  }
                                  onKeyDown={(e) => handleRowKeyDown(e, i)}
                                  placeholder='T,B,L,R'
                                  className='h-8 min-w-[5rem]'
                                />
                              </td>
                              <td className='p-2 text-right'>
                                <div className='flex items-center justify-end gap-1'>
                                  {error && (
                                    <Tooltip content={error}>
                                      <Badge variant='danger' className='cursor-help'>
                                        !
                                      </Badge>
                                    </Tooltip>
                                  )}
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    onClick={() => duplicatePiece(globalIndex)}
                                    aria-label='Duplicar'
                                    className='h-8 w-8'
                                  >
                                    <Copy className='h-4 w-4 text-muted-foreground' />
                                  </Button>
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    onClick={() => removePiece(globalIndex)}
                                    aria-label='Eliminar'
                                    className='h-8 w-8'
                                  >
                                    <Trash2 className='h-4 w-4 text-destructive' />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                  </>
                )
              ) : (
                <PieceCountTab
                  groups={groupedPieces}
                  totalPieces={totalPiecesCount}
                  totalGroups={groupedPieces.length}
                />
              )}

              <div className='flex flex-wrap gap-3'>
                <Button
                  variant='secondary'
                  onClick={savePieces}
                  disabled={loading || piezas.length === 0}
                  isLoading={loading}
                  className='flex-1'
                >
                  Guardar piezas
                </Button>
                <Button
                  onClick={optimize}
                  disabled={loading || piezas.length === 0}
                  isLoading={loading}
                  className='flex-1'
                  leftIcon={<Scissors className='h-4 w-4' />}
                >
                  Optimizar
                </Button>
              </div>
            </CardContent>
          </Card>

          {result && selectedBoardResult && (
            <Card>
              <CardHeader>
                <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                  <CardTitle className='text-lg'>Resultados</CardTitle>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setView3D((v) => !v)}
                      leftIcon={view3D ? <Layers className='h-4 w-4' /> : <Box className='h-4 w-4' />}
                    >
                      {view3D ? 'Ver 2D' : 'Ver 3D'}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setSelectedPieceCode(null)}
                    >
                      Limpiar selección
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={descargarPng}
                      disabled={!projectId}
                      leftIcon={<Image className='h-4 w-4' />}
                    >
                      Descargar PNG
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex flex-wrap gap-2'>
                  {result.map((b) => (
                    <button
                      key={b.board_index}
                      type='button'
                      onClick={() => setSelectedBoard(b.board_index)}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedBoard === b.board_index
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      <span>Tablero {b.board_index + 1}</span>
                      <Badge
                        variant={utilizationTone(b.utilizacion)}
                        className='pointer-events-none'
                      >
                        {b.utilizacion}%
                      </Badge>
                    </button>
                  ))}
                </div>

                {view3D ? (
                  <Tablero3D board={selectedBoardResult} />
                ) : (
                  <Layout2D board={selectedBoardResult} margenMm={tablero.margen_mm} />
                )}

                {selectedPieceCode && (
                  <div className='rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground'>
                    Pieza seleccionada: <span className='font-medium'>{selectedPieceCode}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
