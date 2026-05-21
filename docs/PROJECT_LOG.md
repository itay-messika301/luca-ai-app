# Luca AI — Project Log

> **מסמך זיכרון חוצה-צ'אטים.** כל סשן Claude חדש מתחיל מאפס; קובץ זה הוא ה-source of truth שמאפשר להמשיך את הפרויקט מכל נקודה.
>
> **הנחיה ל-Claude:** לפני שמתחילים לעבוד על הפרויקט, קרא את הקובץ הזה במלואו, ואת הספרינט הפעיל ב-`docs/sprints/`.

---

## 🚨 איפה אנחנו עומדים עכשיו (2026-05-21, סוף סשן)

**ספרינט פעיל:** 17. ראי `docs/sprints/SPRINT_17_PLAN.md` לפרטים מלאים.

**הושלם בסשן זה (2026-05-21):**
- ✅ **#7 — הפרדת Settings**: לשונית "צוות" פוצלה ל-2 לשוניות נפרדות:
  - **"צוות המשרד"** — רק workspace_owner/accountant/reviewer
  - **"לקוחות מחוברים"** — רק end_clients עם רשימת העסקים שהם מקושרים אליהם
  - Banner מסביר שהזמנת לקוח-קצה היא דרך ClientDetail → אנשי קשר
  - הוסרה אופציית `end_client` מ-`InviteModal` ומ-MemberRow role-select
- ✅ **#8 — סטטוס end_client אוטומטי**: ב-`AuthContext.fetchProfile`, בכל כניסה של end_client, נקרא `claim_end_client_contacts()` RPC כדי לעדכן את `client_contacts.accepted_at` ולמלא את `user_clients`. זה הופך את הסטטוס מ"הזמנה נשלחה" ל"מחובר" אוטומטית גם אם המשתמש דילג על `/accept-invitation`.
- ✅ **#6 — תשתית דיבאג מייל**:
  - יצרתי `docs/debug/sprint17-email-debug.sql` עם 7 queries לאבחון שלב-שלב
  - שיפרתי את `api/invite-contact.js`: לוגים מפורטים + מחזיר `debug_action_link` ופרטי שגיאה מלאים (status/code/name)

**הושלם בסשן קודם (2026-05-16):**
- ✅ #2 — צבעים צהובים → amber (13 קבצים)
- ✅ #5a-#5e — תשתית הזמנות מלאה (migrations 008+009, SetupPassword, ClientContacts, invite-contact API)
- ✅ Hotfix 010 (RLS recursion) רץ בפרוד

**פתוחים — דורש פעולה מצד מור:**
- 🐛 **#6 — לאבחן SMTP**: להריץ את `docs/debug/sprint17-email-debug.sql` ב-Supabase SQL Editor (להחליף `<EMAIL>`). אם 1️⃣+2️⃣ מחזירים שורות → ה-DB תקין והבעיה ב-SMTP של Supabase. לבדוק Auth Logs + Settings → Auth → SMTP (Username חייב להיות `itay@luca-ai.io` ולא `noreply@`, App Password 16 תווים).
- 🆕 **#9 — שיפור ClientDashboard**: ממתין לדרישות מדויקות ממור.

**נשארו ל-Sprint 17:**
- #3 — Role tests (workspace שני + 4 משתמשים)
- #4 — Dashboard drilldown
- #1 — Date filters (chips + custom range)

**מה דרוש ממור לפני המשך:**
- לעשות `git push` ולוודא ש-Vercel auto-deploy הצליח
- להריץ את ה-queries ב-`docs/debug/sprint17-email-debug.sql` ולשלוח לי תוצאות
- לאשר את ה-UI החדש של Settings (לשוניות "צוות המשרד" + "לקוחות מחוברים")
- לשלוח דרישות מדויקות ל-#9 (שיפור ClientDashboard) כשמוכנה

## 📋 איך להמשיך מצ'אט חדש

פתחי Claude Code חדש בנתיב `/Users/mornissim/Desktop/luca-ai-app` ושלחי:

```
ממשיכים את פרויקט Luca AI. קרא את docs/PROJECT_LOG.md, את docs/sprints/SPRINT_17_PLAN.md,
ואת המקטע "איפה אנחנו עומדים עכשיו" בלוג. תספר לי מה הסטטוס ואיך אתה מציע להמשיך.
```

הצ'אט החדש יקבל את כל ההקשר ויידע איפה נעצרנו.

---

## פרטי הפרויקט

| שדה | ערך |
|---|---|
| שם | Luca AI |
| תיאור | מערכת AI להפקת נתונים מחשבוניות/קבלות עבור רואי-חשבון ישראלים |
| Repo | https://github.com/itay-messika301/luca-ai-app |
| Production | https://luca-ai-app.vercel.app |
| נתיב מקומי | `/Users/mornissim/Desktop/luca-ai-app` |
| Stack | React + Vite + TailwindCSS, Supabase (Postgres+Auth+Storage), Vercel Functions, Claude Vision API |

## תפקידים במערכת

`workspace_owner` · `accountant` · `reviewer` · `end_client` · `pending`

## מבנה מסכים מרכזי — לשונית "תהליך מסמך"

`ProcessTabs.jsx` מאחד 3 שלבים:
1. **`/documents`** — רשימת כל המסמכים + העלאה + עיבוד מחדש
2. **`/review`** — תור אישורים (`needs_review` + `blocked`)
3. **`/export`** — ייצוא מסמכים שאושרו (`review_status = ready`)

## שלבי מסמך (State Machine)

```
upload → status: 'pending'
   ↓ (call POST /api/process-document)
status: 'processing'
   ↓ (Claude Vision extraction)
status: 'processed' + review_status: 'needs_review' | 'blocked'
   ↓ (Approve in ReviewQueue)
review_status: 'ready' (+ approval_status: 'approved')
   ↓ (Optional: ApprovalQueue multi-stage sign-off)
   ↓ (Export in ExportCenter)
exported_at: timestamp + export_id
```

## חוקי validation ישראליים

- **מע"מ:** מצופה 18% (סטייה > 0.5% → `needs_review`)
- **מספר הקצאה (blocking):** חובה כש-`total_amount > ₪5,000`
- **Confidence:** overall < 0.6 או amounts < 0.7 → `needs_review`
- **Duplicate:** vendor+invoice_number זהים → `needs_review` + `is_duplicate=true`

## היסטוריית ספרינטים

| Sprint | תאריך | תיאור |
|---|---|---|
| 1-12 | מוקדם | תשתית, הזמנות, ייצוא, אישורים, magic-link, מיפוי CSV, UX polish |
| 13-15 | אחרון לפני 16 | RLS audit, drilldown links, unified Process tab, deep-link sharing |
| **16** | **פעיל** | **QA ידני קצה-לקצה של תהליך המסמך (Mock AI)** — ראה `docs/sprints/SPRINT_16_MANUAL_QA.md` |

## קבצים קריטיים

| תפקיד | קובץ |
|---|---|
| לשוניות תהליך | `src/components/layout/ProcessTabs.jsx` |
| Documents page | `src/pages/Documents.jsx` |
| Review queue | `src/pages/ReviewQueue.jsx` |
| Approval queue | `src/pages/ApprovalQueue.jsx` |
| Export center | `src/pages/ExportCenter.jsx` |
| AI extraction API | `api/process-document.js` |
| סכמה ראשית | `supabase/migrations/001_sprint1_schema.sql` |
| Approvals schema | `supabase/migrations/004_sprint6_approvals.sql` |

## כללי עבודה (לזכור בין צ'אטים)

1. **תמיד עדכן את הקובץ הזה** בסוף כל סשן עם מה שנעשה ומה שנשאר.
2. **ספרינט פעיל** = הספרינט האחרון תחת `docs/sprints/`.
3. **לא לערוך** קוד קיים שמסומן ע"י המשתמש כ"לא לגעת" (כרגע: שום דבר).
4. **דגלים פתוחים / TODOs** רשומים בסוף הספרינט הפעיל.

---

## עדכוני סשן

### 2026-05-16 — Sprint 16 פתיחה
- נוצר קובץ זה (`PROJECT_LOG.md`) כזיכרון מתמשך
- נוצר `docs/sprints/SPRINT_16_MANUAL_QA.md` עם תכנית עבודה מלאה
- נוצרו 5 תרחישי מסמך-בדיקה + סקריפט seed
- נוצר לקוח-בדיקה ייעודי `__TEST__ Sprint16 QA` תחת ה-workspace היחיד "גושים" כדי לבדד נתוני QA מנתוני הפרודקשן
- workspace_id קבוע: `8a5a60ad-0bd2-4426-a097-834b43aa8696`

### 2026-05-16 — Sprint 16 הרצה ראשונה (E2E QA דרך הדפדפן)
- ✅ Seed: 5 מסמכים נכנסו ל-`public.documents` תחת לקוח-הבדיקה
- ✅ אומתו ב-UI: כולם מופיעים נכון ב-`/documents`, `/review`
- ✅ Approve: D1, D2, D5 → `ready` דרך ה-UI
- ✅ Reject: D4 → `blocked` עם סיבה דרך ה-UI
- ⚠ D3 לא ניתן לתיקון דרך ה-UI — **BUG-01** קריטי: שדות NULL מוסתרים. תיקון זמני דרך SQL.
- ✅ Export Center: 3 ready (D1+D2+D5) מופיעים נכון, סיכום ₪14,160 מדויק
- 🐛 נמצאו 5 באגים — מפורטים בחלק 4 של `docs/sprints/SPRINT_16_MANUAL_QA.md`

### באגים מסוכמים — לעדיפות תיקון
1. **BUG-01 (קריטי):** שדות NULL מוסתרים בעריכת ReviewQueue → לא ניתן לפתור מסמך חסום מהממשק
2. **BUG-02 (קריטי):** אותה בעיה ב-DocDetailPanel של `/documents`
3. **BUG-03 (בינוני):** Sidebar badge לא מתעדכן בזמן אמת
4. **BUG-04 (קוסמטי):** "X / Y" מוצג הפוך ב-RTL
5. **BUG-05 (בינוני):** קליק על tab "ביקורת ואישורים" לפעמים מפנה ל-/export

### מצב הספרינט בסוף הסשן
- **הושלם:** A1-A8, B1-B3, B6-B11, D1-D5 (ייצוא XLSX מלא ל-3 מסמכים)
- **חסום ע"י באג:** B4-B5 (תיקון D3 דרך UI — הוכן patch ב-`docs/patches/BUG-01-show-null-fields.md`)
- **לא הורץ עדיין:** D6-D7 (CSV / Priority), שלב C (Approvals — לא הוגדר rule), שלב E (RLS, drilldown, audit log)
- **לא הופעל cleanup script** — נתוני הבדיקה עדיין ב-DB

### Milestone: End-to-End Export הוכח (2026-05-16 14:01:53 UTC)
- 3 מסמכים יוצאו ל-XLSX: `~/Downloads/export_2026-05-16.xlsx` (7,251 bytes)
- אותו `export_id = d11e3855-c730-4a86-a1be-f2b9032ee492` לשלושת המסמכים (אטומיות אצווה)
- `exported_at` זהה לכולם (transactional integrity)
- XLSX תקין עם 12 עמודות עבריות נכונות + 3 שורות נתונים

### הוראות להמשך מהצ'אט הבא
1. קרא קודם את הקובץ הזה במלואו
2. קרא את `docs/sprints/SPRINT_17_PLAN.md` — הספרינט הפעיל
3. אם נעצרנו באמצע משימה ספציפית בספרינט 17, ה-todo list מציין איפה
4. נתוני QA של Sprint 16 עדיין ב-DB (לקוח `__TEST__ Sprint16 QA`) — לא נמחקו

### 2026-05-16 — Sprint 17 פתיחה
- **5 דרישות** מאת מור: צבעים צהובים, פילטר תאריך, role testing, drilldown, מנגנון הזמנות
- **סדר תיעדוף סופי:** 2 → 5 → 3 → 4 → 1
- **החלטות אדריכליות סוכמו** ב-`docs/sprints/SPRINT_17_PLAN.md` (9 החלטות A-I)
- **תשתית חדשה נדרשת:** טבלאות `client_contacts` + `user_clients`, מסך SetupPassword, Google Workspace SMTP (במקום Resend - מור כבר משלמת על Workspace)
- **התחלת ביצוע:** משימה #2 (צבעים) — quick win ראשון

### Sprint 17 — התקדמות בסשן (2026-05-16 המשך)
- ✅ **Task #2** הושלם: 13 קבצים, 31+ מופעי `yellow-*` הוחלפו ב-`amber-*` + הסרת שקיפויות פגומות
- ✅ **Task #5a** הושלם: migration 008 רץ בהצלחה ב-prod - 2 טבלאות חדשות + 7 RLS policies
- ✅ **Task #5b** הוחלף ל-Google Workspace SMTP — מדריך מלא ב-`docs/google-workspace-smtp-setup.md`
- ✅ **Task #5c** הושלם: `src/pages/SetupPassword.jsx` חדש + 2 routes ב-App.jsx + ניווט מ-AcceptInvitation
- ✅ **Task #5d** הושלם: `src/components/clients/ClientContacts.jsx` חדש (CRUD + invite button) משולב ב-ClientDetail
- ✅ **Task #5e** הושלם: `api/invite-contact.js` חדש + migration 009 (claim_end_client_contacts RPC) רץ בprod + AcceptInvitation קורא ל-RPC ל-end_client
- ⏳ **Task #3, #4, #1** נשארו לסשן הבא

### Sprint 17 — סשן 2026-05-21
**שורש בעיית #8 שאותר:** ב-`AuthContext.fetchProfile`, כש-end_client מתחבר עם workspace_id קיים, ה-RPC `claim_end_client_contacts()` לא נקרא — לכן `client_contacts.accepted_at` נשאר NULL ו-UI מציג "הזמנה נשלחה" לנצח.

**שינויי קוד:**
| קובץ | שינוי |
|---|---|
| `src/lib/AuthContext.jsx` | הוספת קריאה ל-`claim_end_client_contacts` RPC בכל login של end_client (גם אחרי שיש workspace_id) |
| `src/pages/Settings.jsx` | פיצול לשונית "צוות" ל-2 לשוניות: "צוות המשרד" + "לקוחות מחוברים"; הסרת `end_client` מ-`InviteModal` ומ-MemberRow role select; קומפוננטה חדשה `EndClientsTab` שמציגה את העסקים המקושרים לכל end_client |
| `api/invite-contact.js` | לוגים מפורטים + החזרת `debug_action_link` ופרטי שגיאה מלאים |
| `docs/debug/sprint17-email-debug.sql` | חדש - 7 queries אבחון |

### מה דרוש מהמשתמש לפני שאפשר לבדוק E2E
1. **deploy לוורצל** של הקוד החדש (`git push` → Vercel auto-deploy)
2. **הקמת Google Workspace SMTP** לפי `docs/google-workspace-smtp-setup.md`
3. **בדיקה ידנית של flow מלא:**
   - Settings → Team → הזמן עובד → אישור → SetupPassword → Dashboard
   - ClientDetail → אנשי קשר → הוסף + הזמן → end_client רואה ClientDashboard של אותו עסק

### קבצים חדשים שנוצרו ב-Sprint 17 (עד עכשיו)
| קובץ | תיאור |
|---|---|
| `docs/sprints/SPRINT_17_PLAN.md` | תכנית הספרינט |
| `docs/google-workspace-smtp-setup.md` | מדריך הקמת SMTP |
| `docs/resend-setup.md` | מדריך fallback (Resend) |
| `supabase/migrations/008_sprint17_client_contacts.sql` | טבלאות + RLS |
| `supabase/migrations/009_sprint17_claim_contacts_function.sql` | RPC function |
| `src/pages/SetupPassword.jsx` | מסך הגדרת סיסמה |
| `src/components/clients/ClientContacts.jsx` | UI ניהול אנשי קשר |
| `api/invite-contact.js` | API להזמנת איש קשר |

### קבצים שעודכנו ב-Sprint 17
- 13 קבצי JSX (yellow → amber)
- `src/App.jsx` (import + 2 routes)
- `src/pages/AcceptInvitation.jsx` (navigate to /setup-password + RPC call)

### 🚨 HOTFIX אחרי deploy ראשון (2026-05-16)
- **בעיה:** מיד אחרי שעלה לפרודקשן `/clients` הציג 0 לקוחות (היה 107). queries על clients/documents החזירו HTTP 500
- **שורש:** מיגרציה 008 יצרה RLS recursion: `clients` policy → `user_clients` → policy שמצביעה ל-`clients` → infinite loop
- **תיקון:** מיגרציה `010_sprint17_fix_rls_recursion.sql` - SECURITY DEFINER function `has_client_access(uuid)` שעוקפת RLS, מחליפה את 2 ה-v2 policies. **הופעלה בפרוד מיד.**
- **בדיקה:** /clients חזר להציג 107 לקוחות תקין
- **לקח:** בעתיד, RLS policies שמצביעות לטבלאות עם RLS משלהן → להשתמש ב-SECURITY DEFINER helpers מההתחלה
- `src/pages/ClientDetail.jsx` (import + ClientContacts component)
