import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClientDashboard from './pages/ClientDashboard'
import PendingRole from './pages/PendingRole'
import NotFound from './pages/NotFound'

// Layout
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

function RootRedirect() {
  const { user, profile, loading } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />

  const role = profile?.role
  if (!role) return <Navigate to="/pending" replace />
  if (role === 'end_client') return <Navigate to="/client" replace />
  return <Navigate to="/dashboard" replace />
}

function Spinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F8F8FA]">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const { loading } = useAuth()
  if (loading) return <Spinner />

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<PendingRole />} />

      {/* Root → redirect by role */}
      <Route path="/" element={<RootRedirect />} />

      {/* Office routes (admin, office_manager, office_employee) */}
      <Route element={
        <ProtectedRoute allowedRoles={['admin', 'office_manager', 'office_employee']}>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>

      {/* Client portal (end_client) */}
      <Route element={
        <ProtectedRoute allowedRoles={['end_client']}>
          <AppLayout isClient />
        </ProtectedRoute>
      }>
        <Route path="/client" element={<ClientDashboard />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
