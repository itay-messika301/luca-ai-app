import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

/**
 * Shared date-range filter with preset chips + custom range.
 *
 * Controlled component: parent owns `value` = { preset, from, to } and gets
 * updates via onChange. `from`/`to` are ISO date strings (YYYY-MM-DD) or null.
 *
 * Presets: this_month | last_month | last_3_months | ytd | all | custom
 */

function isoDate(d) {
  // Local YYYY-MM-DD (avoids UTC off-by-one from toISOString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function presetRange(preset, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'this_month':
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) }
    case 'last_3_months':
      return { from: isoDate(new Date(y, m - 2, 1)), to: isoDate(new Date(y, m + 1, 0)) }
    case 'ytd':
      return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, m + 1, 0)) }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

const PRESETS = [
  { key: 'this_month',    label: 'החודש' },
  { key: 'last_month',    label: 'חודש קודם' },
  { key: 'last_3_months', label: '3 חודשים' },
  { key: 'ytd',           label: 'מתחילת השנה' },
  { key: 'all',           label: 'הכל' },
]

export default function DateRangeFilter({ value, onChange }) {
  const { preset = 'all', from = null, to = null } = value || {}
  const [showCustom, setShowCustom] = useState(preset === 'custom')

  function selectPreset(key) {
    setShowCustom(false)
    onChange({ preset: key, ...presetRange(key) })
  }

  function setCustom(field, v) {
    const next = { preset: 'custom', from, to, [field]: v || null }
    onChange(next)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" dir="rtl">
      {PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => selectPreset(p.key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            preset === p.key
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => { setShowCustom(s => !s); if (!showCustom && preset !== 'custom') onChange({ preset: 'custom', from, to }) }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          preset === 'custom'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
        }`}
      >
        <Calendar className="w-3.5 h-3.5" />
        טווח מותאם
        <ChevronDown className={`w-3 h-3 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
      </button>

      {showCustom && (
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5">
          <label className="text-xs text-slate-400 dark:text-white/40">מ־</label>
          <input
            type="date"
            value={from || ''}
            max={to || undefined}
            onChange={e => setCustom('from', e.target.value)}
            className="bg-transparent text-slate-700 dark:text-white/80 text-xs focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
          <label className="text-xs text-slate-400 dark:text-white/40">עד</label>
          <input
            type="date"
            value={to || ''}
            min={from || undefined}
            onChange={e => setCustom('to', e.target.value)}
            className="bg-transparent text-slate-700 dark:text-white/80 text-xs focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Filter helper: does an ISO timestamp fall within [from, to] (inclusive)?
 * `to` is treated as end-of-day. Null bounds mean unbounded.
 */
export function inDateRange(isoTimestamp, from, to) {
  if (!isoTimestamp) return true
  if (!from && !to) return true
  const t = new Date(isoTimestamp).getTime()
  if (from && t < new Date(from + 'T00:00:00').getTime()) return false
  if (to && t > new Date(to + 'T23:59:59.999').getTime()) return false
  return true
}
