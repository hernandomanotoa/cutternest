import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, PackagePlus, History } from 'lucide-react'
import { api } from '../../api/client'
import type { BoardFormat, CatalogResponse, InventoryItem, InventoryMovement } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { fetchCatalog } from '../../utils/catalog'
import { cn } from '../../utils/cn'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Badge } from '../ui/Badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/Sheet'
import { Tabs, TabsTrigger } from '../ui/Tabs'
import { useUndoableAction } from '../../hooks/useUndoableAction'

type SortKey = 'tipo' | 'espesor_mm' | 'dimensiones' | 'cantidad' | 'estado' | 'area_m2'

type TabKey = 'tableros' | 'sobrantes' | 'alertas' | 'movimientos'

interface SortState {
  key: SortKey
  direction: 'asc' | 'desc'
}

const ESTADOS = ['nuevo', 'sobrante', 'danado'] as const
const TIPOS = ['tablero', 'sobrante'] as const

type Estado = typeof ESTADOS[number]

const ESTADO_VARIANT: Record<Estado, 'default' | 'secondary' | 'warning' | 'danger' | 'success' | 'outline'> = {
  nuevo: 'success',
  sobrante: 'warning',
  danado: 'danger',
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('tableros')
  const [loading, setLoading] = useState(false)
  const [sort, setSort] = useState<SortState>({ key: 'area_m2', direction: 'desc' })
  const [sheetOpen, setSheetOpen] = useState(false)

  const [alertItems, setAlertItems] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const [restockingId, setRestockingId] = useState<string | null>(null)
  const [restockCantidad, setRestockCantidad] = useState(1)
  const [restockMotivo, setRestockMotivo] = useState('')
  const [restockLoading, setRestockLoading] = useState(false)

  const [filters, setFilters] = useState({
    tipo: 'all',
    espesor: 'all',
    estado: 'all',
  })

  const [form, setForm] = useState({
    tipo: 'tablero' as 'tablero' | 'sobrante',
    espesor_mm: 18,
    ancho_mm: 0,
    alto_mm: 0,
    cantidad: 1,
    estado: 'nuevo' as Estado,
  })

  const boardFormats = useMemo(() => catalog?.board_formats || [], [catalog])
  const thicknessOptions = useMemo(() => {
    const values = new Set<number>()
    catalog?.materials?.forEach((m) => m.thicknesses?.forEach((t) => values.add(t)))
    items.forEach((i) => values.add(i.espesor_mm))
    return Array.from(values).sort((a, b) => a - b)
  }, [catalog, items])

  const uniqueStates = useMemo(() => {
    const states = new Set(items.map((i) => i.estado))
    return Array.from(states).sort()
  }, [items])

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || alertItems.find((i) => i.id === selectedItemId) || null,
    [items, alertItems, selectedItemId]
  )

  useEffect(() => {
    fetchCatalog()
      .then((data) => setCatalog(data))
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar catalogo'))
  }, [])

  const loadInventory = async () => {
    try {
      const endpoint = activeTab === 'sobrantes' ? '/inventory/offcuts' : '/inventory'
      const tipoParam = activeTab === 'sobrantes' ? 'offcut' : 'tablero'
      const response = await api.get<InventoryItem[]>(endpoint, { params: { tipo: tipoParam } })
      setItems(response.data)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al cargar inventario')
    }
  }

  const loadAlerts = async () => {
    try {
      const response = await api.get<InventoryItem[]>('/inventory/alerts', { params: { threshold: 2 } })
      setAlertItems(response.data)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al cargar alertas')
    }
  }

  const loadMovements = async (itemId: string) => {
    setMovementsLoading(true)
    try {
      const response = await api.get<InventoryMovement[]>(`/inventory/${itemId}/movements`)
      setMovements(response.data)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al cargar movimientos')
    } finally {
      setMovementsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'tableros' || activeTab === 'sobrantes') {
      loadInventory()
    } else if (activeTab === 'alertas') {
      loadAlerts()
    } else if (activeTab === 'movimientos') {
      if (selectedItemId) {
        loadMovements(selectedItemId)
      } else {
        const first = items[0] || alertItems[0]
        if (first) setSelectedItemId(first.id)
      }
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'movimientos' && selectedItemId) {
      loadMovements(selectedItemId)
    }
  }, [selectedItemId])

  const filteredItems = useMemo(() => {
    let result = items
    if (filters.tipo !== 'all') result = result.filter((i) => i.tipo === filters.tipo)
    if (filters.espesor !== 'all') result = result.filter((i) => i.espesor_mm === Number(filters.espesor))
    if (filters.estado !== 'all') result = result.filter((i) => i.estado === filters.estado)
    return result
  }, [items, filters])

  const sortedItems = useMemo(() => {
    const sorted = [...filteredItems]
    sorted.sort((a, b) => {
      let aValue: number | string
      let bValue: number | string
      if (sort.key === 'dimensiones') {
        aValue = a.ancho_mm * a.alto_mm
        bValue = b.ancho_mm * b.alto_mm
      } else if (sort.key === 'tipo') {
        aValue = a.tipo
        bValue = b.tipo
      } else if (sort.key === 'espesor_mm') {
        aValue = a.espesor_mm
        bValue = b.espesor_mm
      } else if (sort.key === 'cantidad') {
        aValue = a.cantidad
        bValue = b.cantidad
      } else if (sort.key === 'estado') {
        aValue = a.estado
        bValue = b.estado
      } else {
        aValue = a.area_m2
        bValue = b.area_m2
      }
      if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredItems, sort])

  const create = async () => {
    if (form.ancho_mm <= 0 || form.alto_mm <= 0) {
      toast.error('Dimensiones invalidas')
      return
    }
    setLoading(true)
    try {
      await api.post('/inventory', form)
      toast.success('Material agregado')
      setForm({ tipo: 'tablero', espesor_mm: 18, ancho_mm: 0, alto_mm: 0, cantidad: 1, estado: 'nuevo' })
      setSheetOpen(false)
      if (activeTab === 'tableros' || activeTab === 'sobrantes') {
        await loadInventory()
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al agregar')
    } finally {
      setLoading(false)
    }
  }

  const applyFormat = (format: BoardFormat) => {
    setForm((f) => ({ ...f, ancho_mm: format.width_mm, alto_mm: format.height_mm }))
  }

  const toggleSort = (key: SortKey) => {
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'desc' ? 'asc' : 'desc' }))
  }

  const onConsumed = async (id: string) => {
    await api.patch(`/inventory/${id}/consume`, { cantidad: 1 })
    toast.success('Material consumido')
    if (activeTab === 'tableros' || activeTab === 'sobrantes') {
      await loadInventory()
    }
  }

  const openRestock = (item: InventoryItem) => {
    setRestockingId(item.id)
    setRestockCantidad(1)
    setRestockMotivo('')
  }

  const cancelRestock = () => {
    setRestockingId(null)
    setRestockCantidad(1)
    setRestockMotivo('')
  }

  const submitRestock = async (item: InventoryItem) => {
    if (restockCantidad <= 0) {
      toast.error('Cantidad invalida')
      return
    }
    setRestockLoading(true)
    try {
      await api.post(`/inventory/${item.id}/restock`, {
        cantidad: restockCantidad,
        motivo: restockMotivo.trim() || null,
      })
      toast.success('Stock repuesto')
      cancelRestock()
      if (activeTab === 'tableros' || activeTab === 'sobrantes') {
        await loadInventory()
      } else if (activeTab === 'alertas') {
        await loadAlerts()
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || 'Error al reponer')
    } finally {
      setRestockLoading(false)
    }
  }

  const selectItemForMovements = (item: InventoryItem) => {
    setSelectedItemId(item.id)
    setActiveTab('movimientos')
  }

  const isInventoryTab = activeTab === 'tableros' || activeTab === 'sobrantes'
  const currentItems = isInventoryTab ? sortedItems : alertItems

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <h1 className='text-2xl font-bold text-foreground'>Inventario</h1>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className='mr-2 h-4 w-4' />
              Agregar item
            </Button>
          </SheetTrigger>
          <SheetContent side='right'>
            <SheetHeader>
              <SheetTitle>Agregar material</SheetTitle>
            </SheetHeader>
            <div className='mt-6 space-y-4'>
              <Select
                label='Tipo'
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as 'tablero' | 'sobrante' })}
              >
                <option value='tablero'>Tablero</option>
                <option value='sobrante'>Sobrante</option>
              </Select>
              <Input
                type='number'
                placeholder='Espesor (mm)'
                value={form.espesor_mm}
                onChange={(e) => setForm({ ...form, espesor_mm: parseFloat(e.target.value) || 0 })}
              />
              <div className='grid grid-cols-2 gap-3'>
                <Input
                  type='number'
                  placeholder='Ancho (mm)'
                  value={form.ancho_mm || ''}
                  onChange={(e) => setForm({ ...form, ancho_mm: parseFloat(e.target.value) || 0 })}
                />
                <Input
                  type='number'
                  placeholder='Alto (mm)'
                  value={form.alto_mm || ''}
                  onChange={(e) => setForm({ ...form, alto_mm: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <Input
                type='number'
                placeholder='Cantidad'
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: parseInt(e.target.value) || 1 })}
              />
              <Select
                label='Estado'
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as Estado })}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </Select>
              <Select
                label='Formato rapido'
                value=''
                onChange={(e) => {
                  const format = boardFormats.find((f) => f.name === e.target.value)
                  if (format) applyFormat(format)
                }}
              >
                <option value=''>Seleccionar formato</option>
                {boardFormats.map((f: BoardFormat) => (
                  <option key={f.name} value={f.name}>{f.name} ({f.width_mm}×{f.height_mm})</option>
                ))}
              </Select>
              <Button onClick={create} isLoading={loading} className='w-full'>Guardar</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsTrigger value='tableros'>Tableros</TabsTrigger>
        <TabsTrigger value='sobrantes'>Sobrantes</TabsTrigger>
        <TabsTrigger value='alertas'>Alertas</TabsTrigger>
        <TabsTrigger value='movimientos'>Movimientos</TabsTrigger>
      </Tabs>

      {isInventoryTab && (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              <Select value={filters.tipo} onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}>
                <option value='all'>Todos los tipos</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </Select>
              <Select value={filters.espesor} onChange={(e) => setFilters({ ...filters, espesor: e.target.value })}>
                <option value='all'>Todos los espesores</option>
                {thicknessOptions.map((t) => (
                  <option key={t} value={String(t)}>{t} mm</option>
                ))}
              </Select>
              <Select value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}>
                <option value='all'>Todos los estados</option>
                {uniqueStates.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'movimientos' ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedItemId ? (
              <div className='py-8 text-center text-muted-foreground'>
                <p>Selecciona un item del inventario para ver sus movimientos.</p>
                <p className='text-sm mt-2'>Puedes hacer clic en una fila de Tableros o Sobrantes, o usar el botón Movimientos.</p>
              </div>
            ) : movementsLoading ? (
              <p className='py-8 text-center text-muted-foreground'>Cargando movimientos...</p>
            ) : (
              <div className='space-y-4'>
                {selectedItem && (
                  <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                    <span className='font-medium text-foreground'>
                      {selectedItem.tipo} {selectedItem.espesor_mm} mm — {selectedItem.ancho_mm}×{selectedItem.alto_mm} mm
                    </span>
                    <span>· Stock actual: {selectedItem.cantidad}</span>
                  </div>
                )}
                <div className='overflow-x-auto rounded-md border'>
                  <table className='w-full text-sm'>
                    <thead className='bg-muted/50 text-muted-foreground'>
                      <tr>
                        <th className='p-3 text-left font-medium'>Tipo</th>
                        <th className='p-3 text-left font-medium'>Cantidad</th>
                        <th className='p-3 text-left font-medium'>Motivo</th>
                        <th className='p-3 text-left font-medium'>Fecha</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border'>
                      {movements.map((m) => (
                        <tr key={m.id} className='hover:bg-muted/30'>
                          <td className='p-3 capitalize'>
                            <Badge variant={m.tipo === 'entrada' ? 'success' : 'warning'}>
                              {m.tipo}
                            </Badge>
                          </td>
                          <td className='p-3'>{m.cantidad}</td>
                          <td className='p-3'>{m.motivo || '—'}</td>
                          <td className='p-3'>{formatDate(m.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {movements.length === 0 && (
                    <p className='text-center text-muted-foreground py-8'>No hay movimientos registrados.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>
              {activeTab === 'alertas' ? 'Stock bajo' : 'Stock'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-md border'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/50 text-muted-foreground'>
                  <tr>
                    <SortableHeader sort={sort} sortKey='tipo' onClick={toggleSort}>Tipo</SortableHeader>
                    <SortableHeader sort={sort} sortKey='espesor_mm' onClick={toggleSort}>Espesor</SortableHeader>
                    <SortableHeader sort={sort} sortKey='dimensiones' onClick={toggleSort}>Dimensiones</SortableHeader>
                    <SortableHeader sort={sort} sortKey='cantidad' onClick={toggleSort}>Cantidad</SortableHeader>
                    <SortableHeader sort={sort} sortKey='estado' onClick={toggleSort}>Estado</SortableHeader>
                    <SortableHeader sort={sort} sortKey='area_m2' onClick={toggleSort}>Área m²</SortableHeader>
                    <th className='p-3 text-left font-medium'>Vista</th>
                    <th className='p-3 text-right font-medium'></th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-border'>
                  {currentItems.map((item) => (
                    <InventoryRow
                      key={item.id}
                      item={item}
                      selected={selectedItemId === item.id}
                      restocking={restockingId === item.id}
                      restockCantidad={restockCantidad}
                      restockMotivo={restockMotivo}
                      restockLoading={restockLoading}
                      onSelect={() => setSelectedItemId(item.id)}
                      onConsume={() => onConsumed(item.id)}
                      onRestock={() => openRestock(item)}
                      onCancelRestock={cancelRestock}
                      onSubmitRestock={() => submitRestock(item)}
                      onMovements={() => selectItemForMovements(item)}
                      onCantidadChange={(v) => setRestockCantidad(v)}
                      onMotivoChange={(v) => setRestockMotivo(v)}
                    />
                  ))}
                </tbody>
              </table>
              {currentItems.length === 0 && (
                <p className='text-center text-muted-foreground py-8'>No hay materiales registrados.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface InventoryRowProps {
  item: InventoryItem
  selected: boolean
  restocking: boolean
  restockCantidad: number
  restockMotivo: string
  restockLoading: boolean
  onSelect: () => void
  onConsume: () => void
  onRestock: () => void
  onCancelRestock: () => void
  onSubmitRestock: () => void
  onMovements: () => void
  onCantidadChange: (value: number) => void
  onMotivoChange: (value: string) => void
}

function InventoryRow({
  item,
  selected,
  restocking,
  restockCantidad,
  restockMotivo,
  restockLoading,
  onSelect,
  onConsume,
  onRestock,
  onCancelRestock,
  onSubmitRestock,
  onMovements,
  onCantidadChange,
  onMotivoChange,
}: InventoryRowProps) {
  const { execute, isPending } = useUndoableAction({
    onExecute: onConsume,
    executingMessage: 'Consumir 1 unidad',
    delayMs: 5000,
  })

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer transition-colors',
          selected ? 'bg-muted' : 'hover:bg-muted/30'
        )}
        onClick={onSelect}
      >
        <td className='p-3 capitalize'>{item.tipo}</td>
        <td className='p-3'>{item.espesor_mm} mm</td>
        <td className='p-3'>{item.ancho_mm}×{item.alto_mm} mm</td>
        <td className='p-3'>{item.cantidad}</td>
        <td className='p-3'>
          <Badge variant={ESTADO_VARIANT[item.estado as Estado] || 'default'}>
            {item.estado}
          </Badge>
        </td>
        <td className='p-3'>{item.area_m2.toFixed(2)}</td>
        <td className='p-3'>
          <MiniRectangle ancho={item.ancho_mm} alto={item.alto_mm} />
        </td>
        <td className='p-3 text-right'>
          <div className='flex items-center justify-end gap-2'>
            <Button size='sm' variant='ghost' onClick={(e) => { e.stopPropagation(); onMovements() }} title='Ver movimientos' aria-label='Ver movimientos'>
              <History className='h-4 w-4' />
              <span className='sr-only'>Ver movimientos</span>
            </Button>
            <Button size='sm' variant='outline' onClick={(e) => { e.stopPropagation(); onRestock() }}>
              <PackagePlus className='mr-1 h-4 w-4' />
              Reponer
            </Button>
            <Button size='sm' variant='outline' onClick={(e) => { e.stopPropagation(); execute() }} isLoading={isPending}>
              Consumir
            </Button>
          </div>
        </td>
      </tr>
      {restocking && (
        <tr className='bg-muted/40'>
          <td colSpan={8} className='p-3'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-end' onClick={(e) => e.stopPropagation()}>
              <div className='flex-1 min-w-[120px]'>
                <label className='text-xs font-medium text-muted-foreground block mb-1'>Cantidad</label>
                <Input
                  type='number'
                  min={1}
                  value={restockCantidad}
                  onChange={(e) => onCantidadChange(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className='flex-[2] min-w-[200px]'>
                <label className='text-xs font-medium text-muted-foreground block mb-1'>Motivo</label>
                <Input
                  type='text'
                  placeholder='Motivo de la reposición'
                  value={restockMotivo}
                  onChange={(e) => onMotivoChange(e.target.value)}
                />
              </div>
              <div className='flex gap-2'>
                <Button size='sm' onClick={onSubmitRestock} isLoading={restockLoading}>
                  Guardar
                </Button>
                <Button size='sm' variant='outline' onClick={onCancelRestock}>
                  Cancelar
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SortableHeader({
  sort,
  sortKey,
  onClick,
  children,
}: {
  sort: SortState
  sortKey: SortKey
  onClick: (key: SortKey) => void
  children: React.ReactNode
}) {
  const active = sort.key === sortKey
  return (
    <th
      className='p-3 text-left font-medium cursor-pointer select-none hover:text-foreground'
      onClick={() => onClick(sortKey)}
    >
      <span className='flex items-center gap-1'>
        {children}
        {active && <span className='text-xs'>{sort.direction === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  )
}

function MiniRectangle({ ancho, alto }: { ancho: number; alto: number }) {
  const max = Math.max(ancho, alto, 1)
  const width = Math.max((ancho / max) * 32, 4)
  const height = Math.max((alto / max) * 32, 4)
  return (
    <div className='h-10 w-10 rounded border border-border bg-muted/50 flex items-center justify-center'>
      <div
        className='rounded-sm bg-primary/80'
        style={{ width: `${width}px`, height: `${height}px` }}
        title={`${ancho}×${alto} mm`}
      />
    </div>
  )
}
