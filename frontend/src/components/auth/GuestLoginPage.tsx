import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../utils/apiError'
import { OtpInput } from './OtpInput'

export function GuestLoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { fetchUser } = useAuth()

  const login = async (value: string) => {
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/guest/login', { pin: value }, { withCredentials: true })
      await fetchUser()
      navigate('/')
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'PIN invalido')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || pin.length !== 6 || loading) return
    await login(pin)
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>Acceso temporal</h1>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <label className='block text-sm font-medium text-slate-700 text-center'>PIN de 6 digitos</label>
            <OtpInput
              value={pin}
              onChange={setPin}
              onComplete={(complete) => {
                if (!loading) login(complete)
              }}
              disabled={loading}
              error={!!error}
            />
          </div>
          <button type='submit' disabled={loading || pin.length !== 6} className='w-full btn-primary disabled:opacity-50'>
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
