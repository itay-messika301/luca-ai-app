import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/**
 * Handles the redirect after Google OAuth / Magic Link sign-in.
 * Supabase extracts the token from the URL, establishes the session,
 * then we redirect the user to the correct page.
 */
export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true })
        return
      }
      // Honour ?next= (relative paths only) e.g. back to /accept-invitation?token=…
      const next = new URLSearchParams(window.location.search).get('next')
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
      // Profile is loaded by AuthProvider — App.jsx decides the final screen
      navigate(safeNext, { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">מתחבר...</p>
      </div>
    </div>
  )
}
