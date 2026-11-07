import { useState } from 'react'
import { Mail, Copy, Check } from 'lucide-react'

// Domain that receives intake mail (MX → email provider). See docs/EMAIL_INTAKE_SETUP.md.
export const INTAKE_EMAIL_DOMAIN = import.meta.env.VITE_INTAKE_EMAIL_DOMAIN || 'in.luca-ai.io'

export function intakeAddress(workspace) {
  return workspace?.intake_key ? `invoices+${workspace.intake_key}@${INTAKE_EMAIL_DOMAIN}` : null
}

/** Settings card: the office's intake address, a copy button and short instructions. */
export default function IntakeEmailCard({ workspace }) {
  const address = intakeAddress(workspace)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = address
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* noop */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
      <h2 className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold mb-1">
        <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        כתובת לקליטת מסמכים במייל
      </h2>
      <p className="text-slate-500 dark:text-white/60 text-sm mb-4">
        מסמכים שנשלחים לכתובת הזו נכנסים לבד ללוקה, נשמרים אצל הלקוח ועוברים עיבוד AI.
      </p>

      {address ? (
        <div className="flex flex-wrap items-center gap-2">
          <code dir="ltr" className="flex-1 min-w-0 break-all bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white select-all">
            {address}
          </code>
          <button
            type="button"
            onClick={copy}
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'הועתק' : 'העתקה'}
          </button>
        </div>
      ) : (
        <p className="text-amber-700 dark:text-amber-300 text-sm">
          הכתובת תופיע כאן אחרי שהקליטה במייל תופעל במערכת.
        </p>
      )}

      <ul className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-white/70 list-disc pr-5">
        <li>לכל לקוח, מלאו בכרטיס הלקוח את השדה "מייל לשליחת חשבוניות" (הכתובת שממנה הלקוח שולח).</li>
        <li>הלקוח מעביר חשבוניות לכתובת שלמעלה, כקובץ מצורף: PDF, JPG, PNG או WEBP, עד 10MB לקובץ.</li>
        <li>מסמך משולח שלא מזוהה נכנס ל"לא משויכים" במסך המסמכים, ושם משייכים אותו ללקוח.</li>
        <li>תוכן המייל ותמונות חתימה לא נשמרים. קובץ שכבר התקבל לא ייקלט פעמיים.</li>
      </ul>
    </div>
  )
}
