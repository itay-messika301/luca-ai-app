// One vocabulary for document review statuses across all office screens.
export const REVIEW_LABEL = {
  ready:        'מוכן לייצוא',
  needs_review: 'דורש בדיקה',
  blocked:      'חסום',
}

export const REVIEW_HELP = {
  ready:        'כל הבדיקות עברו (או שהמסמך אושר ידנית). המסמך יופיע במסך הייצוא.',
  needs_review: 'ה-AI מצא משהו שכדאי לבדוק (למשל ביטחון נמוך או מע"מ חריג). בדקו ואשרו במסך "לטיפול".',
  blocked:      'חסר נתון חובה (למשל מספר הקצאה בחשבונית מעל הסף). אי אפשר לייצא עד שמשלימים אותו במסך "לטיפול".',
}

// Processing status, shown when a document has no review status yet.
export const PROC_STATUS = {
  pending:    { label: 'ממתין לעיבוד', color: 'text-slate-400 dark:text-white/40' },
  processing: { label: 'בעיבוד',       color: 'text-blue-700 dark:text-blue-400' },
  processed:  { label: 'עיבוד הושלם',  color: 'text-slate-500 dark:text-white/60' },
  error:      { label: 'שגיאה',        color: 'text-red-700 dark:text-red-400' },
}
