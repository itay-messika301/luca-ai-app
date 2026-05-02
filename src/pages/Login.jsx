import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'

export default function Login() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const [email, setEmail]       = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [mode, setMode]         = useState('google') // 'google' | 'magic'

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
      // redirect handled by Supabase OAuth
    } catch (err) {
      setError(err.message || 'שגיאה בכניסה עם Google')
      setLoading(false)
    }
  }

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithMagicLink(email)
      setMagicSent(true)
    } catch (err) {
      setError(err.message || 'שגיאה בשליחת הלינק')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-blue-500/25">
            L
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Luca AI</h1>
          <p className="text-slate-500 text-sm mt-1">אוטומציה חכמה לרואי חשבון</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6 text-center">כניסה למערכת</h2>

          {/* Google SSO */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50 mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            {loading && mode === 'google' ? 'מתחבר...' : 'המשך עם Google'}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">או</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Magic Link */}
          {!magicSent ? (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  כניסה עם קישור למייל
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  placeholder="your@email.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
              >
                {loading ? 'שולח...' : 'שלח לי קישור כניסה'}
              </button>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-900 font-medium mb-1">הקישור נשלח!</p>
              <p className="text-slate-500 text-sm">בדוק את המייל שלך ב-{email}</p>
              <button
                onClick={() => { setMagicSent(false); setEmail('') }}
                className="mt-4 text-blue-600 text-sm hover:underline"
              >
                שלח שוב
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          על ידי כניסה, אתה מסכים ל
          <a href="#" className="text-blue-600 hover:underline mx-1">תנאי השימוש</a>
          ו
          <a href="#" className="text-blue-600 hover:underline mx-1">מדיניות הפרטיות</a>
        </p>
      </div>
    </div>
  )
}
