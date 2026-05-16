# Patch — BUG-01: Show NULL fields as editable in Review Queue

**מטרה:** לאפשר לבודק/רואה-חשבון להוסיף ערך לשדה ריק ב-ReviewQueue (במיוחד `allocation_number` למסמכי `blocked`).

**קובץ:** `src/pages/ReviewQueue.jsx`

**מיקום:** שורה 352-405, בתוך `DocReviewPane` → `<div>{/* Editable fields */}>`

## הבעיה

```js
{EDITABLE_FIELDS.map(({ key, label, type }) => {
  const value = doc[key]
  if (value === null || value === undefined) return null   // ← מסתיר שדות ריקים
  ...
}
```

## התיקון

החלף את הבלוק `{EDITABLE_FIELDS.map(...)}` במלואו ב:

```jsx
{EDITABLE_FIELDS.map(({ key, label, type }) => {
  const value = doc[key]
  const hasValue = value !== null && value !== undefined && value !== ''
  const isEditing = editingField?.field === key

  return (
    <div key={key} className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0">
      <span className="text-slate-400 dark:text-white/30 text-xs w-28 flex-shrink-0 pt-0.5">{label}</span>
      {isEditing ? (
        <div className="flex-1 space-y-1.5">
          <input
            type={type || 'text'}
            value={editingField.value}
            onChange={e => setEditingField(f => ({ ...f, value: e.target.value }))}
            className="w-full bg-slate-100 dark:bg-white/5 border border-blue-500/50 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none"
            autoFocus
          />
          <input
            value={editReason}
            onChange={e => setEditReason(e.target.value)}
            placeholder="סיבת השינוי (חובה)"
            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-500 dark:text-white/60 text-xs focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={submitFieldEdit}
              disabled={!editReason.trim() || saving}
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs"
            >
              <Check className="w-3 h-3" /> שמור
            </button>
            <button
              onClick={() => { setEditingField(null); setEditReason('') }}
              className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 rounded text-xs"
            >
              <X className="w-3 h-3" /> ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between gap-2">
          <span className={`text-xs ${hasValue ? 'text-slate-600 dark:text-white/70' : 'text-slate-300 dark:text-white/25 italic'}`}>
            {hasValue
              ? (type === 'number' ? `₪${Number(value).toLocaleString('he-IL')}` : value)
              : '— ריק (לחץ לעריכה)'}
          </span>
          <button
            onClick={() => setEditingField({ field: key, value: hasValue ? String(value) : '', oldValue: value })}
            className="p-0.5 text-slate-400 dark:text-white/20 hover:text-slate-500 dark:hover:text-white/60 transition-colors flex-shrink-0"
            title={hasValue ? 'ערוך' : 'הוסף ערך'}
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
})}
```

## שינויים מהותיים

1. **הסרת `if (value === null || value === undefined) return null`** — כל שדה מוצג תמיד.
2. **חישוב `hasValue`** — מבדיל בין שדה ריק (כולל `''`) לבין שדה עם ערך.
3. **תצוגה דיפרנציאלית** — שדה ריק מוצג ב-italic אפור עם "— ריק (לחץ לעריכה)".
4. **כפתור edit פעיל גם לשדות ריקים** — value ראשוני מתחיל כ-`''` במקום `String(null)`.
5. **`autoFocus`** על ה-input כדי לחסוך קליק אחרי פתיחת מצב עריכה.

## מה ההשפעה?

- **שדה ריק → קליק על העיפרון → מילוי ערך + סיבה → שמירה** → ה-DB מתעדכן, audit_log מתעדכן, ה-blocking issue נפתר ידנית (אם validate שוב מבוטל) או נשאר ב-validation_results.issues עד reprocess.

## בדיקה אחרי החלת הפאצ'

1. רענן `/review` ובחר את D3 (`D3_invoice_no_alloc.pdf`).
2. אמור לראות "מספר הקצאה: — ריק (לחץ לעריכה)".
3. לחץ על העיפרון → הקלד מספר הקצאה (למשל `AL-2026-NEW`) + סיבת שינוי "תיקון ידני אחרי באג" → שמור.
4. השדה אמור להתעדכן.
5. `audit_log` אמור לכלול את ה-edit.

## הערה ל-BUG-02

`DocDetailPanel` ב-`/documents` סובל מאותה בעיה במקום אחר. אחרי החלת BUG-01, אתה (או צ'אט הבא) צריך לקרוא את `src/pages/Documents.jsx` ולתקן את אותה לוגיקה גם שם.
