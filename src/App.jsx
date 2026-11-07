import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'

import Login             from './pages/Login'
import AuthCallback      from './pages/AuthCallback'
import Onboarding        from './pages/Onboarding'
import Dashboard         from './pages/Dashboard'
import Clients           from './pages/Clients'
import Documents         from './pages/Documents'
import ClientDashboard   from './pages/ClientDashboard'
import Settings          from './pages/Settings'
import AcceptInvitation  from './pages/AcceptInvitation'
import SetupPassword     from './pages/SetupPassword'
import ClientDetail      from './pages/ClientDetail'
import ReviewQueue       from './pages/ReviewQueue'
import ExportCenter      from './pages/ExportCenter'
import NotFound          from './pages/NotFound'

const OFFICE_ROLES = ['workspace_owner', 'workspace_employee']

// Supabase puts auth errors in the URL hash (e.g. an expired invitation link)
function readAuthHashError() {
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const code = h.get('error_code') || h.get('error')
    if (!code) return null
    history.replaceState(null, '', window.location.pathname + window.location.search)
    if (code === 'otp_expired') return 'הקישור פג תוקף או שכבר נוצל. בקשו מהמשרד לשלוח הזמנה חדשה, או היכנסו עם "קישור למייל".'
    return 'הכניסה לא הושלמה. נסו שוב, או בקשו קישור חדש.'
  } catch { return null }
}

function AuthErrorBanner() {
  const [msg, setMsg] = useState(readAuthHashError)
  if (!msg) return null
  return (
    <div dir="rtl" role="alert" className="fixed top-3 inset-x-3 z-[100] mx-auto max-w-lg flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 shadow-lg text-sm">
      <span className="flex-1">{msg}</span>
      <button onClick={() => setMsg(null)} aria-label="סגירה" className="font-bold">✕</button>
    </div>
  )
}

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
        <Route path="/login"               element={<Login />} />
        <Route path="/auth/callback"       element={<AuthCallback />} />
        <Route path="/accept-invitation"   element={<AcceptInvitation />} />
        <Route path="*"                    element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated but no profile yet → new user, send to onboarding
  if (!profile?.role) {
    return (
      <Routes>
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="/onboarding"      element={<Onboarding />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="*"                element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // Authenticated but no workspace → must complete onboarding
  // (or accept an invitation that will assign their workspace).
  // Includes legacy profiles that got role='end_client' by DB default on signup.
  if (!hasWorkspace) {
    return (
      <Routes>
        <Route path="/onboarding"      element={<Onboarding />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="*"                element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  // End-client routes (also allow accept-invitation for newly invited users)
  if (profile.role === 'end_client') {
    return (
      <Routes>
        <Route path="/client"              element={<AppLayout isClient><ClientDashboard /></AppLayout>} />
        <Route path="/client/upload"       element={<AppLayout isClient><ClientDashboard key="upload" /></AppLayout>} />
        <Route path="/setup-password"      element={<SetupPassword />} />
        <Route path="/accept-invitation"   element={<AcceptInvitation />} />
        <Route path="/auth/callback"       element={<AuthCallback />} />
        <Route path="*"                    element={<Navigate to="/client" replace />} />
      </Routes>
    )
  }

  // Office user routes (workspace_owner, workspace_employee)
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
          <ProtectedRoute allowedRoles={['workspace_owner', 'workspace_employee']}>
            <Clients />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/clients/:id" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={['workspace_owner', 'workspace_employee']}>
            <ClientDetail />
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

      <Route path="/review" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={OFFICE_ROLES}>
            <ReviewQueue />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/export" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={['workspace_owner', 'workspace_employee']}>
            <ExportCenter />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/approvals" element={<Navigate to="/review" replace />} />

      <Route path="/settings" element={
        <AppLayout>
          <ProtectedRoute allowedRoles={['workspace_owner']}>
            <Settings />
          </ProtectedRoute>
        </AppLayout>
      } />

      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      <Route path="/setup-password"    element={<SetupPassword />} />
      <Route path="/auth/callback"     element={<AuthCallback />} />
      <Route path="/login"             element={<Navigate to="/dashboard" replace />} />
      <Route path="/onboarding"        element={<Navigate to="/dashboard" replace />} />
      <Route path="/"                  element={<Navigate to="/dashboard" replace />} />
      <Route path="*"                  element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <>
      <AuthErrorBanner />
      <AppRoutes />
    </>
  )
}
