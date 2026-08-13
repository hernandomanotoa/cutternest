import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../utils/apiError'

export function TOTPVerifyPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated, fetchUser } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const tempToken = localStorage.getItem('tempToken')
      await api.post('/auth/verify', { temp_token: tempToken, code }, { withCredentials: true })
      setAuthenticated(null, 'principal')
      localStorage.removeItem('tempToken')
      await fetchUser()
      navigate('/')
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'Codigo invalido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>Verificacion de dos factores</h1>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Codigo TOTP o backup</label>
            <input
              type='text'
              inputMode='numeric'
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className='input-field text-center text-2xl tracking-widest'
              maxLength={8}
              required
            />
          </div>
          <button type='submit' disabled={loading} className='w-full btn-primary disabled:opacity-50'>
            {loading ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
      </div>
    </div>
  )
}
