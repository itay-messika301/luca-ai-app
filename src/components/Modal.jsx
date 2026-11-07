import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

/**
 * Shared dialog shell for the whole app.
 *  - Clicking the grey backdrop or pressing Esc closes it.
 *  - When `dirty` is true (files picked, fields filled) it first asks
 *    "leave without saving?" instead of closing straight away.
 *  - While `busy` (e.g. uploading) it can't be closed.
 *
 * Children can close it through the same guard with useModalClose()
 * or by rendering <ModalCloseButton />.
 */
const ModalCtx = createContext(() => {})
export const useModalClose = () => useContext(ModalCtx)

export default function Modal({
  onClose,
  dirty = false,
  busy = false,
  confirmTitle = 'לצאת בלי לשמור?',
  confirmBody  = 'השינויים שעשית לא יישמרו.',
  confirmStay  = 'המשך',
  confirmLeave = 'צא בלי לשמור',
  label,
  labelledBy,
  maxWidth = 'max-w-md',
  z = 'z-[60]',
  variant = 'dialog',      // 'dialog' (centred card) | 'drawer' (full-height side panel)
  padded = true,
  panelClassName = '',
  children,
}) {
  const [confirming, setConfirming] = useState(false)
  const downOnBackdrop = useRef(false)

  const requestClose = useCallback(() => {
    if (busy) return
    if (dirty) setConfirming(true)
    else onClose?.()
  }, [busy, dirty, onClose])

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (confirming) setConfirming(false)
      else requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirming, requestClose])

  // Only treat it as a backdrop click when the press both started and ended
  // on the backdrop, so selecting text inside the panel and releasing outside
  // doesn't close it.
  const onBackdropDown = e => { downOnBackdrop.current = e.target === e.currentTarget }
  const onBackdropUp   = e => {
    if (downOnBackdrop.current && e.target === e.currentTarget) requestClose()
    downOnBackdrop.current = false
  }

  return (
    <ModalCtx.Provider value={requestClose}>
      <div
        className={`fixed inset-0 bg-black/60 flex ${variant === 'drawer' ? 'justify-end' : 'items-center justify-center p-4'} ${z}`}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        onMouseDown={onBackdropDown}
        onMouseUp={onBackdropUp}
      >
        <div className={variant === 'drawer'
          ? panelClassName
          : `relative bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl ${padded ? 'p-6' : ''} w-full ${maxWidth} shadow-2xl max-h-[90vh] overflow-y-auto ${panelClassName}`}>
          {children}
        </div>

        {confirming && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 bg-black/40"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="modal-confirm-title"
          >
            <div className="bg-white dark:bg-[#16161d] border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <h3 id="modal-confirm-title" className="text-slate-900 dark:text-white font-bold text-base">{confirmTitle}</h3>
              <p className="text-slate-600 dark:text-white/60 text-sm mt-1.5">{confirmBody}</p>
              <div className="flex gap-2 mt-5">
                <button
                  autoFocus
                  onClick={() => setConfirming(false)}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  {confirmStay}
                </button>
                <button
                  onClick={() => { setConfirming(false); onClose?.() }}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium"
                >
                  {confirmLeave}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalCtx.Provider>
  )
}

export function ModalCloseButton({ className = '' }) {
  const close = useModalClose()
  return (
    <button
      type="button"
      onClick={close}
      aria-label="סגירה"
      className={`text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white ${className}`}
    >
      <X className="w-5 h-5" />
    </button>
  )
}

export function ModalHeader({ id, title, children }) {
  return (
    <div className="flex items-center justify-between mb-5 gap-3">
      <h2 id={id} className="text-slate-900 dark:text-white font-bold text-lg">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        <ModalCloseButton />
      </div>
    </div>
  )
}
