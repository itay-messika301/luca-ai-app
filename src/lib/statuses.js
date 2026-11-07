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
