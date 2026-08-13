import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginPage } from './components/auth/LoginPage'
import { RegisterPage } from './components/auth/RegisterPage'
import { TOTPVerifyPage } from './components/auth/TOTPVerifyPage'
import { GuestLoginPage } from './components/auth/GuestLoginPage'
import { Dashboard } from './components/Dashboard'
import { OptimizerPage } from './components/optimizer/OptimizerPage'
import { InventoryPage } from './components/taller/InventoryPage'
import { QuotePage } from './components/cotizacion/QuotePage'
import { AssemblyPage } from './components/mueble/AssemblyPage'
import { ProjectsPage } from './components/projects/ProjectsPage'

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
        <Routes>
          <Route path='/login' element={<LoginPage />} />
          <Route path='/register' element={<RegisterPage />} />
          <Route path='/verify' element={<TOTPVerifyPage />} />
          <Route path='/guest' element={<GuestLoginPage />} />
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
              <ProtectedRoute guestAllowed>
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
                <AssemblyPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
