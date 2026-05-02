import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import Onboarding     from './pages/Onboarding'
import Dashboard      from './pages/Dashboard'
import Clients        from './pages/Clients'
import Documents      from './pages/Documents'
import ClientDashboard from './pages/ClientDashboard'
import NotFound       from './pages/NotFound'

const OFFICE_ROLES = ['workspace_owner', 'accountant', 'reviewer']

function AppRoutes() {
  const { user, profile, loading, hasWorkspace } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Public routes (unauthenticated)
  if (!user) {
    return (
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/auth/callback"  element={<AuthCallback />} />
        <Route path="*"               element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated but no role yet (profile still loading or not created)
  if (!profile?.role) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        } />
      </Routes>
    )
  }

  // Authenticated office user but no workspace → must complete onboarding
  if (profile.role !== 'end_client' && !hasWorkspace) {
    return (
      <Routes>
        <Route path="/onboarding"    element={<Onboarding />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*"              element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // End-client routes
  if (profile.role === 'end_client') {
    return (
      <Routes>
        <Route path="/client"           element={<AppLayout isClient><ClientDashboard /></AppLayout>} />
        <Route path="/client/documents" element={<AppLayout isClient><ClientDashboard /></AppLayout>} />
        <Route path="/auth/callback"    element={<AuthCallback />} />
        <Route path="*"                 element={<Navigate to="/client" replace />} />
      </Routes>
    )
  }

  // Office user routes (workspace_owner, accountant, reviewer)
  return (
    <Routes>
      <Route path="/dashboard" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={OFFICE_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/clients" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={['workspace_owner', 'accountant']}>
            <Clients />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/documents" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={OFFICE_ROLES}>
            <Documents />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login"         element={<Navigate to="/dashboard" replace />} />
      <Route path="/onboarding"    element={<Navigate to="/dashboard" replace />} />
      <Route path="/"              element={<Navigate to="/dashboard" replace />} />
      <Route path="*"              element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return <AppRoutes />
}
