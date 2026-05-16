import { useState } from 'react'
import { Link2, Check } from 'lucide-react'

/**
 * Small button that copies a deep-link to the clipboard.
 * Pass either a full URL or a relative path (auto-prefixed with window.location.origin).
 */
export default function CopyLinkButton({ url, path, title = 'העתק קישור', className = '' }) {
  const [copied, setCopied] = useState(false)

  async function handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    const fullUrl = url
      || (typeof window !== 'undefined' ? window.location.origin + (path || window.location.pathname + window.location.search) : '')
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select & copy via execCommand
      try {
        const ta = document.createElement('textarea')
        ta.value = fullUrl
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch { /* noop */ }
    }
  }

  return (
    <button
      onClick={handleClick}
      title={copied ? 'הועתק' : title}
      className={`inline-flex items-center gap-1 text-xs transition-colors ${
        copied
          ? 'text-green-500 dark:text-green-400'
          : 'text-slate-400 dark:text-white/40 hover:text-blue-500 dark:hover:text-blue-400'
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
      {copied ? 'הועתק' : 'העתק קישור'}
    </button>
  )
}
