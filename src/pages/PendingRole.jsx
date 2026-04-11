import { useAuth } from '@/lib/AuthContext'

export default function PendingRole() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-[#F8F8FA] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⏳</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">ממתין לאישור</h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          החשבון שלך נוצר בהצלחה. עדיין לא הוקצה לך תפקיד במערכת.
          יש לפנות למשרד רו״ח שלך על מנת לקבל גישה.
        </p>
        <button
          onClick={signOut}
          className="mt-6 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          התנתק
        </button>
      </div>
    </div>
  )
}
