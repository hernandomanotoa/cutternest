import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'
import type { User } from '../../types'

interface RegisterResponse {
  user: User
  qr_base64: string
  backup_codes: string[]
}

export function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [result, setResult] = useState<RegisterResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('Las contrasenas no coinciden')
      return
    }
    setLoading(true)
    try {
      const response = await api.post<RegisterResponse>('/auth/register', {
        username: form.username,
        email: form.email,
        password: form.password,
      })
      setResult(response.data)
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    const hasBackupCodes = Array.isArray(result.backup_codes) && result.backup_codes.length > 0
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
        <div className='card w-full max-w-md space-y-4'>
          <h1 className='text-2xl font-bold text-center text-slate-800'>Registro exitoso</h1>
          <p className='text-sm text-slate-600 text-center'>Escanea el QR con Google Authenticator o Authy.</p>
          {result.qr_base64 ? (
            <img src={result.qr_base64} alt='QR TOTP' className='mx-auto rounded-lg border' />
          ) : (
            <p className='text-sm text-red-600 text-center'>No se recibio el codigo QR.</p>
          )}
          <div>
            <p className='text-sm font-medium text-slate-700 mb-2'>Codigos de backup (guardalos):</p>
            {hasBackupCodes ? (
              <div className='bg-slate-100 p-3 rounded-lg text-sm font-mono break-all'>
                {result.backup_codes.join(' ')}
              </div>
            ) : (
              <p className='text-sm text-red-600'>No se recibieron codigos de backup.</p>
            )}
          </div>
          <button onClick={() => navigate('/login')} className='w-full btn-primary'>Ir al login</button>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>Crear cuenta</h1>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Usuario</label>
            <input
              type='text'
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className='input-field'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Email</label>
            <input
              type='email'
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className='input-field'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Contrasena</label>
            <input
              type='password'
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className='input-field'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Confirmar contrasena</label>
            <input
              type='password'
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className='input-field'
              required
            />
          </div>
          <button type='submit' disabled={loading} className='w-full btn-primary disabled:opacity-50'>
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>
        <div className='mt-4 text-center text-sm'>
          <Link to='/login' className='text-primary-600 hover:underline'>Ya tengo cuenta</Link>
        </div>
      </div>
    </div>
  )
}
