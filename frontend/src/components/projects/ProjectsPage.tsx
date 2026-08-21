import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Box,
  Calendar,
  Check,
  Copy,
  ImageOff,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  Puzzle,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import type {
  BoardFormat,
  CatalogMaterial,
  CatalogResponse,
  Project,
  Template,
} from '../../types'
import { cn } from '../../utils/cn'
import { getApiErrorMessage } from '../../utils/apiError'
import { fetchCatalog } from '../../utils/catalog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/Card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface GuestPinResult {
  pin: string
  expires_at: string
  project_id: string
}

interface LayoutSummary {
  id: string
  board_index: number
  board_width_mm: number
  board_height_mm: number
  utilization: number
  svg_path?: string
  png_path?: string
  placements?: unknown[]
}

interface ProjectProgress {
  project_id: string
  percentage: number
  completed_steps: number
  total_steps: number
}

interface ProjectStats {
  pieceCount: number
  utilization: number | null
  thumbnailUrl: string | null
}

interface ProjectWithStats extends Project {
  stats: ProjectStats
  progress: ProjectProgress | null
}

interface ProjectFilters {
  query: string
  status: string
  materialType: string
}

const TEMPLATE_CARD_META: { nombre: string; icon: ReactNode; color: string }[] = [
  { nombre: 'Estantería Modular', icon: <Box className='h-8 w-8' />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { nombre: 'Clóset Básico', icon: <LayoutTemplate className='h-8 w-8' />, color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  { nombre: 'Mesa', icon: <Puzzle className='h-8 w-8' />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { nombre: 'Cajonera', icon: <Settings2 className='h-8 w-8' />, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  { nombre: 'Mueble TV', icon: <Wrench className='h-8 w-8' />, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activo' },
  { value: 'completed', label: 'Completado' },
  { value: 'archived', label: 'Archivado' },
]

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatExpiresAt(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function getUtilizationVariant(value: number | null): ComponentProps<typeof Badge>['variant'] {
  if (value === null) return 'secondary'
  if (value >= 85) return 'success'
  if (value >= 70) return 'warning'
  return 'danger'
}

function getProgressVariant(value: number | null): ComponentProps<typeof Badge>['variant'] {
  if (value === null) return 'secondary'
  if (value >= 80) return 'success'
  if (value >= 40) return 'warning'
  return 'danger'
}

export function ProjectsPage() {
  const { mode, isGuest } = useAuth()
  const isPrincipal = mode === 'principal'
  const navigate = useNavigate()

  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<ProjectFilters>({
    query: '',
    status: '',
    materialType: '',
  })
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    templateId: '',
    ancho: 1200,
    alto: 1800,
    profundidad: 500,
    materialType: 'MDF Melamina',
    boardThicknessMm: 18,
    boardWidthMm: 1830,
    boardHeightMm: 2440,
    useOffcuts: false,
  })

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [templateParams, setTemplateParams] = useState<Record<string, number>>({})
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [generatingTemplate, setGeneratingTemplate] = useState(false)

  const [pinResult, setPinResult] = useState<GuestPinResult | null>(null)
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const materials = useMemo(() => catalog?.materials || [], [catalog])
  const boardFormats = useMemo(() => catalog?.board_formats || [], [catalog])
  const selectedMaterial = useMemo(
    () => materials.find((m) => m.name === form.materialType) || materials[0],
    [materials, form.materialType]
  )
  const thicknessOptions = useMemo(
    () => selectedMaterial?.thicknesses || [form.boardThicknessMm],
    [selectedMaterial, form.boardThicknessMm]
  )

  const activeFiltersCount = useMemo(
    () => Number(Boolean(filters.query)) + Number(Boolean(filters.status)) + Number(Boolean(filters.materialType)),
    [filters]
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(filters.query)
    }, 300)
    return () => clearTimeout(timeout)
  }, [filters.query])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const params = new URLSearchParams()
        const trimmedQuery = debouncedQuery.trim()
        if (trimmedQuery) params.set('query', trimmedQuery)
        if (filters.status) params.set('status', filters.status)
        if (filters.materialType) params.set('material_type', filters.materialType)
        const queryString = params.toString()
        const projectsUrl = queryString ? `/projects?${queryString}` : '/projects'

        const [projectsRes, templatesRes, catalogData] = await Promise.all([
          api.get<Project[]>(projectsUrl),
          api.get<Template[]>('/templates'),
          fetchCatalog(),
        ])
        if (cancelled) return
        const baseProjects = projectsRes.data || []
        const loadedTemplates = templatesRes.data || []
        setTemplates(loadedTemplates)
        setCatalog(catalogData)

        const projectsWithStats = await Promise.all(
          baseProjects.map(async (p) => {
            const [layoutsResult, progressResult] = await Promise.allSettled([
              api.get<LayoutSummary[]>(`/projects/${p.id}/layouts`),
              api.get<ProjectProgress>(`/projects/${p.id}/progress`),
            ])
            const layouts = layoutsResult.status === 'fulfilled' ? layoutsResult.value.data || [] : []
            const progress = progressResult.status === 'fulfilled' ? progressResult.value.data : null
            return { ...p, stats: computeStats(layouts), progress }
          })
        )
        if (!cancelled) {
          setProjects(projectsWithStats)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(err) || 'Error al cargar proyectos')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, filters.status, filters.materialType])

  useEffect(() => {
    if (!catalog) return
    const defaultMaterial = catalog.materials.find((m) => m.name === 'MDF Melamina') || catalog.materials[0]
    const defaultFormat = catalog.board_formats[0]
    setForm((f) => ({
      ...f,
      materialType: defaultMaterial?.name || f.materialType,
      boardThicknessMm: defaultMaterial?.thicknesses[0] || f.boardThicknessMm,
      boardWidthMm: defaultFormat?.width_mm || f.boardWidthMm,
      boardHeightMm: defaultFormat?.height_mm || f.boardHeightMm,
    }))
  }, [catalog])

  function computeStats(layouts: LayoutSummary[]): ProjectStats {
    if (!layouts.length) {
      return { pieceCount: 0, utilization: null, thumbnailUrl: null }
    }
    const pieceCount = layouts.reduce((sum, l) => sum + (Array.isArray(l.placements) ? l.placements.length : 0), 0)
    const avgUtilization =
      layouts.reduce((sum, l) => sum + (typeof l.utilization === 'number' ? l.utilization : 0), 0) /
      layouts.length
    const thumbnailLayout = layouts.find((l) => l.png_path || l.svg_path)
    const thumbnailUrl = thumbnailLayout?.png_path || thumbnailLayout?.svg_path || null
    return { pieceCount, utilization: Math.round(avgUtilization * 1000) / 10, thumbnailUrl }
  }

  function updateMaterial(materialName: string) {
    const material = materials.find((m) => m.name === materialName)
    if (!material) return
    const thickness = material.thicknesses[0] || form.boardThicknessMm
    setForm({ ...form, materialType: materialName, boardThicknessMm: thickness })
  }

  function updateBoardFormat(formatName: string) {
    const format = boardFormats.find((f) => f.name === formatName)
    if (!format) return
    setForm({ ...form, boardWidthMm: format.width_mm, boardHeightMm: format.height_mm })
  }

  function resetForm() {
    setForm({
      name: '',
      description: '',
      templateId: '',
      ancho: 1200,
      alto: 1800,
      profundidad: 500,
      materialType: catalog?.materials.find((m) => m.name === 'MDF Melamina')?.name || catalog?.materials[0]?.name || 'MDF Melamina',
      boardThicknessMm: catalog?.materials.find((m) => m.name === 'MDF Melamina')?.thicknesses[0] || catalog?.materials[0]?.thicknesses[0] || 18,
      boardWidthMm: catalog?.board_formats[0]?.width_mm || 1830,
      boardHeightMm: catalog?.board_formats[0]?.height_mm || 2440,
      useOffcuts: false,
    })
  }

  function clearFilters() {
    setFilters({ query: '', status: '', materialType: '' })
  }

  async function createProject() {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    try {
      const payload = {
        name: form.name,
        description: form.description,
        board_width_mm: form.boardWidthMm,
        board_height_mm: form.boardHeightMm,
        board_thickness_mm: form.boardThicknessMm,
        material_type: form.materialType,
        use_offcuts: form.useOffcuts,
      }
      const response = await api.post<Project>('/projects', payload)
      const project = response.data

      if (form.templateId) {
        const tmplResponse = await api.post<{ piezas: unknown[] }>(`/templates/${form.templateId}/generate`, {
          ancho: form.ancho,
          alto: form.alto,
          profundidad: form.profundidad,
        })
        navigate('/optimizer', { state: { projectId: project.id, pieces: tmplResponse.data.piezas } })
      } else {
        navigate('/optimizer', { state: { projectId: project.id } })
      }
      setCreateOpen(false)
      resetForm()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al crear proyecto')
    }
  }

  async function deleteProject(id: string) {
    if (!window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return
    try {
      await api.delete(`/projects/${id}`)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      toast.success('Proyecto eliminado')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al eliminar')
    }
  }

  async function duplicateProject(project: ProjectWithStats) {
    try {
      const payload = {
        name: `Copia de ${project.name}`,
        description: project.description || '',
        board_width_mm: project.board_width_mm,
        board_height_mm: project.board_height_mm,
        board_thickness_mm: project.board_thickness_mm,
        material_type: project.material_type,
        use_offcuts: project.use_offcuts ?? false,
      }
      const response = await api.post<Project>('/projects', payload)
      const copy = response.data
      setProjects((prev) => [{ ...copy, stats: { pieceCount: 0, utilization: null, thumbnailUrl: null }, progress: null }, ...prev])
      toast.success('Proyecto duplicado')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al duplicar')
    }
  }

  async function generateGuestPin(projectId: string) {
    try {
      const response = await api.post<GuestPinResult>('/auth/guest/pin', { project_id: projectId })
      setPinResult(response.data)
      setPinDialogOpen(true)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al generar PIN')
    }
  }

  async function copyPin() {
    if (!pinResult) return
    try {
      await navigator.clipboard.writeText(pinResult.pin)
      setCopied(true)
      toast.success('PIN copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar el PIN')
    }
  }

  function openTemplateDialog(template: Template) {
    const defaults: Record<string, number> = {}
    Object.entries(template.parametros).forEach(([key, cfg]) => {
      defaults[key] = cfg.default
    })
    setTemplateParams(defaults)
    setSelectedTemplate(template)
    setTemplateDialogOpen(true)
  }

  async function useTemplate() {
    if (!selectedTemplate) return
    setGeneratingTemplate(true)
    try {
      const tmplResponse = await api.post<{ piezas: unknown[] }>(`/templates/${selectedTemplate.id}/generate`, templateParams)
      const pieces = tmplResponse.data.piezas

      const payload = {
        name: selectedTemplate.nombre,
        description: selectedTemplate.descripcion,
        board_width_mm: form.boardWidthMm,
        board_height_mm: form.boardHeightMm,
        board_thickness_mm: form.boardThicknessMm,
        material_type: form.materialType,
        use_offcuts: false,
      }
      const response = await api.post<Project>('/projects', payload)
      navigate('/optimizer', { state: { projectId: response.data.id, pieces } })
      setTemplateDialogOpen(false)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al generar plantilla')
    } finally {
      setGeneratingTemplate(false)
    }
  }

  function currentFormatName() {
    return boardFormats.find((f) => f.width_mm === form.boardWidthMm && f.height_mm === form.boardHeightMm)?.name || ''
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [projects]
  )

  const hasProjects = projects.length > 0
  const hasResults = sortedProjects.length > 0

  if (loading) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center text-muted-foreground'>
        Cargando proyectos…
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>Proyectos</h1>
          <p className='text-sm text-muted-foreground'>
            Gestiona tus proyectos de optimización y ensamblaje.
          </p>
        </div>
        {!isGuest && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className='mr-2 h-4 w-4' />
                Nuevo proyecto
              </Button>
            </DialogTrigger>
            <DialogContent className='max-w-2xl'>
              <DialogHeader>
                <DialogTitle>Crear proyecto</DialogTitle>
                <DialogDescription>
                  Define el tablero, material y espesor. Puedes partir de una plantilla paramétrica.
                </DialogDescription>
              </DialogHeader>
              <div className='grid gap-4 py-4 sm:grid-cols-2'>
                <div className='sm:col-span-2'>
                  <Input
                    placeholder='Nombre del proyecto'
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className='sm:col-span-2'>
                  <Input
                    placeholder='Descripción (opcional)'
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <Select
                  label='Material'
                  value={form.materialType}
                  onChange={(e) => updateMaterial(e.target.value)}
                >
                  {materials.map((m: CatalogMaterial) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </Select>
                <Select
                  label='Espesor'
                  value={String(form.boardThicknessMm)}
                  onChange={(e) => setForm({ ...form, boardThicknessMm: parseFloat(e.target.value) || 0 })}
                >
                  {thicknessOptions.map((t) => (
                    <option key={t} value={t}>{t} mm</option>
                  ))}
                </Select>
                <Select
                  label='Formato de tablero'
                  value={currentFormatName()}
                  onChange={(e) => updateBoardFormat(e.target.value)}
                >
                  {boardFormats.map((f: BoardFormat) => (
                    <option key={f.name} value={f.name}>
                      {f.name} ({f.width_mm}×{f.height_mm} mm)
                    </option>
                  ))}
                </Select>
                <div className='flex items-center gap-4'>
                  <div className='flex-1'>
                    <label className='text-xs font-medium text-muted-foreground'>Ancho (mm)</label>
                    <Input
                      type='number'
                      value={form.boardWidthMm}
                      onChange={(e) => setForm({ ...form, boardWidthMm: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className='flex-1'>
                    <label className='text-xs font-medium text-muted-foreground'>Alto (mm)</label>
                    <Input
                      type='number'
                      value={form.boardHeightMm}
                      onChange={(e) => setForm({ ...form, boardHeightMm: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <Select
                  label='Plantilla (opcional)'
                  value={form.templateId}
                  onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                >
                  <option value=''>Sin plantilla (piezas manual)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </Select>
                <label className='flex items-center gap-2 text-sm text-foreground'>
                  <input
                    type='checkbox'
                    checked={form.useOffcuts}
                    onChange={(e) => setForm({ ...form, useOffcuts: e.target.checked })}
                    className='h-4 w-4 rounded border-border text-primary focus:ring-ring'
                  />
                  Usar sobrantes del inventario primero
                </label>
                {form.templateId && (
                  <>
                    <div>
                      <label className='text-xs font-medium text-muted-foreground'>Ancho mueble (mm)</label>
                      <Input
                        type='number'
                        value={form.ancho}
                        onChange={(e) => setForm({ ...form, ancho: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className='text-xs font-medium text-muted-foreground'>Alto mueble (mm)</label>
                      <Input
                        type='number'
                        value={form.alto}
                        onChange={(e) => setForm({ ...form, alto: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className='text-xs font-medium text-muted-foreground'>Profundidad (mm)</label>
                      <Input
                        type='number'
                        value={form.profundidad}
                        onChange={(e) => setForm({ ...form, profundidad: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant='outline' onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createProject}>Crear e ir al optimizador</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {hasProjects && (
        <div className='flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end'>
          <div className='relative flex-1'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              placeholder='Buscar por nombre o descripción'
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              className='pl-9'
              aria-label='Buscar proyectos'
            />
          </div>
          <Select
            label='Estado'
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select
            label='Material'
            value={filters.materialType}
            onChange={(e) => setFilters((f) => ({ ...f, materialType: e.target.value }))}
          >
            <option value=''>Todos los materiales</option>
            {materials.map((m: CatalogMaterial) => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </Select>
          {activeFiltersCount > 0 && (
            <Button variant='ghost' size='sm' onClick={clearFilters}>
              <X className='mr-1 h-4 w-4' />
              Limpiar ({activeFiltersCount})
            </Button>
          )}
        </div>
      )}

      {!hasProjects ? (
        <div className='space-y-4'>
          <div className='rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center'>
            <LayoutTemplate className='mx-auto h-10 w-10 text-muted-foreground' />
            <h2 className='mt-4 text-lg font-semibold text-foreground'>Aún no tienes proyectos</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              Empieza desde una plantilla paramétrica o crea un proyecto en blanco.
            </p>
          </div>
          <h3 className='text-sm font-medium uppercase tracking-wide text-muted-foreground'>Plantillas recomendadas</h3>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {TEMPLATE_CARD_META.map((meta) => {
              const template = templates.find((t) => t.nombre === meta.nombre)
              return (
                <Card
                  key={meta.nombre}
                  className='transition-colors hover:border-primary/50 hover:bg-accent/50'
                >
                  <CardHeader>
                    <div className={cn('flex h-14 w-14 items-center justify-center rounded-lg', meta.color)}>
                      {meta.icon}
                    </div>
                    <CardTitle className='text-lg'>{meta.nombre}</CardTitle>
                    <CardDescription>
                      {template?.descripcion || 'Plantilla paramétrica list para personalizar.'}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      variant='outline'
                      className='w-full'
                      disabled={!template}
                      rightIcon={<ArrowRight className='h-4 w-4' />}
                      onClick={() => template && openTemplateDialog(template)}
                    >
                      Usar plantilla
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
      ) : !hasResults ? (
        <div className='rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center'>
          <Search className='mx-auto h-10 w-10 text-muted-foreground' />
          <h2 className='mt-4 text-lg font-semibold text-foreground'>No se encontraron proyectos</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Prueba ajustando los filtros de búsqueda.
          </p>
          {activeFiltersCount > 0 && (
            <Button variant='outline' className='mt-4' onClick={clearFilters}>
              <X className='mr-1 h-4 w-4' />
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
          {sortedProjects.map((project) => (
            <Card key={project.id} className='flex flex-col overflow-hidden'>
              <div className='relative aspect-video w-full overflow-hidden bg-muted'>
                {project.stats.thumbnailUrl ? (
                  <img
                    src={project.stats.thumbnailUrl}
                    alt={`Vista previa de ${project.name}`}
                    className='h-full w-full object-cover'
                    loading='lazy'
                  />
                ) : (
                  <div className='flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground'>
                    <ImageOff className='h-10 w-10' />
                    <span className='text-xs'>Sin vista previa</span>
                  </div>
                )}
              </div>
              <CardHeader className='pb-2'>
                <div className='flex items-start justify-between gap-2'>
                  <CardTitle className='line-clamp-1 text-lg'>{project.name}</CardTitle>
                  {!isGuest && (
                    <div className='relative flex items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8'
                        onClick={() => deleteProject(project.id)}
                        aria-label='Eliminar proyecto'
                      >
                        <Trash2 className='h-4 w-4 text-destructive' />
                      </Button>
                    </div>
                  )}
                </div>
                <CardDescription className='line-clamp-2'>
                  {project.description || 'Sin descripción'}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 pb-2'>
                <div className='flex flex-wrap gap-2'>
                  {project.material_type && (
                    <Badge variant='secondary'>{project.material_type}</Badge>
                  )}
                  {project.board_width_mm && project.board_height_mm && (
                    <Badge variant='outline'>
                      {project.board_width_mm}×{project.board_height_mm} mm
                    </Badge>
                  )}
                  {project.board_thickness_mm && (
                    <Badge variant='outline'>{project.board_thickness_mm} mm</Badge>
                  )}
                  {project.progress !== null && (
                    <Badge variant={getProgressVariant(project.progress.percentage)}>
                      {Math.round(project.progress.percentage)}% progreso
                    </Badge>
                  )}
                </div>
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-muted-foreground'>
                    {project.stats.pieceCount} {project.stats.pieceCount === 1 ? 'pieza' : 'piezas'}
                  </span>
                  <Badge variant={getUtilizationVariant(project.stats.utilization)}>
                    {project.stats.utilization !== null ? `${project.stats.utilization}% uso` : 'Sin optimizar'}
                  </Badge>
                </div>
                <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                  <Calendar className='h-3 w-3' />
                  {formatDate(project.created_at)}
                </div>
              </CardContent>
              <CardFooter className='mt-auto flex-wrap gap-2 border-t border-border bg-muted/30 pt-3'>
                <Button variant='outline' size='sm' asChild>
                  <Link to='/optimizer' state={{ projectId: project.id }}>
                    Optimizar
                  </Link>
                </Button>
                <Button variant='outline' size='sm' asChild>
                  <Link to={`/quote/${project.id}`}>Cotizar</Link>
                </Button>
                <Button variant='outline' size='sm' asChild>
                  <Link to={`/assembly/${project.id}`}>Ensamblaje</Link>
                </Button>
                {!isGuest && (
                  <Button variant='ghost' size='sm' onClick={() => duplicateProject(project)}>
                    <Copy className='mr-1 h-3 w-3' />
                    Duplicar
                  </Button>
                )}
                {!isGuest && isPrincipal && (
                  <Button variant='ghost' size='sm' onClick={() => generateGuestPin(project.id)}>
                    <MoreHorizontal className='mr-1 h-3 w-3' />
                    PIN invitado
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.nombre}</DialogTitle>
            <DialogDescription>{selectedTemplate?.descripcion}</DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            {selectedTemplate &&
              Object.entries(selectedTemplate.parametros).map(([key, cfg]) => (
                <div key={key}>
                  <label className='text-sm font-medium capitalize text-foreground'>
                    {key.replace(/_/g, ' ')}
                  </label>
                  <Input
                    type='number'
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={templateParams[key] ?? cfg.default}
                    onChange={(e) =>
                      setTemplateParams({
                        ...templateParams,
                        [key]: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p className='text-xs text-muted-foreground'>
                    {cfg.min} – {cfg.max} (paso {cfg.step})
                  </p>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={useTemplate} isLoading={generatingTemplate}>
              Generar y optimizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIN de invitado</DialogTitle>
            <DialogDescription>
              Comparte este PIN de un solo uso con quien necesite acceso temporal al proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-6'>
            <div className='rounded-lg border border-border bg-muted p-6 text-center'>
              <div className='text-5xl font-bold tracking-[0.2em] text-foreground'>
                {pinResult?.pin}
              </div>
              <p className='mt-2 text-sm text-muted-foreground'>
                Vence a las {pinResult ? formatExpiresAt(pinResult.expires_at) : ''}
              </p>
            </div>
            <p className='text-sm text-muted-foreground'>
              El PIN es de un solo uso y es válido durante 5 minutos. Muéstralo al invitado para que acceda al proyecto.
            </p>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPinDialogOpen(false)}>
              Cerrar
            </Button>
            <Button onClick={copyPin} leftIcon={copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}>
              {copied ? 'Copiado' : 'Copiar PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
