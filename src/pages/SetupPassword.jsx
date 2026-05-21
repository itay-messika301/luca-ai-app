import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

const ROLE_LABELS = {
  workspace_owner:    'בעל משרד',
  workspace_employee: 'עובד משרד',
  end_client:         'לקוח קצה',
}

export default function SetupPassword() {
  const { user, profile, workspace, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [password,        setPassword]        = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [showPwd,         setShowPwd]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState(null)

  // If user already set a password, skip this screen
  useEffect(() => {
    if (user?.user_metadata?.password_set === true) {
      navigate(profile?.role === 'end_client' ? '/client' : '/dashboard', { replace: true })
    }
  }, [user, profile, navigate])

  // Basic validation
  const minLen = 8
  const passwordOk = password.length >= minLen
  const matches    = password === confirm && confirm.length > 0
  const canSubmit  = passwordOk && matches && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSaving(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    })

    if (updateError) {
      setError(updateError.message || 'אירעה שגיאה בהגדרת הסיסמה')
      setSaving(false)
      return
    }

    await refreshProfile()
    navigate(profile?.role === 'end_client' ? '/client' : '/dashboard', { replace: true })
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
          {/* Success indicator from invitation */}
          <div className="flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 mb-6">
            <svg className="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-300 text-sm font-medium">ההזמנה אושרה</span>
          </div>

          <h1 className="text-white text-2xl font-bold mb-1 text-center">ברוכים הבאים!</h1>
          <p className="text-white/50 text-sm text-center mb-6">
            לפני שתמשיכי, הגדירי סיסמה לכניסות הבאות
          </p>

          {/* Context block: workspace + role */}
          <div className="bg-white/3 border border-white/5 rounded-xl px-4 py-3 mb-6 space-y-1.5">
            {workspace?.name && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">המשרד שלך:</span>
                <span className="text-white font-medium">{workspace.name}</span>
              </div>
            )}
            {profile?.role && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">תפקידך:</span>
                <span className="text-blue-400 font-medium">{ROLE_LABELS[profile.role] || profile.role}</span>
              </div>
            )}
            {user?.email && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">המייל שלך:</span>
                <span className="text-white/70">{user.email}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-white/70 text-xs mb-1.5">סיסמה חדשה</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={`לפחות ${minLen} תווים`}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-blue-500"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 text-white/40 hover:text-white/70 text-xs"
                >
                  {showPwd ? 'הסתר' : 'הצג'}
                </button>
              </div>
              {password.length > 0 && !passwordOk && (
                <p className="text-amber-400 text-xs mt-1">סיסמה צריכה להיות לפחות {minLen} תווים</p>
              )}
            </div>

            <div>
              <label className="block text-white/70 text-xs mb-1.5">אישור סיסמה</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="הקלידי שוב"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-blue-500"
                autoComplete="new-password"
              />
              {confirm.length > 0 && !matches && (
                <p className="text-red-400 text-xs mt-1">הסיסמאות אינן זהות</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors mt-2"
            >
              {saving ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  שומר...
                </span>
              ) : (
                'הגדר סיסמה והמשך'
              )}
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center mt-2">{error}</p>
            )}

            <p className="text-white/30 text-xs text-center mt-4">
              תוכלי לשנות את הסיסמה בכל עת מתוך הגדרות &gt; החשבון שלי
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
