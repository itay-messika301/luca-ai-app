// src/components/admin/FirmSetup.jsx
// הגדרות משרד + תיקון firm_id=NULL
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export default function FirmSetup({ currentUser, onSaved }) {
  const [firmName,    setFirmName]    = useState('')
  const [firmId,      setFirmId]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)
  const [success,     setSuccess]     = useState(false)
  const [staffCount,  setStaffCount]  = useState(null)

  useEffect(() => {
    if (currentUser) {
      setFirmName(currentUser.firm_name || '')
      setFirmId(currentUser.firm_id   || '')
    }
    // ספירת משתמשים ללא firm_id
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('firm_id', null)
      .then(({ count }) => setStaffCount(count ?? 0))
  }, [currentUser])

  async function handleSave(e) {
    e.preventDefault()
    if (!firmId || !firmName) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        firm_id:   firmId,
        firm_name: firmName,
      })
      .eq('id', currentUser.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      onSaved?.({ ...currentUser, firm_id: firmId, firm_name: firmName })
    }
    setSaving(false)
  }

  async function handleApplyToAll() {
    if (!firmId || !firmName) return
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        firm_id:   firmId,
        firm_name: firmName,
      })
      .is('firm_id', null)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setStaffCount(0)
    }
    setSaving(false)
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">הגדרות משרד</h2>

      {currentUser?.firm_id == null && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
          ⚠️ עדיין לא הוגדר <strong>Firm ID</strong> לפרופיל שלך. הגדר ושמור כדי לתקן בעיות RLS.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שם המשרד *</label>
          <input
            type="text"
            value={firmName}
            onChange={e => setFirmName(e.target.value)}
            required
            dir="rtl"
            placeholder="לדוגמה: כהן ושות׳"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Firm ID (UUID) *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={firmId}
              onChange={e => setFirmId(e.target.value)}
              dir="ltr"
              placeholder="UUID"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setFirmId(uuidv4())}
              className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 whitespace-nowrap">
              ✦ ייצר חדש
            </button>
          </div>
        </div>

        {error   && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">❌ {error}</div>}
        {success && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">✅ נשמר בהצלחה!</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg text-sm">
          {saving ? '🔄 שומר הגדרות משרד...' : 'שמור'}
        </button>
      </form>

      {staffCount !== null && staffCount > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">תחזוקת המשתמשים</h3>
          <p className="text-sm text-gray-500 mb-3">יש <strong>{staffCount}</strong> משתמשים ללא firm_id.</p>
          <button
            onClick={handleApplyToAll}
            disabled={saving || !firmId || !firmName}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium py-2 px-4 rounded-lg">
            {saving ? `🔄 מעדכן...` : `עדכן ${staffCount} משתמשים`}
          </button>
        </div>
      )}

      {staffCount === 0 && (
        <div className="mt-4 text-xs text-gray-400">✅ כל המשתמשים כבר משויכים ל-firm_id.</div>
      )}
    </div>
  )
}
