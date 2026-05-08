import Sidebar from './Sidebar'

export default function AppLayout({ children, isClient = false }) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0A0A0F]">
      <Sidebar isClient={isClient} />
      <main className="flex-1 overflow-auto mr-60">
        {children}
      </main>
    </div>
  )
}
