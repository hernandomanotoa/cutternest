import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../utils/apiError'

export function GuestLoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setTokens } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await api.post('/auth/guest/login', { pin })
      const { access_token } = response.data
      setTokens(access_token, '', null, 'guest')
      navigate('/')
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'PIN invalido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>Acceso temporal</h1>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>PIN de 4 digitos</label>
            <input
              type='text'
              inputMode='numeric'
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className='input-field text-center text-2xl tracking-widest'
              maxLength={4}
              required
            />
          </div>
          <button type='submit' disabled={loading} className='w-full btn-primary disabled:opacity-50'>
            {loading ? 'Verificando...' : 'Acceder'}
          </button>
        </form>
        <div className='mt-4 text-center text-sm'>
          <Link to='/login' className='text-primary-600 hover:underline'>Volver al login</Link>
        </div>
      </div>
    </div>
  )
}
