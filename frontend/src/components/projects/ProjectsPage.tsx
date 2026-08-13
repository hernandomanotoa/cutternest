import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { Project, Template } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', templateId: '', ancho: 120, alto: 180, profundidad: 50 })
  const navigate = useNavigate()

  useEffect(() => {
    loadProjects()
    loadTemplates()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await api.get('/projects')
      setProjects(response.data)
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al cargar proyectos')
    } finally {
      setLoading(false)
    }
  }

  const loadTemplates = async () => {
    try {
      const response = await api.get('/templates')
      setTemplates(response.data)
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al cargar plantillas')
    }
  }

  const createProject = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    try {
      const payload = {
        name: form.name,
        description: form.description,
        board_width_cm: 244,
        board_height_cm: 122,
        board_thickness_mm: 18,
      }
      const response = await api.post('/projects', payload)
      const project: Project = response.data

      if (form.templateId) {
        const tmplResponse = await api.post(`/templates/${form.templateId}/generate`, {
          ancho: form.ancho,
          alto: form.alto,
          profundidad: form.profundidad,
        })
        navigate('/optimizer', { state: { projectId: project.id, pieces: tmplResponse.data.piezas } })
      } else {
        navigate('/optimizer', { state: { projectId: project.id } })
      }
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al crear proyecto')
    }
  }

  const deleteProject = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    try {
      await api.delete(`/projects/${id}`)
      setProjects(projects.filter((p) => p.id !== id))
      toast.success('Proyecto eliminado')
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al eliminar')
    }
  }

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-7xl mx-auto'>
        <div className='flex items-center justify-between mb-6'>
          <h1 className='text-2xl font-bold text-slate-800'>Proyectos</h1>
          <div className='flex gap-3'>
            <Link to='/' className='btn-secondary'>Volver</Link>
            <button onClick={() => setShowForm(!showForm)} className='btn-primary'>Nuevo proyecto</button>
          </div>
        </div>

        {showForm && (
          <div className='card mb-6'>
            <h2 className='text-lg font-semibold mb-4'>Crear proyecto</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
              <input
                placeholder='Nombre del proyecto'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
              />
              <input
                placeholder='Descripcion (opcional)'
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className='input-field'
              />
              <select
                value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                className='input-field'
              >
                <option value=''>Sin plantilla (piezas manual)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              {form.templateId && (
                <>
                  <input
                    type='number'
                    placeholder='Ancho (cm)'
                    value={form.ancho}
                    onChange={(e) => setForm({ ...form, ancho: parseFloat(e.target.value) || 0 })}
                    className='input-field'
                  />
                  <input
                    type='number'
                    placeholder='Alto (cm)'
                    value={form.alto}
                    onChange={(e) => setForm({ ...form, alto: parseFloat(e.target.value) || 0 })}
                    className='input-field'
                  />
                  <input
                    type='number'
                    placeholder='Profundidad (cm)'
                    value={form.profundidad}
                    onChange={(e) => setForm({ ...form, profundidad: parseFloat(e.target.value) || 0 })}
                    className='input-field'
                  />
                </>
              )}
            </div>
            <div className='flex gap-3'>
              <button onClick={createProject} className='btn-primary'>Crear e ir al optimizador</button>
              <button onClick={() => setShowForm(false)} className='btn-secondary'>Cancelar</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className='text-center text-slate-600'>Cargando...</div>
        ) : projects.length === 0 ? (
          <div className='card text-center text-slate-600'>No hay proyectos. Crea uno nuevo.</div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {projects.map((p) => (
              <div key={p.id} className='card'>
                <h3 className='text-lg font-semibold text-slate-800'>{p.name}</h3>
                <p className='text-sm text-slate-600 mb-4'>{p.description || 'Sin descripcion'}</p>
                <p className='text-xs text-slate-500 mb-4'>
                  Tablero: {p.board_width_cm}x{p.board_height_cm} cm · Espesor: {p.board_thickness_mm} mm
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Link to='/optimizer' state={{ projectId: p.id }} className='btn-secondary text-sm'>
                    Optimizar
                  </Link>
                  <Link to={`/quote/${p.id}`} className='btn-secondary text-sm'>
                    Cotizar
                  </Link>
                  <Link to={`/assembly/${p.id}`} className='btn-secondary text-sm'>
                    Ensamblaje
                  </Link>
                  <button onClick={() => deleteProject(p.id)} className='text-red-600 text-sm hover:underline'>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
