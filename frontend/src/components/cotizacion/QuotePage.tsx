import { useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { HardwareItem } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'

export function QuotePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [hardware, setHardware] = useState<HardwareItem[]>([])
  const [itemForm, setItemForm] = useState<HardwareItem>({ item: '', cantidad: 1, precio_unit: 0 })
  const [costoM2, setCostoM2] = useState(8.5)
  const [costoHora, setCostoHora] = useState(5.0)
  const [margen, setMargen] = useState(1.3)
  const [result, setResult] = useState<any>(null)

  const addItem = () => {
    if (!itemForm.item) return
    setHardware([...hardware, { ...itemForm }])
    setItemForm({ item: '', cantidad: 1, precio_unit: 0 })
  }

  const removeItem = (index: number) => {
    setHardware(hardware.filter((_, i) => i !== index))
  }

  const generate = async () => {
    if (!projectId) return
    try {
      const response = await api.post(`/projects/${projectId}/quote`, {
        hardware,
        costo_m2_mdf: costoM2,
        costo_hora_mano_obra: costoHora,
        margen,
      })
      setResult(response.data)
      toast.success('Cotizacion generada')
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Error al generar cotizacion')
    }
  }

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-2xl font-bold text-slate-800 mb-6'>Cotizacion</h1>
        <div className='card mb-6'>
          <h2 className='text-lg font-semibold mb-4'>Hardware</h2>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-3 mb-3'>
            <input placeholder='Item' value={itemForm.item} onChange={(e) => setItemForm({ ...itemForm, item: e.target.value })} className='input-field' />
            <input type='number' placeholder='Cantidad' value={itemForm.cantidad} onChange={(e) => setItemForm({ ...itemForm, cantidad: parseFloat(e.target.value) || 0 })} className='input-field' />
            <input type='number' placeholder='P/U' value={itemForm.precio_unit} onChange={(e) => setItemForm({ ...itemForm, precio_unit: parseFloat(e.target.value) || 0 })} className='input-field' />
            <button onClick={addItem} className='btn-secondary'>Agregar</button>
          </div>
          <ul className='space-y-2'>
            {hardware.map((h, i) => (
              <li key={i} className='flex justify-between text-sm bg-slate-50 p-2 rounded'>
                <span>{h.item} x{h.cantidad} @ {h.precio_unit.toFixed(2)}</span>
                <button onClick={() => removeItem(i)} className='text-red-600 hover:underline'>Eliminar</button>
              </li>
            ))}
          </ul>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3 mt-4'>
            <div>
              <label className='block text-xs font-medium text-slate-600 mb-1'>Costo m2 MDF</label>
              <input type='number' value={costoM2} onChange={(e) => setCostoM2(parseFloat(e.target.value) || 0)} className='input-field' />
            </div>
            <div>
              <label className='block text-xs font-medium text-slate-600 mb-1'>Costo hora MO</label>
              <input type='number' value={costoHora} onChange={(e) => setCostoHora(parseFloat(e.target.value) || 0)} className='input-field' />
            </div>
            <div>
              <label className='block text-xs font-medium text-slate-600 mb-1'>Margen</label>
              <input type='number' step={0.1} value={margen} onChange={(e) => setMargen(parseFloat(e.target.value) || 1)} className='input-field' />
            </div>
          </div>
          <button onClick={generate} className='w-full mt-4 btn-primary'>Generar cotizacion PDF</button>
        </div>

        {result && (
          <div className='card'>
            <h2 className='text-lg font-semibold mb-4'>Resultado</h2>
            <div className='grid grid-cols-2 gap-4 text-sm'>
              <div className='flex justify-between'><span>Material</span><span>${result.breakdown.material.toFixed(2)}</span></div>
              <div className='flex justify-between'><span>Hardware</span><span>${result.breakdown.hardware.toFixed(2)}</span></div>
              <div className='flex justify-between'><span>Mano de obra</span><span>${result.breakdown.mano_obra.toFixed(2)}</span></div>
              <div className='flex justify-between font-bold text-lg'><span>Total</span><span>${result.breakdown.total.toFixed(2)}</span></div>
            </div>
            {result.pdf_path && (
              <a href={result.pdf_path} target='_blank' rel='noreferrer' className='block mt-4 text-primary-600 hover:underline'>Descargar PDF</a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
