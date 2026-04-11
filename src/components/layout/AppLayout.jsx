import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout({ isClient = false }) {
  return (
    <div className="flex min-h-screen bg-[#F8F8FA]">
      <Sidebar isClient={isClient} />
      <main className="flex-1 mr-60 p-8">
        <Outlet />
      </main>
    </div>
  )
}
