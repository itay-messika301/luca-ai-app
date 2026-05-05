import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Building2, Phone, Zap, ChevronLeft, Check } from 'lucide-react'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₪299',
    period: 'לחודש',
    description: 'למשרדים קטנים',
    features: ['עד 3 משתמשים', 'עד 200 מסמכים/חודש', 'ייצוא Excel', 'תמיכה במייל'],
    color: 'border-slate-200',
    badge: null,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₪699',
    period: 'לחודש',
    description: 'למשרדים בצמיחה',
    features: ['עד 10 משתמשים', 'עד 1,000 מסמכים/חודש', 'ייצוא ERP', 'Workflow אישורים', 'תמיכה בWhatsApp'],
    color: 'border-blue-500',
    badge: 'מומלץ',
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '₪1,499',
    period: 'לחודש',
    description: 'למשרדים גדולים',
    features: ['משתמשים ללא הגבלה', 'מסמכים ללא הגבלה', 'כל תכונות Growth', 'API גישה', 'Customer Success Manager'],
    color: 'border-slate-200',
    badge: null,
  },
]

const STEPS = [
  { id: 1, label: 'פרטי המשרד' },
  { id: 2, label: 'בחירת מינוי' },
  { id: 3, label: 'סיום' },
]

export default function Onboarding() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep]     = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [firmName, setFirmName] = useState('')
  const [phone, setPhone]       = useState('')
  const [plan, setPlan]         = useState('growth')

  const handleCreateWorkspace = async () => {
    if (!firmName.trim()) {
      setError('שם המשרד נדרש')
      return
    }
    setSaving(true)
    setError('')
    try {
      // 1. Create workspace
      const { data: workspace, error: wsError } = await supabase
        .from('workspaces')
        .insert({
          name:     firmName.trim(),
          phone:    phone.trim() || null,
          plan,
          owner_id: user.id,
        })
        .select()
        .single()

      if (wsError) throw wsError

      // 2. Upsert profile: create or update with role + workspace_id
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id:           user.id,
          role:         'workspace_owner',
          workspace_id: workspace.id,
          full_name:    user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          avatar_url:   user.user_metadata?.avatar_url || null,
          updated_at:   new Date().toISOString(),
        })

      if (profileError) throw profileError

      // 3. Refresh profile in context
      refreshProfile()
      setStep(3)
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err.message || 'שגיאה ביצירת המשרד')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8FA] flex flex-col items-center justify-center p-4" dir="rtl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
          L
        </div>
        <h1 className="text-xl font-bold text-slate-900">ברוך הבא ל-Luca AI</h1>
        <p className="text-slate-500 text-sm mt-1">בוא נקים את המשרד שלך</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${step >= s.id ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                step > s.id  ? 'bg-blue-600 border-blue-600 text-white' :
                step === s.id ? 'border-blue-600 text-blue-600' :
                'border-slate-300 text-slate-400'
              }`}>
                {step > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
              </div>
              <span className="text-xs font-medium hidden sm:block">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px ${step > s.id ? 'bg-blue-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Firm Details */}
      {step === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 w-full max-w-md">
          <div className="flex items-center gap-2 mb-6">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">פרטי המשרד</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                שם המשרד <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                placeholder="לדוגמה: נסים ושות' רואי חשבון"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  מספר טלפון
                  <span className="text-slate-400 font-normal">(לWhatsApp)</span>
                </span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="050-0000000"
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              onClick={() => {
                if (!firmName.trim()) { setError('שם המשרד נדרש'); return }
                setError('')
                setStep(2)
              }}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition"
            >
              המשך
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Plan Selection */}
      {step === 2 && (
        <div className="w-full max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold text-slate-900">בחר מינוי</h2>
            <p className="text-slate-500 text-sm mt-1">ניתן לשנות בכל עת מההגדרות</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {PLANS.map(p => (
              <button
                key={p.id}
                onClick={() => setPlan(p.id)}
                className={`relative text-right p-5 rounded-2xl border-2 transition-all ${
                  plan === p.id
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {p.badge && (
                  <span className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {p.badge}
                  </span>
                )}
                <div className="mb-3">
                  <p className="font-bold text-slate-900 text-base">{p.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{p.description}</p>
                </div>
                <div className="mb-4">
                  <span className="text-2xl font-bold text-slate-900">{p.price}</span>
                  <span className="text-slate-500 text-sm mr-1">{p.period}</span>
                </div>
                <ul className="space-y-1.5">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4 text-center">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              חזרה
            </button>
            <button
              onClick={handleCreateWorkspace}
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? 'יוצר משרד...' : 'צור את המשרד שלי'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">המשרד מוכן!</h2>
          <p className="text-slate-500 text-sm mb-6">
            <strong className="text-slate-800">{firmName}</strong> הוקם בהצלחה.
            עכשיו תוכל להוסיף צוות ולקוחות.
          </p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition"
          >
            כניסה ללוח הבקרה
          </button>
        </div>
      )}
    </div>
  )
}
