import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { InventoryItem } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [form, setForm] = useState({ tipo: 'MDF', espesor_mm: 18, ancho_cm: 0, alto_cm: 0, cantidad: 1 })
  const [loading, setLoading] = useState(false)

  const load = async () => {
    try {
      const response = await api.get('/inventory')
      setItems(response.data)
    } catch {
      toast.error('Error al cargar inventario')
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (form.ancho_cm <= 0 || form.alto_cm <= 0) {
      toast.error('Dimensiones invalidas')
      return
    }
    setLoading(true)
    try {
      await api.post('/inventory', form)
      toast.success('Material agregado')
      setForm({ ...form, ancho_cm: 0, alto_cm: 0, cantidad: 1 })
      await load()
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al agregar')
    } finally {
      setLoading(false)
    }
  }

  const consume = async (id: string) => {
    try {
      await api.patch(`/inventory/${id}/consume`, { cantidad: 1 })
      toast.success('Material consumido')
      await load()
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al consumir')
    }
  }

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-7xl mx-auto'>
        <div className='flex items-center justify-between mb-6'>
          <h1 className='text-2xl font-bold text-slate-800'>Inventario</h1>
          <button onClick={() => window.history.back()} className='btn-secondary'>Volver</button>
        </div>

        <div className='card mb-6'>
          <h2 className='text-lg font-semibold mb-4'>Agregar material</h2>
          <div className='grid grid-cols-1 md:grid-cols-5 gap-3'>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className='input-field'>
              <option value='MDF'>MDF</option>
              <option value='Melamina'>Melamina</option>
              <option value='Triplex'>Triplex</option>
            </select>
            <input type='number' placeholder='Espesor (mm)' value={form.espesor_mm} onChange={(e) => setForm({ ...form, espesor_mm: parseFloat(e.target.value) || 0 })} className='input-field' />
            <input type='number' placeholder='Ancho (cm)' value={form.ancho_cm || ''} onChange={(e) => setForm({ ...form, ancho_cm: parseFloat(e.target.value) || 0 })} className='input-field' />
            <input type='number' placeholder='Alto (cm)' value={form.alto_cm || ''} onChange={(e) => setForm({ ...form, alto_cm: parseFloat(e.target.value) || 0 })} className='input-field' />
            <input type='number' placeholder='Cantidad' value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: parseInt(e.target.value) || 1 })} className='input-field' />
          </div>
          <button onClick={create} disabled={loading} className='mt-4 btn-primary disabled:opacity-50'>{loading ? 'Guardando...' : 'Agregar'}</button>
        </div>

        <div className='card'>
          <h2 className='text-lg font-semibold mb-4'>Stock</h2>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-100 text-slate-700'>
                <tr>
                  <th className='p-2 text-left'>Tipo</th>
                  <th className='p-2 text-left'>Espesor</th>
                  <th className='p-2 text-left'>Dimension (cm)</th>
                  <th className='p-2 text-left'>Cantidad</th>
                  <th className='p-2 text-left'>Estado</th>
                  <th className='p-2 text-left'>Area m2</th>
                  <th className='p-2'></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className='border-b border-gray-100'>
                    <td className='p-2'>{item.tipo}</td>
                    <td className='p-2'>{item.espesor_mm} mm</td>
                    <td className='p-2'>{item.ancho_cm}x{item.alto_cm}</td>
                    <td className='p-2'>{item.cantidad}</td>
                    <td className='p-2'>{item.estado}</td>
                    <td className='p-2'>{item.area_m2.toFixed(2)}</td>
                    <td className='p-2'>
                      <button onClick={() => consume(item.id)} className='text-primary-600 hover:underline text-sm'>Consumir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className='text-center text-slate-500 py-8'>No hay materiales registrados.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
