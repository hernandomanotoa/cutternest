import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Dashboard() {
  const { user, isGuest, clear, fetchUser } = useAuth()

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handleLogout = () => {
    clear()
    window.location.href = '/login'
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      <header className='bg-white border-b border-gray-200'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-slate-800'>CutterNest</h1>
          <div className='flex items-center gap-4'>
            <span className='text-sm text-slate-600'>
              {isGuest ? 'Sesion temporal' : user?.username || 'Usuario'}
            </span>
            <button onClick={handleLogout} className='btn-secondary text-sm'>Cerrar sesion</button>
          </div>
        </div>
      </header>

      <main className='max-w-7xl mx-auto px-4 py-8'>
        <h2 className='text-xl font-semibold text-slate-800 mb-6'>Panel principal</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          <Link to='/projects' className='card hover:shadow-md transition-shadow'>
            <div className='text-3xl mb-3'>📁</div>
            <h3 className='text-lg font-semibold text-slate-800'>Proyectos</h3>
            <p className='text-sm text-slate-600'>Crear, optimizar, cotizar y ensamblar.</p>
          </Link>

          <Link to='/optimizer' className='card hover:shadow-md transition-shadow'>
            <div className='text-3xl mb-3'>📐</div>
            <h3 className='text-lg font-semibold text-slate-800'>Optimizador rapido</h3>
            <p className='text-sm text-slate-600'>Optimizar cortes y ver layouts.</p>
          </Link>

          {!isGuest && (
            <Link to='/inventory' className='card hover:shadow-md transition-shadow'>
              <div className='text-3xl mb-3'>📦</div>
              <h3 className='text-lg font-semibold text-slate-800'>Inventario</h3>
              <p className='text-sm text-slate-600'>Gestionar tableros y sobrantes.</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
