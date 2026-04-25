import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export default function FirmSetup({ currentUser, onUpdate }) {
  const [firmName, setFirmName] = useState('')
  const [firmId, setFirmId]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState(null)
  const [staffCount, setStaffCount] = useState(null)

  useEffect(() => {
    if (currentUser) {
      setFirmName(currentUser.accounting_firm_name || '')
      setFirmId(currentUser.accounting_firm_id || '')
    }
  }, [currentUser])

  useEffect(() => {
    supabase.from('profiles').select('id', { count: 'exact', head: true }).is('accounting_firm_id', null)
      .then(({ count }) => setStaffCount(count))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!firmName.trim()) { setError('חובה להזין שם משרד'); return }
    if (!firmId.trim())   { setError('חובה להזין / לייצר Firm ID'); return }
    setSaving(true); setError(null); setSuccess(false)
    const { data, error: err } = await supabase.from('profiles')
      .update({ accounting_firm_id: firmId.trim(), accounting_firm_name: firmName.trim() })
      .eq('id', currentUser.id).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    if (onUpdate) onUpdate(data)
    setSuccess(true); setSaving(false)
  }

  async function handleApplyToAll(e) {
    e.preventDefault()
    if (!firmId || !firmName) { setError('שמור קודם את הגדרות המשרד'); return }
    if (!window.confirm(`לעדכן ${staffCount} משתמשים עם:\n${firmName}\n${firmId}`)) return
    setSaving(true)
    const { error: err } = await supabase.from('profiles')
      .update({ accounting_firm_id: firmId.trim(), accounting_firm_name: firmName.trim() })
      .is('accounting_firm_id', null)
    if (err) setError(err.message)
    else { setSuccess(true); setStaffCount(0) }
    setSaving(false)
  }

  if (!currentUser) return <div className="text-gray-400 text-sm">טוען...</div>

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">הגדרות משרד</h2>
      <p className="text-sm text-gray-500 mb-6">הגדר שם משרד ו-Firm ID לכל ה-RLS policies.</p>
      {!currentUser.accounting_firm_id && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-5 text-sm text-yellow-800">
          <strong>⚠️ חסר Firm ID.</strong> מלא את הטופס למטה.
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם המשרד *</label>
          <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)} required dir="rtl"
            placeholder="לדוגמה: משרד כהן ושות'" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Firm ID (UUID) *</label>
          <div className="flex gap-2">
            <input type="text" value={firmId} onChange={e => setFirmId(e.target.value)} dir="ltr"
              placeholder="UUID" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={() => setFirmId(uuidv4())}
              className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 whitespace-nowrap">⚡ ייצר חדש</button>
          </div>
        </div>
        {error   && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">❌ {error}</div>}
        {success && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">✅ נשמר בהצלחה!</div>}
        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg text-sm">
          {saving ? '...שומר' : '💾 שמור הגדרות משרד'}
        </button>
      </form>
      {staffCount !== null && staffCount > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">החלה על כל המשתמשים</h3>
          <p className="text-sm text-gray-500 mb-3">ישנם <strong>{staffCount}</strong> משתמשים ללא firm_id.</p>
          <button onClick={handleApplyToAll} disabled={saving || !firmId || !firmName}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium py-2 px-4 rounded-lg">
            {saving ? '...מעדכן' : `🔄 עדכן ${staffCount} משתמשים`}
          </button>
        </div>
      )}
    </div>
  )
}
