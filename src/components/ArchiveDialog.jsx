import { useState } from 'react'
import { Archive, X } from 'lucide-react'
import Modal from '@/components/Modal'

const SEEN_KEY = 'luca:archive-explained'

function wasExplained() {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

/**
 * Confirmation before archiving a client.
 * First time: full explanation of what "archive" means + "don't show again".
 * After that: a short confirmation.
 */
export default function ArchiveDialog({ clientName, onConfirm, onCancel }) {
  const [explain]   = useState(() => !wasExplained())
  const [dontShow, setDontShow] = useState(false)

  function confirm() {
    if (explain && dontShow) {
      try { localStorage.setItem(SEEN_KEY, '1') } catch { /* storage blocked */ }
    }
    onConfirm()
  }

  return (
    <Modal onClose={onCancel} labelledBy="archive-title">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
              <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 id="archive-title" className="text-slate-900 dark:text-white font-bold text-lg">
              להעביר לארכיון?
            </h3>
          </div>
          <button onClick={onCancel} aria-label="סגירה" className="text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-700 dark:text-white/80 text-sm mb-3">
          הלקוח <span className="font-semibold">{clientName}</span> יוסר מרשימת הלקוחות הפעילים.
        </p>

        {explain && (
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm text-slate-600 dark:text-white/70 space-y-1.5 mb-4">
            <p className="font-semibold text-slate-800 dark:text-white">מה זה ארכיון?</p>
            <p>• הלקוח לא נמחק — כל המסמכים והנתונים שלו נשמרים.</p>
            <p>• הוא לא יופיע ברשימות, בהעלאות ובייצוא.</p>
            <p>• כדי למצוא אותו: מסך "לקוחות" ← לשונית "בארכיון".</p>
            <p>• אפשר להחזיר אותו בכל רגע בלחיצה על "שחזר".</p>
            <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
              <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} className="w-4 h-4" />
              <span>לא להציג את ההסבר הזה שוב</span>
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={confirm}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            העבר לארכיון
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-2.5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white/80 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5"
          >
            ביטול
          </button>
        </div>
    </Modal>
  )
}
