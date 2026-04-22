import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Documents from './pages/Documents'
import ClientDashboard from './pages/ClientDashboard'
import PendingRole from './pages/PendingRole'
import NotFound from './pages/NotFound'

function AppRoutes() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">טוען...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (!profile?.role) {
    return (
      <Routes>
        <Route path="/pending" element={<PendingRole />} />
        <Route path="*" element={<Navigate to="/pending" replace />} />
      </Routes>
    )
  }

  if (profile.role === 'end_client') {
    return (
      <Routes>
        <Route path="/client" element={<AppLayout><ClientDashboard /></AppLayout>} />
        <Route path="/client/documents" element={<AppLayout><ClientDashboard /></AppLayout>} />
        <Route path="*" element={<Navigate to="/client" replace />} />
      </Routes>
    )
  }

  // Office users (admin, office_manager, office_employee)
  return (
    <Routes>
      <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/clients" element={<AppLayout><ProtectedRoute allowedRoles={['admin', 'office_manager', 'office_employee']}><Clients /></ProtectedRoute></AppLayout>} />
      <Route path="/documents" element={<AppLayout><ProtectedRoute allowedRoles={['admin', 'office_manager', 'office_employee']}><Documents /></ProtectedRoute></AppLayout>} />
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return <AppRoutes />
}
