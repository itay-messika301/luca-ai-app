import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Upload } from 'lucide-react'
import UploadModal, { openUpload } from '@/components/UploadModal'
import Sidebar from './Sidebar'
import { useAuth } from '@/lib/AuthContext'
import { canUpload } from '@/lib/permissions'

export default function AppLayout({ children, isClient = false }) {
  const [navOpen, setNavOpen] = useState(false)
  const [upload,  setUpload]  = useState(null)   // { clientId } when the global upload dialog is open

  // Any screen can open the upload dialog: openUpload({ clientId })
  useEffect(() => {
    const onOpen = e => setUpload({ clientId: e.detail?.clientId || '' })
    window.addEventListener('luca:open-upload', onOpen)
    return () => window.removeEventListener('luca:open-upload', onOpen)
  }, [])
  const location = useLocation()
  const { workspace, profile } = useAuth()

  // Close the mobile drawer on navigation
  useEffect(() => { setNavOpen(false) }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0A0A0F]">
      <Sidebar isClient={isClient} open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 z-30 flex items-center justify-between px-4 bg-slate-50/95 dark:bg-[#0A0A0F]/95 backdrop-blur border-b border-slate-200 dark:border-white/5" dir="rtl">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">L</div>
          <span className="text-slate-900 dark:text-white font-bold text-sm truncate">{workspace?.name || 'Luca AI'}</span>
        </div>
        <div className="flex items-center gap-1">
        {canUpload(profile) && (
          <button
            onClick={() => openUpload()}
            aria-label="העלאת מסמך"
            className="p-2 rounded-lg bg-blue-600 text-white"
          >
            <Upload className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setNavOpen(true)}
          aria-label="פתיחת תפריט"
          className="p-2 -ml-2 rounded-lg text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <Menu className="w-5 h-5" />
        </button>
        </div>
      </header>

      <main className="flex-1 min-w-0 overflow-auto md:mr-60 pt-14 md:pt-0">
        {children}
      </main>

      {upload && (
        <UploadModal initialClientId={upload.clientId} onClose={() => setUpload(null)} />
      )}
    </div>
  )
}
