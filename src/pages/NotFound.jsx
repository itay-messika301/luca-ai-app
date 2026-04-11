import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-7xl font-bold text-slate-200 mb-4">404</p>
        <h2 className="text-xl font-bold text-slate-900 mb-2">הדף לא נמצא</h2>
        <p className="text-slate-500 text-sm mb-6">הדף שחיפשת אינו קיים</p>
        <Link to="/" className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
          חזרה לבית
        </Link>
      </div>
    </div>
  )
}
