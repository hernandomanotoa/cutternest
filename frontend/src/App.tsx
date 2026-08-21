import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import React, { Suspense, useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { api } from './api/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './components/auth/LoginPage'
import { RegisterPage } from './components/auth/RegisterPage'
import { TOTPVerifyPage } from './components/auth/TOTPVerifyPage'
import { GuestLoginPage } from './components/auth/GuestLoginPage'
import { Dashboard } from './components/Dashboard'
import { OptimizerPage } from './components/optimizer/OptimizerPage'
import { InventoryPage } from './components/taller/InventoryPage'
import { QuotePage } from './components/cotizacion/QuotePage'
import { ProjectsPage } from './components/projects/ProjectsPage'

const AssemblyPage = React.lazy(() => import('./components/mueble/AssemblyPage'))

function AuthInit({ children }: { children: React.ReactNode }) {
  const { setAuthenticated, setUser, clear } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .get('/auth/session')
      .then((response) => {
        const { mode, user, project_id } = response.data
        if (mode === 'principal' && user) {
          setUser(user)
          setAuthenticated(user, 'principal')
        } else if (mode === 'guest') {
          setAuthenticated(null, 'guest', project_id || null)
        } else {
          clear()
        }
      })
      .catch(() => clear())
      .finally(() => setReady(true))
  }, [setAuthenticated, setUser, clear])

  if (!ready) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <div className='text-muted-foreground'>Cargando...</div>
      </div>
    )
  }
  return <>{children}</>
}

function ProtectedRoute({ children, guestAllowed = false }: { children: React.ReactNode; guestAllowed?: boolean }) {
  const { isAuthenticated, isGuest } = useAuth()
  if (!isAuthenticated) return <Navigate to='/login' replace />
  if (!guestAllowed && isGuest) return <Navigate to='/' replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position='top-right' />
      <ErrorBoundary>
        <AuthInit>
          <Routes>
            <Route path='/login' element={<LoginPage />} />
            <Route path='/register' element={<RegisterPage />} />
            <Route path='/verify' element={<TOTPVerifyPage />} />
            <Route path='/guest' element={<GuestLoginPage />} />
            <Route element={<AppLayout />}>
              <Route
                path='/'
                element={
                  <ProtectedRoute guestAllowed>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path='/optimizer'
                element={
                  <ProtectedRoute>
                    <OptimizerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path='/projects'
                element={
                  <ProtectedRoute guestAllowed>
                    <ProjectsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path='/inventory'
                element={
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path='/quote/:projectId'
                element={
                  <ProtectedRoute>
                    <QuotePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path='/assembly/:projectId'
                element={
                  <ProtectedRoute guestAllowed>
                    <Suspense fallback={<div className='flex min-h-screen items-center justify-center bg-background text-muted-foreground'>Cargando ensamblaje 3D...</div>}>
                      <AssemblyPage />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </AuthInit>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
