import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, profile, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  const role = profile?.role
  if (!role) return <Navigate to="/pending" replace />

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Redirect to correct home based on role
    if (role === 'end_client') return <Navigate to="/client" replace />
    return <Navigate to="/dashboard" replace />
  }

  return children
}
