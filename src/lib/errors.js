// Turns any error (Supabase / Postgres / network / API) into a Hebrew,
// user-facing message. Messages that are already Hebrew pass through.
const HEBREW = /[֐-׿]/

export function toHebrewError(err, fallback = 'משהו השתבש. נסו שוב בעוד רגע.') {
  const msg  = typeof err === 'string' ? err : (err?.message || '')
  const code = typeof err === 'object' ? (err?.code || '') : ''

  if (HEBREW.test(msg)) return msg
  if (err) console.error(err)

  const m = msg.toLowerCase()
  if (code === '23505' || m.includes('duplicate key'))            return 'הרשומה כבר קיימת במערכת'
  if (code === '42501' || m.includes('row-level security') ||
      m.includes('permission denied') || m.includes('not allowed')) return 'אין הרשאה לפעולה הזו'
  if (code === '23503' || m.includes('foreign key'))              return 'לא ניתן לבצע את הפעולה כי יש נתונים מקושרים'
  if (m.includes('failed to fetch') || m.includes('network'))     return 'בעיית חיבור לרשת. בדקו את החיבור ונסו שוב.'
  if (m.includes('jwt') || m.includes('expired') || m.includes('not authenticated'))
                                                                  return 'החיבור פג תוקף. התחברו מחדש.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes'))
                                                                  return 'נשלחו יותר מדי בקשות. נסו שוב בעוד דקה.'
  if (m.includes('password should be') || m.includes('password'))  return 'הסיסמה חייבת להכיל לפחות 6 תווים'
  if (m.includes('payload too large') || m.includes('exceeded the maximum'))
                                                                  return 'הקובץ גדול מדי'
  if (m.includes('invalid') && m.includes('key'))                 return 'שם הקובץ אינו תקין'
  return fallback
}
