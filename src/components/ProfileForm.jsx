import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Trash2, Sun, Moon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import { toHebrewError } from '@/lib/errors'
import FontSizeControl from '@/components/FontSizeControl'
import Avatar from '@/components/Avatar'

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX   = 2 * 1024 * 1024

const inputCls = 'w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors'
const card     = 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6'

/**
 * "My profile" — the same form for office staff and end clients.
 * Every user edits only their own row (RLS + guard trigger), and uploads
 * their picture only under avatars/{their uid}/.
 */
export default function ProfileForm() {
  const { user, profile, refreshProfile } = useAuth()
  const { theme, toggle } = useTheme()
  const [form, setForm] = useState(() => fromProfile(profile))
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const fileRef = useRef()

  useEffect(() => { setForm(fromProfile(profile)) }, [profile])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(fromProfile(profile))

  async function save(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setMsg({ type: 'error', text: 'שם מלא הוא שדה חובה' }); return }
    if (form.phone && !/^[0-9+\-\s()]{7,20}$/.test(form.phone.trim())) {
      setMsg({ type: 'error', text: 'מספר הטלפון לא תקין' }); return
    }
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('profiles').update({
      full_name:    form.full_name.trim(),
      display_name: form.display_name.trim() || null,
      job_title:    form.job_title.trim()    || null,
      phone:        form.phone.trim()        || null,
    }).eq('id', profile.id)
    setSaving(false)
    if (error) { setMsg({ type: 'error', text: toHebrewError(error) }); return }
    setMsg({ type: 'success', text: 'הפרופיל נשמר' })
    await refreshProfile()
  }

  async function uploadAvatar(file) {
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) { setMsg({ type: 'error', text: 'אפשר להעלות תמונה מסוג PNG, JPG או WEBP' }); return }
    if (file.size > AVATAR_MAX)            { setMsg({ type: 'error', text: 'התמונה גדולה מדי (עד 2MB)' }); return }
    setAvatarBusy(true); setMsg(null)
    const ext  = file.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setAvatarBusy(false); setMsg({ type: 'error', text: toHebrewError(upErr, 'העלאת התמונה נכשלה') }); return }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const old = storagePath(profile.avatar_url)
    const { error } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    if (!error && old) await supabase.storage.from('avatars').remove([old])
    setAvatarBusy(false)
    if (error) { setMsg({ type: 'error', text: toHebrewError(error) }); return }
    await refreshProfile()
  }

  async function removeAvatar() {
    setAvatarBusy(true); setMsg(null)
    const old = storagePath(profile.avatar_url)
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    if (!error && old) await supabase.storage.from('avatars').remove([old])
    setAvatarBusy(false)
    if (error) { setMsg({ type: 'error', text: toHebrewError(error) }); return }
    await refreshProfile()
  }

  return (
    <div className="space-y-6 max-w-lg">
      <form onSubmit={save} className={card}>
        <h2 className="text-slate-900 dark:text-white font-semibold mb-4">פרטים אישיים</h2>

        {/* Picture */}
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <Avatar profile={profile} size="lg" />
            {avatarBusy && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50">
              <Camera className="w-4 h-4" /> {profile?.avatar_url ? 'החלפת תמונה' : 'העלאת תמונה'}
            </button>
            {profile?.avatar_url && (
              <button type="button" onClick={removeAvatar} disabled={avatarBusy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-700 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> הסרה
              </button>
            )}
            <p className="w-full text-xs text-slate-500 dark:text-white/40">PNG, JPG או WEBP, עד 2MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { uploadAvatar(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="pf-name" label="שם מלא *">
            <input id="pf-name" value={form.full_name} onChange={set('full_name')} className={inputCls} placeholder="השם שלך" autoComplete="name" required />
          </Field>
          <Field id="pf-display" label="כינוי / שם תצוגה" hint="מוצג בתפריט ובברכה">
            <input id="pf-display" value={form.display_name} onChange={set('display_name')} className={inputCls} placeholder="למשל: מור" autoComplete="nickname" />
          </Field>
          <Field id="pf-title" label="תפקיד">
            <input id="pf-title" value={form.job_title} onChange={set('job_title')} className={inputCls} placeholder="למשל: מנהלת חשבונות" autoComplete="organization-title" />
          </Field>
          <Field id="pf-phone" label="טלפון">
            <input id="pf-phone" value={form.phone} onChange={set('phone')} className={inputCls} placeholder="050-0000000" dir="ltr" inputMode="tel" autoComplete="tel" />
          </Field>
          <Field id="pf-email" label="אימייל" hint="משמש לכניסה, לא ניתן לשנות כאן">
            <input id="pf-email" value={user?.email || ''} disabled dir="ltr" className={inputCls + ' opacity-60 cursor-not-allowed'} />
          </Field>
        </div>

        {msg && <p role="status" className={`text-sm mt-4 ${msg.type === 'error' ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{msg.text}</p>}
        <button type="submit" disabled={saving || !dirty}
          className="mt-4 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {saving ? 'שומר...' : 'שמירה'}
        </button>
      </form>

      {/* Display preferences (stored in this browser) */}
      <div className={card}>
        <h2 className="text-slate-900 dark:text-white font-semibold mb-4">תצוגה</h2>
        <div className="space-y-4 max-w-xs">
          <FontSizeControl />
          <button type="button" onClick={toggle}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/10">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-slate-600 dark:text-white/60 text-xs mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 dark:text-white/30 mt-1">{hint}</p>}
    </div>
  )
}

function fromProfile(p) {
  return {
    full_name:    p?.full_name    || '',
    display_name: p?.display_name || '',
    job_title:    p?.job_title    || '',
    phone:        p?.phone        || '',
  }
}

// avatars/{uid}/file.png → "{uid}/file.png" (only for files in our bucket)
function storagePath(url) {
  const m = url && url.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}
