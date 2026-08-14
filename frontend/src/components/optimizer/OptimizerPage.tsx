import { useState, useEffect, useRef, useMemo, type ChangeEvent } from 'react'
import { HexColorPicker } from 'react-colorful'
import toast from 'react-hot-toast'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'
import type { BoardResult, BoardFormat, CatalogColor, CatalogMaterial, CatalogResponse, PieceInput, Project } from '../../types'
import { Tablero3D } from './Tablero3D'
import { Layout2D } from './Layout2D'
import { PieceCountTab } from './PieceCountTab'
import { generateCsv, parseCsv, downloadCsv } from '../../utils/piecesCsv'
import { groupPiecesByDimensions, totalPieces } from '../../utils/pieceCounter'
import { loadTemplate, saveTemplate, clearTemplate, hasTemplate } from '../../utils/pieceTemplate'
import { fetchCatalog } from '../../utils/catalog'

const ejemploEstanteria: PieceInput[] = [
  { id: 'base', nombre: 'Base', ancho: 120, alto: 60, cantidad: 1, rotar: true, color: '#FF6B6B', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'tapa', nombre: 'Tapa', ancho: 120, alto: 60, cantidad: 1, rotar: true, color: '#4ECDC4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'lateral-izq', nombre: 'Lateral Izq', ancho: 50, alto: 180, cantidad: 1, rotar: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,L' },
  { id: 'lateral-der', nombre: 'Lateral Der', ancho: 50, alto: 180, cantidad: 1, rotar: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,R' },
  { id: 'estante-1', nombre: 'Estante 1', ancho: 100, alto: 30, cantidad: 1, rotar: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-2', nombre: 'Estante 2', ancho: 100, alto: 30, cantidad: 1, rotar: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-3', nombre: 'Estante 3', ancho: 100, alto: 30, cantidad: 1, rotar: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'estante-4', nombre: 'Estante 4', ancho: 100, alto: 30, cantidad: 1, rotar: true, color: '#96CEB4', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'puerta-izq', nombre: 'Puerta Izq', ancho: 80, alto: 40, cantidad: 1, rotar: true, color: '#FFEAA7', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'puerta-der', nombre: 'Puerta Der', ancho: 80, alto: 40, cantidad: 1, rotar: true, color: '#FFEAA7', espesor: 18, cantos: 'T,B,L,R' },
  { id: 'fondo', nombre: 'Fondo', ancho: 60, alto: 180, cantidad: 1, rotar: false, color: '#DDA0DD', espesor: 3, cantos: '' },
]

const DEFAULT_MATERIAL = 'MDF Melamina'
const DEFAULT_THICKNESS = 18

export function OptimizerPage() {
  const location = useLocation()
  const initialProjectId = (location.state as any)?.projectId as string | undefined
  const initialPieces = (location.state as any)?.pieces as PieceInput[] | undefined

  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null)
  const [projectName, setProjectName] = useState('Proyecto nuevo')
  const [tablero, setTablero] = useState({ ancho: 183, alto: 244, espesor: DEFAULT_THICKNESS, kerf_mm: 3, margen_mm: 2 })
  const [materialType, setMaterialType] = useState(DEFAULT_MATERIAL)
  const [piezas, setPiezas] = useState<PieceInput[]>(() => loadTemplate(initialPieces ? [...initialPieces] : [...ejemploEstanteria]))
  const [currentPiece, setCurrentPiece] = useState<PieceInput>({
    id: '',
    nombre: '',
    ancho: 0,
    alto: 0,
    cantidad: 1,
    rotar: true,
    color: '#3B82F6',
    espesor: DEFAULT_THICKNESS,
    cantos: '',
  })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [result, setResult] = useState<BoardResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [view3D, setView3D] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState(0)
  const [useOffcuts, setUseOffcuts] = useState(false)
  const [activeTab, setActiveTab] = useState<'piezas' | 'conteo'>('piezas')
  const [page, setPage] = useState(1)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const perPage = 10
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCatalog()
      .then((data) => {
        setCatalog(data)
        const ecuadorFormat = data.board_formats.find((f) => f.name.includes('Ecuador 183×244')) || data.board_formats[0]
        if (ecuadorFormat) {
          setTablero((t) => ({ ...t, ancho: ecuadorFormat.width_cm, alto: ecuadorFormat.height_cm }))
        }
      })
      .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar catálogo'))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [piezas.length])

  const material = useMemo(() => catalog?.materials.find((m) => m.name === materialType), [catalog, materialType])
  const thicknessOptions = useMemo(() => material?.thicknesses || [DEFAULT_THICKNESS], [material])
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
    const id = currentPiece.id || currentPiece.nombre.toLowerCase().replace(/\s+/g, '-')
    setPiezas([...piezas, { ...currentPiece, id, espesor: currentPiece.espesor || tablero.espesor }])
    setCurrentPiece({ id: '', nombre: '', ancho: 0, alto: 0, cantidad: 1, rotar: true, color: '#3B82F6', espesor: tablero.espesor, cantos: '' })
  }

  const removePiece = (index: number) => {
    setPiezas(piezas.filter((_, i) => i !== index))
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
          } catch (err: any) {
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
      api.get(`/projects/${projectId}`)
        .then((response) => {
          const project: Project = response.data
          setProjectName(project.name)
          setTablero((t) => ({
            ...t,
            ancho: project.board_width_cm || t.ancho,
            alto: project.board_height_cm || t.alto,
            espesor: project.board_thickness_mm || t.espesor,
          }))
          if (project.material_type) {
            setMaterialType(project.material_type)
          }
        })
        .catch((err) => toast.error(getApiErrorMessage(err) || 'Error al cargar proyecto'))
    }
  }, [projectId])

  const totalPages = Math.max(1, Math.ceil(piezas.length / perPage))
  const paginatedPieces = useMemo(() => piezas.slice((page - 1) * perPage, page * perPage), [piezas, page])
  const startItem = piezas.length === 0 ? 0 : (page - 1) * perPage + 1
  const endItem = Math.min(page * perPage, piezas.length)
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
        board_width_cm: tablero.ancho,
        board_height_cm: tablero.alto,
        board_thickness_mm: tablero.espesor,
        material_type: materialType,
      })
      const project: Project = response.data
      setProjectId(project.id)
      setProjectName(project.name)
      return project.id
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al crear proyecto')
      return null
    }
  }

  const optimize = async () => {
    setLoading(true)
    try {
      const pid = await ensureProject()
      if (!pid) {
        setLoading(false)
        return
      }
      const response = await api.post(`/projects/${pid}/optimize`, {
        tablero,
        piezas,
        usar_sobrantes: useOffcuts,
        material_type: materialType,
      })
      setResult(response.data.tableros)
      setSelectedBoard(0)
      toast.success(`Optimizado en ${response.data.total_tableros} tablero(s)`)
    } catch (err: any) {
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
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al guardar piezas')
    } finally {
      setLoading(false)
    }
  }

  const generatePdf = async (type: 'cutlist' | 'labels') => {
    if (!projectId) return
    try {
      const response = await api.post(`/projects/${projectId}/${type}`)
      const path = response.data.pdf_path
      if (path) {
        window.open(path, '_blank')
        toast.success(`${type === 'cutlist' ? 'Cut list' : 'Etiquetas'} generado`)
      }
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al generar PDF')
    }
  }

  const applyBoardFormat = (format: BoardFormat) => {
    setTablero((t) => ({ ...t, ancho: format.width_cm, alto: format.height_cm }))
  }

  const setColor = (hex: string) => {
    setCurrentPiece((p) => ({ ...p, color: hex }))
  }

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-7xl mx-auto'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-2xl font-bold text-slate-800'>Optimizador de cortes</h1>
            {projectId && <p className='text-sm text-slate-600'>{projectName}</p>}
          </div>
          <div className='flex gap-3'>
            <Link to='/projects' className='btn-secondary'>Proyectos</Link>
            <button onClick={() => window.history.back()} className='btn-secondary'>Volver</button>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <div className='space-y-6'>
            <div className='card'>
              <h2 className='text-lg font-semibold mb-4'>Tablero</h2>
              <div className='space-y-3'>
                <div>
                  <label className='block text-xs font-medium text-slate-600 mb-1'>Material</label>
                  <select
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                    className='input-field w-full'
                  >
                    {catalog?.materials.map((m: CatalogMaterial) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-medium text-slate-600 mb-1'>Espesor (mm)</label>
                  <select
                    value={tablero.espesor}
                    onChange={(e) => setTablero({ ...tablero, espesor: parseFloat(e.target.value) || DEFAULT_THICKNESS })}
                    className='input-field w-full'
                  >
                    {thicknessOptions.map((t) => (
                      <option key={t} value={t}>{t} mm</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-medium text-slate-600 mb-1'>Formato de placa</label>
                  <select
                    value={`${tablero.ancho}x${tablero.alto}`}
                    onChange={(e) => {
                      const format = catalog?.board_formats.find((f) => `${f.width_cm}x${f.height_cm}` === e.target.value)
                      if (format) applyBoardFormat(format)
                    }}
                    className='input-field w-full'
                  >
                    {catalog?.board_formats.map((f: BoardFormat) => (
                      <option key={`${f.width_cm}x${f.height_cm}`} value={`${f.width_cm}x${f.height_cm}`}>{f.name} ({f.width_cm}×{f.height_cm} cm)</option>
                    ))}
                  </select>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs font-medium text-slate-600 mb-1'>Ancho (cm)</label>
                    <input type='number' value={tablero.ancho} onChange={(e) => setTablero({ ...tablero, ancho: parseFloat(e.target.value) || 0 })} className='input-field' />
                  </div>
                  <div>
                    <label className='block text-xs font-medium text-slate-600 mb-1'>Alto (cm)</label>
                    <input type='number' value={tablero.alto} onChange={(e) => setTablero({ ...tablero, alto: parseFloat(e.target.value) || 0 })} className='input-field' />
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs font-medium text-slate-600 mb-1'>Kerf (mm)</label>
                    <input type='number' value={tablero.kerf_mm} onChange={(e) => setTablero({ ...tablero, kerf_mm: parseFloat(e.target.value) || 0 })} className='input-field' />
                  </div>
                  <div>
                    <label className='block text-xs font-medium text-slate-600 mb-1'>Margen (mm)</label>
                    <input type='number' value={tablero.margen_mm} onChange={(e) => setTablero({ ...tablero, margen_mm: parseFloat(e.target.value) || 0 })} className='input-field' />
                  </div>
                </div>
                <label className='flex items-center mt-2 text-sm text-slate-700'>
                  <input type='checkbox' checked={useOffcuts} onChange={(e) => setUseOffcuts(e.target.checked)} className='mr-2' />
                  Usar sobrantes del inventario primero
                </label>
              </div>
            </div>

            <div className='card'>
              <h2 className='text-lg font-semibold mb-4'>Agregar pieza</h2>
              <div className='space-y-3'>
                <input placeholder='Nombre' value={currentPiece.nombre} onChange={(e) => setCurrentPiece({ ...currentPiece, nombre: e.target.value })} className='input-field' />
                <div className='grid grid-cols-2 gap-3'>
                  <input type='number' placeholder='Ancho (cm)' value={currentPiece.ancho || ''} onChange={(e) => setCurrentPiece({ ...currentPiece, ancho: parseFloat(e.target.value) || 0 })} className='input-field' />
                  <input type='number' placeholder='Alto (cm)' value={currentPiece.alto || ''} onChange={(e) => setCurrentPiece({ ...currentPiece, alto: parseFloat(e.target.value) || 0 })} className='input-field' />
                </div>
                <div className='flex items-center gap-3'>
                  <label className='text-sm text-slate-600'>Color</label>
                  <button onClick={() => setShowColorPicker(!showColorPicker)} className='w-8 h-8 rounded border' style={{ backgroundColor: currentPiece.color }} />
                  {showColorPicker && (
                    <div className='absolute z-10 mt-8'>
                      <HexColorPicker color={currentPiece.color} onChange={setColor} />
                    </div>
                  )}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {colorPresets.map((c: CatalogColor) => (
                    <button
                      key={c.hex}
                      title={c.name}
                      onClick={() => setColor(c.hex)}
                      className='w-6 h-6 rounded border border-slate-300'
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
                <label className='flex items-center text-sm text-slate-700'>
                  <input type='checkbox' checked={currentPiece.rotar} onChange={(e) => setCurrentPiece({ ...currentPiece, rotar: e.target.checked })} className='mr-2' />
                  Permitir rotacion
                </label>
                <button onClick={addPiece} className='w-full btn-secondary'>Agregar pieza</button>
              </div>
            </div>
          </div>

          <div className='lg:col-span-2 space-y-6'>
            <div className='card'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
                <div className='flex items-center gap-2'>
                  <button
                    onClick={() => setActiveTab('piezas')}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'piezas' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Piezas ({piezas.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('conteo')}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'conteo' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Conteo
                  </button>
                </div>
                <div className='flex gap-2 flex-wrap'>
                  <button onClick={descargarCsv} className='btn-secondary text-sm'>Descargar formato</button>
                  <button onClick={() => fileInputRef.current?.click()} className='btn-secondary text-sm'>Cargar piezas</button>
                  <input ref={fileInputRef} type='file' accept='.csv' onChange={cargarCsv} className='hidden' />
                  <button onClick={guardarPlantilla} className='btn-secondary text-sm'>Guardar plantilla</button>
                  <button onClick={cargarPlantilla} className='btn-secondary text-sm'>Cargar plantilla</button>
                  <button onClick={restaurarEjemplo} className='btn-secondary text-sm'>Restaurar ejemplo</button>
                  <button onClick={() => setPiezas([])} className='btn-secondary text-sm'>Limpiar</button>
                </div>
              </div>

              {activeTab === 'piezas' ? (
                <>
                  <div className='overflow-x-auto'>
                    <table className='w-full text-sm'>
                      <thead className='bg-slate-100 text-slate-700'>
                        <tr>
                          <th className='p-2 text-left'>Nombre</th>
                          <th className='p-2 text-left'>Dimension</th>
                          <th className='p-2 text-left'>Cantidad</th>
                          <th className='p-2 text-left'>Color</th>
                          <th className='p-2'></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPieces.map((p, i) => (
                          <tr key={(page - 1) * perPage + i} className='border-b border-gray-100'>
                            <td className='p-2'>{p.nombre}</td>
                            <td className='p-2'>{p.ancho}x{p.alto} cm</td>
                            <td className='p-2'>{p.cantidad}</td>
                            <td className='p-2'><div className='w-4 h-4 rounded' style={{ backgroundColor: p.color }} /></td>
                            <td className='p-2'><button onClick={() => removePiece((page - 1) * perPage + i)} className='text-red-600 hover:underline'>Eliminar</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className='flex items-center justify-between mt-4 text-sm text-slate-600'>
                      <span>Mostrando {startItem}-{endItem} de {piezas.length}</span>
                      <div className='flex items-center gap-2'>
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className='btn-secondary text-sm disabled:opacity-50'>Anterior</button>
                        <span className='px-2'>{page} / {totalPages}</span>
                        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className='btn-secondary text-sm disabled:opacity-50'>Siguiente</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <PieceCountTab
                  groups={groupedPieces}
                  totalPieces={totalPiecesCount}
                  totalGroups={groupedPieces.length}
                />
              )}

              <div className='flex gap-3 mt-4'>
                <button onClick={savePieces} disabled={loading || piezas.length === 0} className='flex-1 btn-secondary text-sm disabled:opacity-50'>
                  {loading ? 'Guardando...' : 'Guardar piezas'}
                </button>
                <button onClick={optimize} disabled={loading || piezas.length === 0} className='flex-1 btn-primary text-sm disabled:opacity-50'>
                  {loading ? 'Optimizando...' : 'Optimizar'}
                </button>
              </div>
            </div>

            {result && (
              <div className='card'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-lg font-semibold'>Resultados</h2>
                  <div className='flex gap-2'>
                    <button onClick={() => setView3D(!view3D)} className='btn-secondary text-sm'>{view3D ? 'Ver 2D' : 'Ver 3D'}</button>
                  </div>
                </div>
                <div className='flex gap-2 mb-4 flex-wrap'>
                  {result.map((b) => (
                    <button
                      key={b.board_index}
                      onClick={() => setSelectedBoard(b.board_index)}
                      className={`px-3 py-1 rounded text-sm ${selectedBoard === b.board_index ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                    >
                      Tablero {b.board_index + 1} ({b.utilizacion}%)
                    </button>
                  ))}
                </div>
                {view3D ? (
                  <Tablero3D board={result[selectedBoard]} />
                ) : (
                  <Layout2D board={result[selectedBoard]} />
                )}
                {projectId && (
                  <div className='mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
                    <Link to={`/quote/${projectId}`} className='btn-primary text-center text-sm'>Cotizar</Link>
                    <Link to={`/assembly/${projectId}`} className='btn-secondary text-center text-sm'>Ensamblaje</Link>
                    <button onClick={() => generatePdf('cutlist')} className='btn-secondary text-sm'>Cut list PDF</button>
                    <button onClick={() => generatePdf('labels')} className='btn-secondary text-sm'>Etiquetas PDF</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
