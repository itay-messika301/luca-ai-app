import Sidebar from './Sidebar'

export default function AppLayout({ children, isClient = false }) {
  return (
    <div className="flex min-h-screen bg-[#0A0A0F]">
      <Sidebar isClient={isClient} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
