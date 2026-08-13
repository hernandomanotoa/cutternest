import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { getApiErrorMessage } from '../../utils/apiError'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/login', { username, password })
      navigate('/verify', { state: { username } })
    } catch (err: any) {
      setError(getApiErrorMessage(err) || 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
      <div className='card w-full max-w-md'>
        <h1 className='text-2xl font-bold text-center text-slate-800 mb-6'>CutterNest</h1>
        <h2 className='text-lg font-medium text-center text-slate-600 mb-6'>Iniciar sesion</h2>
        {error && <div className='mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm'>{error}</div>}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Usuario</label>
            <input
              type='text'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className='input-field'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Contrasena</label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='input-field'
              required
            />
          </div>
          <button type='submit' disabled={loading} className='w-full btn-primary disabled:opacity-50'>
            {loading ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
        <div className='mt-4 text-center text-sm text-slate-600'>
          <Link to='/guest' className='text-primary-600 hover:underline'>Acceso temporal (PIN)</Link>
          <span className='mx-2'>|</span>
          <Link to='/register' className='text-primary-600 hover:underline'>Crear cuenta</Link>
        </div>
      </div>
    </div>
  )
}
