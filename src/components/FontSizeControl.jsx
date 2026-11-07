import { useEffect, useState } from 'react'

// Text-size steps (percent of the browser default). Tailwind sizes are in rem,
// so changing the root font-size scales the whole app.
const STEPS = [87.5, 100, 112.5, 125, 137.5]
const KEY = 'luca:font-scale'

function readStep() {
  try {
    const v = Number(localStorage.getItem(KEY))
    return STEPS.includes(v) ? v : 100
  } catch { return 100 }
}

export function applyStoredFontScale() {
  document.documentElement.style.fontSize = readStep() + '%'
}

export default function FontSizeControl() {
  const [step, setStep] = useState(readStep)

  useEffect(() => {
    document.documentElement.style.fontSize = step + '%'
    try { localStorage.setItem(KEY, String(step)) } catch { /* storage blocked */ }
  }, [step])

  const i = STEPS.indexOf(step)
  const btn = 'flex-1 py-1.5 rounded-md text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent font-semibold'

  return (
    <div className="px-2">
      <p className="text-slate-500 dark:text-white/50 text-xs mb-1" id="font-size-label">גודל טקסט</p>
      <div role="group" aria-labelledby="font-size-label" className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-lg p-1">
        <button className={btn + ' text-xs'} onClick={() => setStep(STEPS[i - 1])} disabled={i <= 0} aria-label="הקטנת טקסט">א−</button>
        <button className={btn + ' text-sm'} onClick={() => setStep(100)} aria-label="גודל רגיל" aria-pressed={step === 100}>א</button>
        <button className={btn + ' text-base'} onClick={() => setStep(STEPS[i + 1])} disabled={i >= STEPS.length - 1} aria-label="הגדלת טקסט">א+</button>
      </div>
    </div>
  )
}
