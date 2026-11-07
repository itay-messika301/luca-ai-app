import ProfileForm from '@/components/ProfileForm'

// "My profile" page — for every signed-in user (office staff and end clients).
export default function Profile() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl" dir="rtl">
      <h1 className="text-slate-900 dark:text-white text-2xl font-bold">הפרופיל שלי</h1>
      <p className="text-slate-500 dark:text-white/50 text-sm mt-0.5 mb-6">הפרטים שלך, התמונה ואיך המערכת מוצגת לך</p>
      <ProfileForm />
    </div>
  )
}
