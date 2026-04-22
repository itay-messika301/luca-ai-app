import Sidebar from './Sidebar'

export default function AppLayout({ children, isClient = false }) {
  return (
    <div className="flex min-h-screen bg-[#F8F8FA]">
      <Sidebar isClient={isClient} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
