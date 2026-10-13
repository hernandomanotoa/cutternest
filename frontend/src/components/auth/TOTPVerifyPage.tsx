import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../utils/apiError'
import { OtpInput } from './OtpInput'

type CodeMode = 'totp' | 'backup'

export function TOTPVerifyPage() {
  const [mode, setMode] = useState<CodeMode>('totp')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated, fetchUser } = useAuth()

  const verify = async (value: string) => {
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/verify', { code: value }, { withCredentials: true })
      setAuthenticated(null, 'principal')
      await fetchUser()
      navigate('/')
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'Codigo invalido')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) return
    await verify(code)
  }

  const switchMode = (next: CodeMode) => {
    setMode(next)
    setCode('')
    setError('')
  }

  const isTotpComplete = mode === 'totp' && code.length === 6

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>Verificacion de dos factores</h1>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          {mode === 'totp' ? (
            <div className='space-y-2'>
              <label className='block text-sm font-medium text-slate-700 text-center'>
                Ingresa el codigo de 6 digitos de tu app de autenticacion
              </label>
              <OtpInput
                value={code}
                onChange={setCode}
                onComplete={(complete) => {
                  if (!loading) verify(complete)
                }}
                disabled={loading}
                error={!!error}
              />
            </div>
          ) : (
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Codigo de respaldo</label>
              <input
                type='text'
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className='input-field text-center text-xl tracking-widest uppercase'
                maxLength={8}
                placeholder='XXXXXXXX'
                autoComplete='off'
                required
              />
            </div>
          )}
          <button
            type='submit'
            disabled={loading || !code || (mode === 'totp' && !isTotpComplete)}
            className='w-full btn-primary disabled:opacity-50'
          >
            {loading ? 'Verificando...' : 'Verificar'}
          </button>
        </form>
        <div className='mt-4 text-center'>
          {mode === 'totp' ? (
            <button
              type='button'
              onClick={() => switchMode('backup')}
              className='text-sm text-primary hover:underline'
            >
              Usar codigo de respaldo
            </button>
          ) : (
            <button
              type='button'
              onClick={() => switchMode('totp')}
              className='text-sm text-primary hover:underline'
            >
              Usar codigo de la app de autenticacion
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
