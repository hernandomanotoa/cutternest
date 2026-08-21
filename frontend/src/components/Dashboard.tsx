import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Box,
  FolderOpen,
  Package,
  Plus,
  Scissors,
  TrendingUp,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { getApiErrorMessage } from '../utils/apiError'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/Card'
import { Button } from './ui/Button'
import { Skeleton } from './ui/Skeleton'
import type { InventoryItem, Project } from '../types'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ProjectWithUtilization extends Project {
  avgUtilization: number | null
  layoutCount: number
}

interface LayoutSummary {
  utilization: number
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function utilizationTone(value: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  if (value === null) return 'muted'
  if (value >= 85) return 'success'
  if (value >= 70) return 'warning'
  return 'danger'
}

const TONE_CLASSES: Record<
  ReturnType<typeof utilizationTone>,
  { text: string; badge: string }
> = {
  success: {
    text: 'text-success',
    badge: 'bg-success/10 text-success border-success/20',
  },
  warning: {
    text: 'text-warning',
    badge: 'bg-warning/10 text-warning border-warning/20',
  },
  danger: {
    text: 'text-danger',
    badge: 'bg-danger/10 text-danger border-danger/20',
  },
  muted: {
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
}

function barColor(value: number): string {
  if (value >= 85) return 'hsl(var(--success))'
  if (value >= 70) return 'hsl(var(--warning))'
  return 'hsl(var(--danger))'
}

export function Dashboard() {
  const { isGuest } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [offcuts, setOffcuts] = useState<InventoryItem[]>([])
  const [projects, setProjects] = useState<ProjectWithUtilization[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        let inventoryItems: InventoryItem[] = []
        let offcutItems: InventoryItem[] = []
        let rawProjects: Project[] = []

        if (isGuest) {
          const projectsRes = await api.get<Project[]>('/projects')
          rawProjects = projectsRes.data || []
        } else {
          const [inventoryRes, offcutsRes, projectsRes] = await Promise.all([
            api.get<InventoryItem[]>('/inventory'),
            api.get<InventoryItem[]>('/inventory/offcuts'),
            api.get<Project[]>('/projects'),
          ])
          inventoryItems = inventoryRes.data || []
          offcutItems = offcutsRes.data || []
          rawProjects = projectsRes.data || []
        }

        const projectsWithUtil = await Promise.all(
          rawProjects.map(async (p) => {
            try {
              const layoutsRes = await api.get<LayoutSummary[]>(
                `/projects/${p.id}/layouts`
              )
              const values = (layoutsRes.data || [])
                .map((l) => l.utilization)
                .filter((v): v is number => typeof v === 'number')
              const avgUtilization = values.length
                ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
                : null
              return { ...p, avgUtilization, layoutCount: values.length }
            } catch {
              return { ...p, avgUtilization: null, layoutCount: 0 }
            }
          })
        )

        if (cancelled) return
        setInventory(inventoryItems)
        setOffcuts(offcutItems)
        setProjects(projectsWithUtil)
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Error al cargar el dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isGuest])

  const boardCount = useMemo(() => {
    const boards = inventory.filter((i) => i.estado === 'nuevo')
    return boards.length || inventory.length
  }, [inventory])

  const avgUtilization = useMemo(() => {
    const values = projects
      .map((p) => p.avgUtilization)
      .filter((v): v is number => v !== null)
    if (values.length === 0) return null
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }, [projects])

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 8)
  }, [projects])

  const tableProjects = recentProjects.slice(0, 5)

  const chartData = useMemo(() => {
    return recentProjects.map((p) => ({
      name: p.name,
      utilizacion: p.avgUtilization ?? 0,
    }))
  }, [recentProjects])

  function renderKpiValue(
    value: number | null,
    fallback = '—'
  ): React.ReactNode {
    if (loading) return <Skeleton className='h-8 w-16' />
    if (value === null) return <span className='text-2xl font-bold'>{fallback}</span>
    return <span className='text-2xl font-bold'>{value}</span>
  }

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-2xl font-semibold tracking-tight text-foreground'>
          Panel principal
        </h2>
        <p className='text-muted-foreground mt-1'>
          Resumen de inventario, proyectos y utilización.
        </p>
      </div>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Tableros en inventario
            </CardTitle>
            <Package className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {isGuest ? (
              <span className='text-2xl font-bold text-muted-foreground'>—</span>
            ) : (
              renderKpiValue(boardCount)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Sobrantes disponibles
            </CardTitle>
            <Box className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {isGuest ? (
              <span className='text-2xl font-bold text-muted-foreground'>—</span>
            ) : (
              renderKpiValue(offcuts.length)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Proyectos activos
            </CardTitle>
            <FolderOpen className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {renderKpiValue(projects.length || null, '0')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Utilización promedio
            </CardTitle>
            <TrendingUp className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className='h-8 w-16' />
            ) : avgUtilization === null ? (
              <span className='text-2xl font-bold text-muted-foreground'>—</span>
            ) : (
              <div className='flex items-baseline gap-1'>
                <span className='text-2xl font-bold'>{avgUtilization}</span>
                <span className={TONE_CLASSES[utilizationTone(avgUtilization)].text}>
                  %
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
          <CardDescription>
            {isGuest
              ? 'Acciones disponibles para tu sesión de invitado.'
              : 'Acciones más frecuentes del taller.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-3'>
          {!isGuest && (
            <>
              <Button
                leftIcon={<Scissors className='h-4 w-4' />}
                onClick={() => navigate('/optimizer')}
              >
                Optimización rápida
              </Button>
              <Button
                variant='outline'
                leftIcon={<Plus className='h-4 w-4' />}
                onClick={() => navigate('/projects')}
              >
                Nuevo proyecto
              </Button>
              <Button
                variant='secondary'
                leftIcon={<Box className='h-4 w-4' />}
                onClick={() => navigate('/inventory')}
              >
                Registrar sobrante
              </Button>
            </>
          )}
          {isGuest && (
            <Button
              leftIcon={<FolderOpen className='h-4 w-4' />}
              onClick={() => navigate('/projects')}
            >
              Ver proyecto vinculado
            </Button>
          )}
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
        <Card className='xl:col-span-2'>
          <CardHeader>
            <CardTitle>Proyectos recientes</CardTitle>
            <CardDescription>
              Últimos {isGuest ? 'proyecto vinculado' : '5 proyectos'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='space-y-2'>
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
              </div>
            ) : tableProjects.length === 0 ? (
              <div className='rounded-lg border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground'>
                No hay proyectos para mostrar.
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full caption-bottom text-sm'>
                  <thead>
                    <tr className='border-b border-border text-left text-muted-foreground'>
                      <th className='pb-2 font-medium'>Nombre</th>
                      <th className='pb-2 font-medium'>Material</th>
                      <th className='pb-2 font-medium'>Espesor</th>
                      <th className='pb-2 font-medium'>Formato</th>
                      <th className='pb-2 font-medium'>% Utilización</th>
                      <th className='pb-2 font-medium'>Fecha</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border'>
                    {tableProjects.map((p) => {
                      const tone = utilizationTone(p.avgUtilization)
                      const { badge } = TONE_CLASSES[tone]
                      return (
                        <tr
                          key={p.id}
                          className='text-card-foreground hover:bg-muted/30 transition-colors'
                        >
                          <td className='py-3 font-medium'>{p.name}</td>
                          <td className='py-3'>{p.material_type || '—'}</td>
                          <td className='py-3'>
                            {p.board_thickness_mm
                              ? `${p.board_thickness_mm} mm`
                              : '—'}
                          </td>
                          <td className='py-3'>
                            {p.board_width_mm && p.board_height_mm
                              ? `${p.board_width_mm}×${p.board_height_mm} mm`
                              : '—'}
                          </td>
                          <td className='py-3'>
                            {p.avgUtilization === null ? (
                              <span className='text-muted-foreground'>—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge}`}
                              >
                                {p.avgUtilization}%
                              </span>
                            )}
                          </td>
                          <td className='py-3 text-muted-foreground'>
                            {formatDate(p.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Utilización por proyecto</CardTitle>
            <CardDescription>
              {isGuest ? 'Proyecto vinculado.' : 'Hasta 8 proyectos recientes.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className='h-64 w-full' />
            ) : chartData.length === 0 ? (
              <div className='flex h-64 items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground'>
                Sin datos de utilización.
              </div>
            ) : (
              <div className='h-64 w-full min-w-0'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                    <XAxis
                      dataKey='name'
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      interval={0}
                      angle={-35}
                      textAnchor='end'
                      height={55}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        color: 'hsl(var(--card-foreground))',
                        borderRadius: 'var(--radius)',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Utilización']}
                    />
                    <Bar dataKey='utilizacion' radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={barColor(entry.utilizacion)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
