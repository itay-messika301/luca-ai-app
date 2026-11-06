import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

const ROLE_LABELS = {
  workspace_employee: 'עובד משרד',
  end_client:         'לקוח קצה',
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const { user, profile, refreshProfile } = useAuth()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [workspace,  setWorkspace]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [accepting,  setAccepting]  = useState(false)
  const [error,      setError]      = useState(null)

  const sameEmail = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
  const nextParam = encodeURIComponent(`/accept-invitation?token=${token}`)

  // Load invitation details (SECURITY DEFINER RPC — table is not publicly readable)
  useEffect(() => {
    if (!token) {
      setError('קישור ההזמנה אינו תקין')
      setLoading(false)
      return
    }

    async function loadInvitation() {
      const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
      const inv = Array.isArray(data) ? data[0] : data

      if (error || !inv) {
        // Already accepted automatically on sign-in (AuthContext) → just go in
        if (user && profile?.workspace_id) {
          navigate('/', { replace: true })
          return
        }
        setError('ההזמנה לא נמצאה, פג תוקפה או שכבר נוצלה. בקשו מהמשרד לשלוח הזמנה חדשה.')
        setLoading(false)
        return
      }

      setInvitation(inv)
      setWorkspace({ name: inv.workspace_name })
      setLoading(false)

      // If user is already logged in, auto-accept if email matches
      if (user && sameEmail(user.email, inv.email)) {
        acceptInvitation(inv)
      }
    }

    loadInvitation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, profile?.workspace_id])

  async function acceptInvitation(inv = invitation) {
    if (!inv) return
    setAccepting(true)
    setError(null)

    try {
      // Validates the login email and assigns role + workspace server-side,
      // and links end clients to their businesses (claim_end_client_contacts).
      const { error: acceptError } = await supabase.rpc('accept_invitation', { p_token: token })
      if (acceptError) throw acceptError

      await refreshProfile()
      navigate('/', { replace: true })
    } catch (err) {
      console.error('accept_invitation failed', err)
      const msg = err?.message || ''
      setError(
        msg.includes('email_mismatch')             ? 'ההזמנה נשלחה לכתובת מייל אחרת. התחברו עם המייל שאליו נשלחה ההזמנה.'
        : msg.includes('already_in_other_workspace') ? 'החשבון הזה כבר משויך למשרד אחר. פנו למשרד שהזמין אתכם.'
        : msg.includes('invitation_not_found')     ? 'ההזמנה לא נמצאה או שפג תוקפה. בקשו מהמשרד לשלוח הזמנה חדשה.'
        : 'לא הצלחנו לקבל את ההזמנה. נסו שוב בעוד רגע.'
      )
      setAccepting(false)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${nextParam}`,
      },
    })
    if (error) setError('ההתחברות עם Google נכשלה. נסו שוב.')
  }

  async function signInWithMagicLink() {
    if (!invitation?.email) return
    const { error } = await supabase.auth.signInWithOtp({
      email: invitation.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextParam}`,
      },
    })
    if (error) setError('שליחת הקישור נכשלה. נסו שוב בעוד דקה.')
    else setError('קישור נשלח אל ' + invitation.email)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] p-4" dir="rtl">
        <div className="text-center">
          <div className="text-red-400 text-4xl mb-4">⚠</div>
          <h2 className="text-white text-xl font-bold mb-2">שגיאה</h2>
          <p className="text-white/50 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            חזור לדף הכניסה
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg">
            L
          </div>
          <span className="text-white font-bold text-xl">Luca AI</span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h1 className="text-white text-2xl font-bold mb-2 text-center">הצטרף למשרד</h1>

          {workspace && (
            <p className="text-white/50 text-center mb-6">
              הוזמנת להצטרף ל-<span className="text-white font-medium">{workspace.name}</span>{' '}
              בתפקיד <span className="text-blue-400 font-medium">{ROLE_LABELS[invitation?.role] || invitation?.role}</span>
            </p>
          )}

          {/* If already logged in as the invited email, show accepting state */}
          {user && sameEmail(user.email, invitation?.email) ? (
            <div className="text-center py-4">
              {accepting ? (
                <div className="flex items-center justify-center gap-3 text-white/70">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  מקבל הזמנה...
                </div>
              ) : (
                <button
                  onClick={() => acceptInvitation()}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                >
                  קבל הזמנה והצטרף
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-white/50 text-sm text-center mb-6">
                כדי להצטרף, יש להתחבר עם החשבון שאליו נשלחה ההזמנה
                {invitation?.email && (
                  <span className="block mt-1 text-blue-400">{invitation.email}</span>
                )}
              </p>

              <div className="space-y-3">
                <button
                  onClick={signInWithGoogle}
                  className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-medium transition-colors text-sm"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                  </svg>
                  כניסה עם Google
                </button>

                <button
                  onClick={signInWithMagicLink}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl font-medium transition-all text-sm"
                >
                  שלח קישור כניסה למייל
                </button>
              </div>
            </>
          )}

          {error && (
            <p className={`mt-4 text-sm text-center ${error.startsWith('קישור נשלח') ? 'text-green-400' : 'text-red-400'}`}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
