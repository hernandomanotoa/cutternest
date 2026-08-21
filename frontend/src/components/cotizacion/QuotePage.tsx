import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Trash2, FileText, Plus, ChevronDown, ChevronUp, History } from 'lucide-react'
import { api } from '../../api/client'
import type { HardwareItem, Project, CatalogResponse, CatalogMaterial, Quote, HardwareTemplate, ProjectQuote } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { fetchCatalog } from '../../utils/catalog'
import { cn } from '../../utils/cn'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { Separator } from '../ui/Separator'

export function QuotePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [hardware, setHardware] = useState<HardwareItem[]>([])
  const [costoM2, setCostoM2] = useState(8.5)
  const [materialAreaM2, setMaterialAreaM2] = useState(0)
  const [costoHora, setCostoHora] = useState(5.0)
  const [horasManoObra, setHorasManoObra] = useState(1)
  const [margen, setMargen] = useState(1.3)
  const [project, setProject] = useState<Project | null>(null)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [templates, setTemplates] = useState<HardwareTemplate[]>([])
  const [quotes, setQuotes] = useState<ProjectQuote[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      api.get(`/projects/${projectId}`),
      fetchCatalog(),
      api.get<HardwareTemplate[]>(`/quotes/hardware-templates`),
      api.get<ProjectQuote[]>(`/projects/${projectId}/quotes`),
    ])
      .then(([res, data, templatesRes, quotesRes]) => {
        const p: Project = res.data
        setProject(p)
        setCatalog(data)
        setTemplates(templatesRes.data)
        setQuotes(quotesRes.data)
        if (p.board_width_mm && p.board_height_mm) {
          setMaterialAreaM2((p.board_width_mm * p.board_height_mm) / 1000000)
        }
        const material = data.materials.find(
          (m: CatalogMaterial) => m.name === (p.material_type || 'MDF Melamina')
        )
        const thickness = p.board_thickness_mm || 18
        const price = material?.prices?.[String(thickness)]
        if (price) setCostoM2(price)
      })
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar proyecto'))
  }, [projectId])

  const suggestedPrice = useMemo(() => {
    if (!project || !catalog) return null
    const material = catalog.materials.find((m: CatalogMaterial) => m.name === (project.material_type || 'MDF Melamina'))
    const thickness = project.board_thickness_mm || 18
    return material?.prices?.[String(thickness)] ?? null
  }, [project, catalog])

  const breakdown = useMemo(() => {
    const material = costoM2 * materialAreaM2
    const hardwareTotal = hardware.reduce((sum, h) => sum + h.cantidad * h.precio_unit, 0)
    const manoObra = costoHora * horasManoObra
    const subtotal = material + hardwareTotal + manoObra
    const total = subtotal * margen
    return { material, hardware: hardwareTotal, manoObra, subtotal, total }
  }, [costoM2, materialAreaM2, hardware, costoHora, horasManoObra, margen])

  const updateHardware = (index: number, patch: Partial<HardwareItem>) => {
    setHardware((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  const removeItem = (index: number) => {
    setHardware((prev) => prev.filter((_, i) => i !== index))
  }

  const addItem = () => {
    setHardware((prev) => [...prev, { item: '', cantidad: 1, precio_unit: 0 }])
  }

  const addTemplateItem = (template: HardwareTemplate) => {
    setHardware((prev) => [...prev, { item: template.item, cantidad: 1, precio_unit: template.precio_unit }])
  }

  const generate = async () => {
    if (!projectId) return
    setGenerating(true)
    try {
      const response = await api.post<Quote>(`/projects/${projectId}/quote`, {
        hardware,
        costo_m2_mdf: costoM2,
        costo_hora_mano_obra: costoHora,
        horas_mano_obra: horasManoObra,
        margen,
      })
      const data = response.data
      toast.success('Cotización generada')
      if (data.pdf_path) {
        window.open(data.pdf_path, '_blank', 'noopener,noreferrer')
      }
      if (projectId) {
        api.get<ProjectQuote[]>(`/projects/${projectId}/quotes`).then((res) => setQuotes(res.data))
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al generar cotización')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <h1 className='text-2xl font-bold text-foreground'>Cotización</h1>
        {project && (
          <Badge variant='secondary'>
            {project.name} — {project.board_width_mm}×{project.board_height_mm} mm
          </Badge>
        )}
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Parámetros</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <label className='mb-1 block text-sm font-medium text-foreground'>Costo material por m² (USD)</label>
                <div className='flex items-center gap-2'>
                  <Input
                    type='number'
                    value={costoM2}
                    onChange={(e) => setCostoM2(parseFloat(e.target.value) || 0)}
                    className='flex-1'
                  />
                  {suggestedPrice !== null && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setCostoM2(suggestedPrice)}
                    >
                      Sugerido: ${suggestedPrice.toFixed(2)}
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className='mb-1 block text-sm font-medium text-foreground'>Área material m²</label>
                <Input
                  type='number'
                  value={materialAreaM2}
                  onChange={(e) => setMaterialAreaM2(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='mb-1 block text-sm font-medium text-foreground'>Costo hora MO</label>
                  <Input
                    type='number'
                    value={costoHora}
                    onChange={(e) => setCostoHora(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-foreground'>Horas MO</label>
                  <Input
                    type='number'
                    value={horasManoObra}
                    onChange={(e) => setHorasManoObra(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div>
                <label className='mb-1 block text-sm font-medium text-foreground'>Margen</label>
                <Input
                  type='number'
                  step={0.1}
                  value={margen}
                  onChange={(e) => setMargen(parseFloat(e.target.value) || 1)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Hardware</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {templates.length > 0 && (
                <div>
                  <span className='mb-2 block text-sm font-medium text-foreground'>Plantillas</span>
                  <div className='flex flex-wrap gap-2'>
                    {templates.map((t, idx) => (
                      <Button
                        key={`${t.item}-${idx}`}
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => addTemplateItem(t)}
                        leftIcon={<Plus className='h-3.5 w-3.5' />}
                      >
                        {t.item} (${t.precio_unit.toFixed(2)})
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className='overflow-x-auto rounded-md border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-muted-foreground'>
                    <tr>
                      <th className='p-3 text-left font-medium'>Item</th>
                      <th className='p-3 text-left font-medium w-24'>Cantidad</th>
                      <th className='p-3 text-left font-medium w-28'>P/U USD</th>
                      <th className='p-3 text-right font-medium w-24'>Subtotal</th>
                      <th className='p-3 w-10'></th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border'>
                    {hardware.map((h, i) => (
                      <tr key={i} className='hover:bg-muted/30'>
                        <td className='p-2'>
                          <Input
                            value={h.item}
                            onChange={(e) => updateHardware(i, { item: e.target.value })}
                            placeholder='Item'
                            aria-label='Item'
                          />
                        </td>
                        <td className='p-2'>
                          <Input
                            type='number'
                            value={h.cantidad}
                            onChange={(e) => updateHardware(i, { cantidad: parseFloat(e.target.value) || 0 })}
                            aria-label='Cantidad'
                          />
                        </td>
                        <td className='p-2'>
                          <Input
                            type='number'
                            value={h.precio_unit}
                            onChange={(e) => updateHardware(i, { precio_unit: parseFloat(e.target.value) || 0 })}
                            aria-label='Precio unitario'
                          />
                        </td>
                        <td className='p-2 text-right'>{`$${(h.cantidad * h.precio_unit).toFixed(2)}`}</td>
                        <td className='p-2'>
                          <Button variant='ghost' size='icon' onClick={() => removeItem(i)} aria-label='Eliminar'>
                            <Trash2 className='h-4 w-4 text-destructive' />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    <tr className='bg-muted/20'>
                      <td className='p-2' colSpan={5}>
                        <Button type='button' variant='outline' onClick={addItem} className='w-full'>
                          Agregar item
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='space-y-6'>
          <Card className='border-l-4 border-l-primary'>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <FileText className='h-5 w-5' />
                Desglose
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <BreakdownRow label='Material' value={breakdown.material} />
              <BreakdownRow label='Hardware' value={breakdown.hardware} />
              <BreakdownRow label='Mano de obra' value={breakdown.manoObra} />
              <Separator />
              <BreakdownRow label='Subtotal' value={breakdown.subtotal} highlight />
              <BreakdownRow label={`Margen (${(margen * 100).toFixed(0)}%)`} value={breakdown.total - breakdown.subtotal} />
              <Separator />
              <div className='flex items-center justify-between pt-2'>
                <span className='text-xl font-bold text-foreground'>Total</span>
                <span className='text-2xl font-bold text-primary'>${breakdown.total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Button onClick={generate} isLoading={generating} className='w-full h-12 text-lg'>
            Generar PDF
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className='text-lg flex items-center gap-2'>
                <History className='h-5 w-5' />
                Historial de cotizaciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No hay cotizaciones previas.</p>
              ) : (
                <div className='space-y-3'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setHistoryOpen((v) => !v)}
                    rightIcon={historyOpen ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                  >
                    {historyOpen ? 'Ocultar historial' : 'Mostrar historial'}
                  </Button>
                  {historyOpen && (
                    <div className='overflow-x-auto rounded-md border'>
                      <table className='w-full text-sm'>
                        <thead className='bg-muted/50 text-muted-foreground'>
                          <tr>
                            <th className='p-3 text-left font-medium'>Fecha</th>
                            <th className='p-3 text-right font-medium'>Total</th>
                            <th className='p-3 text-center font-medium'>PDF</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-border'>
                          {quotes.map((q) => (
                            <tr key={q.id} className='hover:bg-muted/30'>
                              <td className='p-3 text-foreground'>
                                {new Date(q.created_at).toLocaleString('es-ES', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </td>
                              <td className='p-3 text-right font-medium text-foreground'>
                                ${q.total.toFixed(2)}
                              </td>
                              <td className='p-3 text-center'>
                                {q.pdf_path ? (
                                  <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    onClick={() => window.open(q.pdf_path, '_blank', 'noopener,noreferrer')}
                                    aria-label='Abrir PDF'
                                  >
                                    <FileText className='h-4 w-4 text-primary' />
                                  </Button>
                                ) : (
                                  <span className='text-xs text-muted-foreground'>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between', highlight && 'font-semibold text-foreground')}>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('text-foreground', highlight && 'font-semibold')}>${value.toFixed(2)}</span>
    </div>
  )
}
