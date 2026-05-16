# Sprint 16 — QA ידני קצה-לקצה לתהליך מסמך (Mock AI)

**סטטוס:** פעיל · **התחלה:** 2026-05-16 · **בעלים:** מור

## מטרה

לוודא שתהליך המסמך מהרגע ש"חולץ בהצלחה" ועד ל"ייצוא לקובץ" עובד חלק, נכון מבחינת state-machine, מציג נכון בכל מסך, ולא נופל באף תרחיש קצה — **בלי לבזבז קרדיטים של Claude Vision**.

לאחר מכן, כשאוסיף קרדיטים, נדע שהמערכת מוכנה להפעלה אמיתית של AI על מסמכים אמיתיים.

## עקרון מנחה

- **המסמך כבר "עלה" + "חולץ".** אנחנו מדלגים על השלב של AI extraction ומזריקים ל-DB 5 מסמכים שכאילו עברו עיבוד מוצלח, עם שדות מלאים.
- בדיקה ידנית של המעברים בין השלבים דרך ה-UI: **Documents → ReviewQueue → (ApprovalQueue) → ExportCenter**.

---

## תעדוף

| # | שלב | עדיפות | תוצר |
|---|---|---|---|
| 1 | **תרחישי בדיקה** — הגדרת 5 תרחישים שמכסים את כל הענפים | 🔴 גבוהה | חלק 1 בקובץ זה |
| 2 | **Seed script** — סקריפט SQL להזרקת 5 מסמכים | 🔴 גבוהה | `supabase/seeds/sprint16_mock_documents.sql` |
| 3 | **תיעוד הרצה** — איך להריץ את ה-seed (מקומי / staging) | 🔴 גבוהה | חלק 2 בקובץ זה |
| 4 | **טבלת בדיקה ידנית** — צ'קליסט שלב-אחר-שלב | 🟠 בינונית | חלק 3 בקובץ זה |
| 5 | **תיעוד באגים** — תוצאות + רשימת באגים שנמצאו | 🟠 בינונית | חלק 4 בקובץ זה (יתעדכן בהרצה) |
| 6 | **תיקון באגים** — לאחר זיהוי | 🟡 לפי ממצאים | קומיטים נפרדים |
| 7 | **Cleanup script** — מחיקת ה-mock data בסיום | 🟢 נמוכה | `supabase/seeds/sprint16_cleanup.sql` |

---

## חלק 1 — 5 תרחישי בדיקה (Coverage Matrix)

| # | תרחיש | סכום | מספר הקצאה | Confidence | Duplicate? | Status צפוי | מסלול צפוי |
|---|---|---|---|---|---|---|---|
| **D1** | חשבונית קטנה תקינה | ₪1,180 (כולל מע"מ 18%) | לא נדרש | 0.95 | לא | `needs_review` | אישור → ready → ייצוא |
| **D2** | חשבונית גדולה עם הקצאה תקינה | ₪11,800 | קיים | 0.92 | לא | `needs_review` | אישור → ready → ייצוא |
| **D3** | חשבונית גדולה **ללא** מספר הקצאה | ₪7,080 | ריק | 0.88 | לא | `blocked` | חסום → תיקון ידני → ready → ייצוא |
| **D4** | קבלה Low-confidence | ₪413 | לא נדרש | 0.45 | לא | `needs_review` | דחייה (reject) → blocked |
| **D5** | חשבונית כפולה (vendor+invoice_number זהים ל-D1) | ₪1,180 | לא נדרש | 0.90 | **כן** | `needs_review` + `is_duplicate=true` | אישור ידני אחרי בדיקה |

### למה הבחירה הזו

5 התרחישים מכסים את **כל ענפי ה-validation** ב-`api/process-document.js`:
- ✅ נתיב חיובי פשוט (D1)
- ✅ נתיב חיובי עם trigger של מספר הקצאה (D2)
- ✅ Blocking issue (D3)
- ✅ Low confidence (D4) — בוחנים את מסלול הדחייה
- ✅ Duplicate detection (D5)

ובנוסף — כשנגיע ל-`ExportCenter`, יהיו לנו לפחות 2 מסמכים במצב `ready` לייצוא לאקסל.

---

## חלק 2 — איך מריצים את ה-Seed

ה-seed נמצא ב-`supabase/seeds/sprint16_mock_documents.sql`. הוא:
1. מצפה למשתני סביבה: `WORKSPACE_ID` ו-`CLIENT_ID` בתוך SQL (placeholder).
2. מוסיף 5 שורות לטבלת `documents` עם `status='processed'` ושדות מלאים.
3. **לא מעלה קבצים אמיתיים ל-Storage** — שדה `file_path` מצביע על קובץ דמה (`mock/sprint16/...`). אם הקליק על preview ייכשל — זה צפוי, לא באג. (אם נרצה גם preview אמיתי, נעלה ידנית 5 PDF placeholders לאותו path).

### צעדי הרצה

#### אופציה A — דרך Supabase SQL Editor (מומלץ למקרה הראשון)
1. היכנס ל-Supabase Dashboard → Project → SQL Editor.
2. פתח את `supabase/seeds/sprint16_mock_documents.sql`.
3. בראש הקובץ, החלף את שני ה-placeholders:
   - `:workspace_id` → ה-UUID של ה-workspace שלך
   - `:client_id` → ה-UUID של לקוח קיים תחת אותו workspace
4. הרץ — אמורות להופיע 5 שורות חדשות בטבלת `documents`.
5. רענן את `/documents` באפליקציה — אמורות להופיע 5 שורות חדשות.

#### לאיתור ה-IDs המתאימים
```sql
-- workspace_id שלך
select id, name from public.workspaces;
-- client_id קיים תחת ה-workspace
select id, business_name from public.clients where workspace_id = '<paste-workspace-id>';
```

#### אופציה B — דרך Supabase CLI (אם יש מקומי)
```bash
psql "$SUPABASE_DB_URL" \
  -v workspace_id="'<uuid>'" \
  -v client_id="'<uuid>'" \
  -f supabase/seeds/sprint16_mock_documents.sql
```

---

## חלק 3 — טבלת בדיקה ידנית (Checklist)

> סמן ✅ / ❌ לצד כל שורה לאחר בדיקה. בעיות יתועדו בחלק 4.

### שלב A — מסך Documents (`/documents`)

| # | בדיקה | ציפייה | תוצאה |
|---|---|---|---|
| A1 | 5 השורות החדשות מופיעות | רואים את D1-D5 | ☐ |
| A2 | Status column מציג "עובד" (processed) | ✅ | ☐ |
| A3 | סכום, ספק, תאריך מוצגים | כולם מאוכלסים | ☐ |
| A4 | קליק על שורה → DocDetailPanel נפתח | כל השדות שחולצו מוצגים | ☐ |
| A5 | D3 מסומן במיוחד (blocked) | בולט ויזואלית | ☐ |
| A6 | D5 מסומן כ-duplicate | חיווי ויזואלי | ☐ |
| A7 | Confidence שונה בין D1 ל-D4 | D4 מציג אינדיקציה ל-low confidence | ☐ |
| A8 | מעבר ללשונית "ביקורת ואישורים" דרך `ProcessTabs` | מעבר חלק, ה-URL משתנה ל-`/review` | ☐ |

### שלב B — Review Queue (`/review`)

| # | בדיקה | ציפייה | תוצאה |
|---|---|---|---|
| B1 | D1, D2, D4, D5 מופיעים תחת `needs_review` | 4 שורות | ☐ |
| B2 | D3 מופיע תחת `blocked` | 1 שורה | ☐ |
| B3 | קליק על D3 → רואים את "בעיות שזוהו" | מופיעה אזהרה על מספר הקצאה חסר | ☐ |
| B4 | D3 → עריכת השדה `allocation_number` עם סיבת שינוי | השינוי נשמר; audit log רשום | ☐ |
| B5 | D3 לאחר תיקון → לחיצה על "אשר" | review_status → `ready` | ☐ |
| B6 | D1 → "אשר" → טוסט הצלחה + לינק לייצוא | טוסט מופיע למשך 8 שניות | ☐ |
| B7 | D2 → "אשר" | מועבר ל-`ready` | ☐ |
| B8 | D4 → "דחה" עם סיבה | review_status → `blocked` + reason נשמרת | ☐ |
| B9 | D5 → "אשר" למרות שזה duplicate | מאושר (אזהרה אינה חוסמת) | ☐ |
| B10 | חיפוש לפי שם ספק/מספר חשבונית | סינון עובד | ☐ |
| B11 | פילטרים `הכל / נדרש בדיקה / חסום` | ספירה מדויקת | ☐ |
| B12 | חיצים ◀ ▶ לניווט בין מסמכים | עובד גם בקצוות (disabled נכון) | ☐ |

### שלב C — Approval Queue (`/approvals` — אם מופעל approval_rule)

> רלוונטי אם יש `approval_rule` עם trigger ל-`amount_threshold` נמוך מ-D2 (₪11,800).

| # | בדיקה | ציפייה | תוצאה |
|---|---|---|---|
| C1 | יצירת approval_rule עם threshold=₪5,000 | מצליח | ☐ |
| C2 | אישור D2 ב-ReviewQueue → יוצר approval_request | approval_status → `pending` | ☐ |
| C3 | המסמך מופיע ב-`/approvals` עבור המאשר | ✅ | ☐ |
| C4 | אישור בשלב → approval_status → `approved` | ✅ | ☐ |

> אם אין approval_rule מוגדר — דלג על C, וודא ש-D2 עובר ישירות ל-`ready`.

### שלב D — Export Center (`/export`)

| # | בדיקה | ציפייה | תוצאה |
|---|---|---|---|
| D1 | רק מסמכים עם `review_status = ready` מופיעים | D1, D2, D5 (לאחר אישור) ולא D3/D4 | ☐ |
| D2 | סימון כמה מסמכים → "ייצא ל-Excel" | קובץ XLSX יורד | ☐ |
| D3 | בדיקת תוכן הקובץ | עמודות נכונות, סכומים מדויקים, מע"מ נכון | ☐ |
| D4 | בדיקת `exported_at` ב-DB | חתום עם timestamp + `export_id` | ☐ |
| D5 | המסמכים המיוצאים נעלמים מהתור / מסומנים | חיווי ויזואלי לכך שיוצאו | ☐ |
| D6 | ייצוא ל-CSV | פורמט תקין | ☐ |
| D7 | ייצוא לקובץ Priority/SAP (אם רלוונטי) | פורמט מתאים | ☐ |

### שלב E — בדיקות חוצות

| # | בדיקה | ציפייה | תוצאה |
|---|---|---|---|
| E1 | Deep-link `/documents?doc=<id>` נפתח על D3 | פתיחה ישירה של הפאנל | ☐ |
| E2 | Drilldown מ-ReviewQueue → ClientDetail | מעבר עובד | ☐ |
| E3 | Audit log רושם כל פעולה (approve/reject/edit) | רישומים נראים בפאנל admin | ☐ |
| E4 | RLS — משתמש מ-workspace אחר לא רואה את ה-5 | בדיקה ידנית עם משתמש בודק | ☐ |
| E5 | reviewer לא רואה ייצוא | redirect או hide | ☐ |
| E6 | end_client לא רואה כלום מתהליך זה | redirect ל-`/client` | ☐ |

---

## חלק 4 — תיעוד באגים / ממצאים (הרצה 2026-05-16)

### באגים שזוהו

| # | באג / הערה | חומרה | מסך | סטטוס תיקון |
|---|---|---|---|---|
| **BUG-01** | **שדה ריק לא ניתן לעריכה ב-ReviewQueue.** `EDITABLE_FIELDS.map(...)` מסתיר שדות שערכם `null`/`undefined` (`ReviewQueue.jsx:354`). אין דרך להוסיף `allocation_number` חסר ל-D3 דרך הממשק. הדרך היחידה — תיקון ב-DB. | 🔴 קריטי | `/review` | פתוח — תיקון מוצע: להציג את כל ה-EDITABLE_FIELDS עם placeholder "—" וכפתור עריכה ✏️ גם כשהערך null |
| **BUG-02** | **DocDetailPanel ב-`/documents` גם לא מאפשר הוספת שדה NULL.** מציג "—" סטטי בלי כפתור עריכה. | 🔴 קריטי | `/documents` | פתוח — אותו fix כמו BUG-01 |
| BUG-03 | **Sidebar badge "תהליך מסמך" לא מתעדכן ב-real-time** אחרי approve/reject. הטאב העליון "ביקורת ואישורים" כן מתעדכן. נדרש refresh של הדף כדי שהסיידבר יתסנכרן. | 🟠 בינוני | Sidebar | פתוח — לחבר את ה-Sidebar למקור הנתונים החי |
| BUG-04 | **מונה מיקום במסמך מוצג הפוך ב-RTL:** "3 / 1" במקום "1 / 3" (`ReviewQueue.jsx:300`). זה `{docIndex+1} / {total}` שמתפרש לא נכון בכיוון RTL. | 🟡 קוסמטי | `/review` (DocReviewPane) | פתוח — להחליף לפורמט "1 מתוך 3" או להוסיף `direction:ltr` למספרים |
| BUG-05 | **קליק על "ביקורת ואישורים" tab מפנה לפעמים ל-/export.** ייתכן בעיית `react-router` או טווח קליקים. דורש חקירה נוספת. | 🟠 בינוני | top tabs | פתוח — לבדוק שאין handler נוסף שעוקף `<Link>` |

### ממצאים חיוביים — הצליחו

- ✅ Seed של 5 מסמכים דרך לקוח-בדיקה ייעודי (`__TEST__ Sprint16 QA`)
- ✅ כל 5 השלבים של state-machine מוצגים נכון בכל המסכים
- ✅ Approve flow (D1/D2/D5) — מסמך נעלם מהתור, מוסיף ל-Export, יוצר audit
- ✅ Reject flow (D4) — מסמך נשאר בתור תחת "חסום" עם הסיבה
- ✅ Validation issues מוצגות בולט (BLOCKING ל-D3, אזהרת confidence ל-D4, duplicate ל-D5)
- ✅ Export Center מציג רק מסמכי `ready` עם סיכומי סכומים נכונים
- ✅ Toast הצלחה עם לינק לייצוא אחרי approve
- ✅ Confidence scores לכל שדה מוצגים בפאנל DocDetail

## עדכוני התקדמות

### 2026-05-16

**מה הושלם:**
- שלב A (Documents page): ✅ A1, A2, A3, A5, A6 — כל המסמכים מוצגים, סטטוסים נכונים, D3 בחסום אדום, D5 כפילות
- שלב B (Review Queue): ✅ B1, B2, B3, B6 (D1), B7 (D2), B8 (D4 reject), B9 (D5 approve), B10, B11 — כל ה-approve/reject עובדים
- שלב B חלקי: ❌ B4, B5 — נחסם ע"י BUG-01 (תוקן D3 דרך SQL כעקיפה זמנית)
- שלב D (Export Center): ✅ D1 — 3 הready מופיעים נכון, סיכומים נכונים, פילטר עובד

**מה עדיין פתוח:**
- D6-D7: ייצוא CSV / Priority (לא נבדק)
- שלב C (ApprovalQueue) — לא נבדק כי אין `approval_rule` מוגדר
- שלב E (חוצות) — RLS, drilldown, audit log
- BUG-01 / BUG-02 — patch מוכן ב-`docs/patches/BUG-01-show-null-fields.md`, ממתין להחלה

**מצב מסמכים נוכחי ב-DB:**
| Doc | review_status | exported_at | הערה |
|---|---|---|---|
| D1 | ready | 2026-05-16 14:01:53 | אושר → יוצא |
| D2 | ready | 2026-05-16 14:01:53 | אושר → יוצא |
| D3 | blocked | NULL | תוקן ב-SQL (allocation_number מולא), עדיין blocked |
| D4 | blocked | NULL | נדחה ב-UI עם סיבה |
| D5 | ready | 2026-05-16 14:01:53 | אושר למרות duplicate → יוצא |

**אותו `export_id`** לשלושת ה-ready: `d11e3855-c730-4a86-a1be-f2b9032ee492`.

**קובץ XLSX:** `~/Downloads/export_2026-05-16.xlsx` (7,251 bytes) — תקין, 12 עמודות עבריות + 3 שורות נתונים, כולל שדה "מספר הקצאה" מאוכלס ל-D2 וריק ל-D1/D5.

---

## חלק 5 — Definition of Done לספרינט

- [ ] כל שורות A,B,D עוברות (C אופציונלי)
- [ ] שלב E עובר במלואו
- [ ] באגים חמורים תוקנו ובוצע re-test
- [ ] `cleanup script` הופעל (אם רוצים לנקות את ה-mock)
- [ ] עודכן `PROJECT_LOG.md` עם סיכום ולקחים
- [ ] הוכנה רשימת preconditions להפעלת AI אמיתי בהמשך (איזה env vars, איזה קרדיטים, מה עוד חסר)
