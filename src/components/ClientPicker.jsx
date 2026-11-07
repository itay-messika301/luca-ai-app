import { useState, useRef, useEffect, useMemo, useId } from 'react'
import { Search, X, Check } from 'lucide-react'

// Normalise for Hebrew-friendly matching: strip quotes/geresh/punctuation, lowercase
const norm = s => String(s || '')
  .toLowerCase()
  .replace(/["'״׳`.,\-_()]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

/**
 * Searchable client picker (combobox). Type part of a name or ח.פ and pick.
 *
 * Single:   <ClientPicker clients={c} value={id} onChange={id => …} />
 * Multiple: <ClientPicker clients={c} multiple value={[ids]} onChange={ids => …} />
 *
 * Props:
 *  - allowEmpty / emptyLabel: show a "כל הלקוחות" style option that clears the value (single mode)
 */
export default function ClientPicker({
  clients = [],
  value,
  onChange,
  multiple = false,
  placeholder = 'הקלידו שם לקוח או ח.פ…',
  allowEmpty = false,
  emptyLabel = 'כל הלקוחות',
  autoFocus = false,
  id,
  className = '',
}) {
  const autoId = useId()
  const inputId = id || autoId
  const listId  = inputId + '-list'
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const boxRef   = useRef(null)
  const inputRef = useRef(null)

  const selectedIds = multiple ? (value || []) : (value ? [value] : [])
  const selected    = clients.filter(c => selectedIds.includes(c.id))
  const single      = !multiple ? selected[0] : null

  const results = useMemo(() => {
    const q = norm(query)
    const list = q
      ? clients.filter(c => norm(c.business_name).includes(q) || String(c.registration_number || '').includes(q))
      : clients
    return list.slice(0, 50)
  }, [clients, query])

  const options = allowEmpty && !multiple && !query ? [{ id: '', business_name: emptyLabel }, ...results] : results

  useEffect(() => { setActive(0) }, [query, open])

  // Close when clicking outside
  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(c) {
    if (multiple) {
      const next = selectedIds.includes(c.id) ? selectedIds.filter(x => x !== c.id) : [...selectedIds, c.id]
      onChange(next)
      setQuery('')
      inputRef.current?.focus()
    } else {
      onChange(c.id)
      setQuery('')
      setOpen(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && options[active]) { e.preventDefault(); pick(options[active]) } }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
    else if (e.key === 'Backspace' && multiple && !query && selectedIds.length) { onChange(selectedIds.slice(0, -1)) }
  }

  // In single mode the input shows the chosen name until the user starts typing
  const inputValue = !multiple && !open && single ? single.business_name : query

  return (
    <div ref={boxRef} className={`relative ${className}`} dir="rtl">
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-blue-600/10 text-blue-800 dark:text-blue-200 border border-blue-500/30 rounded-full px-2.5 py-1 text-xs">
              {c.business_name}
              <button type="button" onClick={() => pick(c)} aria-label={`הסרת ${c.business_name}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/40 pointer-events-none" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={inputValue}
          placeholder={single ? single.business_name : placeholder}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pr-9 pl-8 py-2.5 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        {!multiple && single && (
          <button
            type="button"
            onClick={() => { onChange(allowEmpty ? '' : null); setQuery(''); inputRef.current?.focus() }}
            aria-label="ניקוי בחירה"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white dark:bg-[#16161d] border border-slate-200 dark:border-white/10 rounded-lg shadow-xl py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-500 dark:text-white/50">לא נמצאו לקוחות מתאימים</li>
          ) : options.map((c, i) => {
            const isSel = c.id ? selectedIds.includes(c.id) : selectedIds.length === 0
            return (
              <li
                key={c.id || '__all'}
                role="option"
                aria-selected={isSel}
                onMouseDown={e => { e.preventDefault(); pick(c) }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${
                  i === active ? 'bg-blue-50 dark:bg-white/10' : ''
                } ${isSel ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-white/85'}`}
              >
                <span className="truncate">{c.business_name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {c.registration_number && <span className="text-xs text-slate-400 dark:text-white/40 font-mono">{c.registration_number}</span>}
                  {isSel && <Check className="w-4 h-4" />}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
