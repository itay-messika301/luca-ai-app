# Sprint 17 — Plan

**סטטוס:** פעיל · **התחלה:** 2026-05-16 · **בעלים:** מור

## מטרת הספרינט

5 דרישות מאת מור — מסומנות #1 עד #5 בסעיף "תיעדוף". הצירוף שלהן מעלה את המוצר משלב MVP-פנימי לשלב בו אפשר להזמין משתמשי-קצה אמיתיים ולהפעיל את המערכת בריבוי-משרדים בבטחה.

---

## תיעדוף סופי (אישור מור 2026-05-16)

| סדר | משימה | תיוג | למה כך |
|---|---|---|---|
| **1** | **#2** — תיקון צבעים צהובים | 🔴 Quick win | שיפור קריאות רוחבי, עבודה קטנה |
| **2** | **#5** — מנגנון הזמנות מלא | 🔴 תנאי הכרחי | חייב לפני שאפשר לבדוק אמיתית #3 |
| **3** | **#3** — בדיקות role-based + multi-tenancy | 🔴 קריטי לאבטחה | סיכון דליפת RLS חייב להתאמת |
| **4** | **#4** — drilldown מהדאשבורד | 🟠 בינוני | UX משמעותי, יחסית עצמאי |
| **5** | **#1** — פילטר חודש/טווח חודשים | 🟠 בינוני | פיצ'ר עצמאי, אפשר בסוף |

---

## החלטות אדריכליות (אישור מור 2026-05-16)

| תחום | החלטה |
|---|---|
| **Auth** | Magic link + סיסמה בכניסה ראשונה |
| **מייל ההזמנה** | Supabase Auth + Custom SMTP דרך **Google Workspace** (יש למור Workspace קיים, smtp.gmail.com + App Password). מדריך מלא ב-`docs/google-workspace-smtp-setup.md`. Resend נשאר כ-fallback ב-`docs/resend-setup.md`. |
| **Flow סיסמה** | מסך Setup Password **חובה** מיד אחרי magic link, עם הקשר ויזואלי (משרד + תפקיד) |
| **End-client linkage** | יצירת "אנשי קשר" (`client_contacts`) בתוך לקוח-עסק קיים → הזמנה בוחרת מהרשימה |
| **Multi-client** | משתמש יחיד יכול לנהל **N עסקים** (טבלת קישור `user_clients`) |
| **תוקף הזמנה** | 7 ימים (כבר קיים) |
| **פעולות הזמנה** | Resend + Revoke (כבר קיים, יישאר) |
| **סביבת בדיקות #3** | **workspace שני** ייעודי (`__QA_OFFICE_2__`) + 4 משתמשי-בדיקה |
| **פילטר תאריך** | Preset chips (החודש / חודש קודם / YTD / הכל) + טווח מותאם נפתח |

---

## משימה 1: תיקון צבעים צהובים (#2)

### היקף
13 קבצי קוד מכילים `text-yellow-*`/`bg-yellow-*` שמקטינים קריאות.

### גישה
1. להגדיר tokens חדשים בקובץ עזר אם נדרש (או להישאר עם classNames של Tailwind)
2. להחליף `yellow-400/300/500` ב-`amber-600` (כהה יותר, קריא) או ב-`slate-600` ל-status "needs_review"
3. אזהרות חשובות יישארו עם רקע אבל טקסט עצמו כהה - `bg-amber-50 text-amber-900 border-amber-200`

### קבצים שיש לערוך
| קובץ | סוג שינוי |
|---|---|
| `src/pages/ClientDocuments.jsx` | status badge |
| `src/pages/Settings.jsx` | audit log color |
| `src/pages/ExportCenter.jsx` | status color |
| `src/pages/ReviewQueue.jsx` | status + issue alerts (4 occurrences) |
| `src/pages/ApprovalQueue.jsx` | status + validation (3 occurrences) |
| `src/pages/ClientDashboard.jsx` | TBD בקריאה |
| `src/pages/ClientDetail.jsx` | TBD |
| `src/pages/ClientUpload.jsx` | TBD |
| `src/pages/Dashboard.jsx` | TBD |
| `src/pages/Documents.jsx` | TBD |
| `src/pages/AdminPanel.jsx` | TBD |
| `src/components/admin/ClientAssignment.jsx` | TBD |
| `src/components/clients/CSVImporter.jsx` | TBD |

### DoD
- [ ] רוץ `grep -r 'text-yellow\|bg-yellow' src/` ו-0 תוצאות נשארות
- [ ] בדיקה ויזואלית: needs_review, warnings, validation issues - כולם קריאים על רקע בהיר ועל רקע כהה (dark mode)

---

## משימה 2: מנגנון הזמנות מלא (#5)

### היקף שינויים נדרשים

#### 2.1 — DB Schema (migration חדש)

**טבלה חדשה `client_contacts`** (אנשי-קשר בתוך עסק)
```sql
create table public.client_contacts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  full_name       text not null,
  email           text,                -- nullable עד שמזמינים
  phone           text,
  position        text,                -- e.g., 'owner', 'cfo', 'employee'
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_at      timestamptz,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.client_contacts(client_id);
create index on public.client_contacts(invited_user_id);
```

**טבלה חדשה `user_clients`** (משתמש N עסקים)
```sql
create table public.user_clients (
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  contact_id  uuid references public.client_contacts(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index on public.user_clients(client_id);
```

**RLS למשתמשי end_client** — לעדכן ב-clients/documents כדי שיראו רק עסקים תחת `user_clients`.

#### 2.2 — Resend Custom SMTP

- מור תייצר חשבון ב-Resend (חינם ל-3K הודעות/חודש)
- מור תאמת דומיין (`luca-ai.com` או אחר) ב-Resend
- אני אעדכן את `supabase/config` או הוראות Dashboard לקונפיגורציה
- אעדכן את התבנית של Supabase Auth כך שתכיל branding של Luca AI

#### 2.3 — Setup Password Screen

**קובץ חדש:** `src/pages/SetupPassword.jsx`
- מוצג אחרי קליק על magic link, אחרי אישור הזמנה
- מציג: לוגו Luca + "ברוכים הבאים, [שם]!" + "המשרד שלך: [workspace]" + "תפקידך: [role]"
- שדה סיסמה (חובה, מינ' 8 תווים) + אישור סיסמה + checkbox תקנון
- כפתור "צור חשבון והמשך" שמעדכן את `auth.users.password` ומנווט ל-`/dashboard`

**Route חדש:** `/setup-password?token=<inv-token>` ב-`App.jsx`

**שינוי ב-`AcceptInvitation.jsx`:** אחרי אישור ההזמנה, במקום ניווט ל-/dashboard, ניווט ל-/setup-password (רק אם אין סיסמה עדיין).

#### 2.4 — Contact Management UI ב-Client Detail

**קובץ קיים:** `src/pages/ClientDetail.jsx` — להוסיף סקציה חדשה "אנשי קשר"
- טבלה עם: שם, אימייל, טלפון, תפקיד, סטטוס הזמנה
- כפתור "הוסף איש קשר" → modal עם שדות
- ליד כל איש קשר: כפתור "הזמן ללוקה" (אם email מולא ואין user מקושר)
- כפתור "ביטול הזמנה" / "שלח שוב" אם status pending

#### 2.5 — End-client Invite Flow (חדש)

**API endpoint חדש:** `api/invite-contact.js` — מקבל `contact_id`, יוצר רשומה ב-`workspace_invitations` עם role=`end_client`, וקושר ל-`client_contacts.invited_user_id` כשמתקבל.

**שינוי ב-`AcceptInvitation.jsx`:** אם זה end_client invite, לקשר את ה-`user_id` ב-`user_clients` (להוסיף לכל ה-clients שהוא איש-קשר שלהם).

#### 2.6 — Account screen בהגדרות

**קובץ קיים:** `src/pages/Settings.jsx` — להוסיף טאב "החשבון שלי":
- שינוי סיסמה
- שינוי שם
- (אופציונלי) שינוי avatar

### DoD משימה 2
- [ ] מור יכולה להזמין רואה-חשבון לעבודה במשרד דרך Settings → Team
- [ ] רואה-חשבון מקבל מייל מ-`noreply@<domain>` עם נוסח Luca, לוחץ, מגדיר סיסמה, נכנס
- [ ] מור יכולה ליצור איש-קשר תחת לקוח קיים ב-ClientDetail
- [ ] איש-קשר מקבל הזמנה אישית, נכנס, רואה דאשבורד end_client של אותו עסק
- [ ] אם איש-קשר זהה נמצא ב-2 לקוחות, אחרי כניסה רואה את שניהם

---

## משימה 3: בדיקות Role-based + Multi-tenancy (#3)

### תשתית
1. ליצור workspace שני: `__QA_OFFICE_2__`
2. ליצור 4 משתמשי בדיקה (כולם דרך מנגנון ההזמנות החדש):
   - `qa-owner-2@luca-ai.com` → workspace_owner של office-2
   - `qa-accountant-2@luca-ai.com` → accountant של office-2
   - `qa-reviewer-2@luca-ai.com` → reviewer של office-2
   - `qa-client-2@luca-ai.com` → end_client של עסק תחת office-2

3. ליצור 3-5 מסמכי mock תחת office-2

### בדיקות (manual checklist)
| # | בדיקה | צפוי |
|---|---|---|
| R1 | qa-owner-2 רואה רק את 3-5 המסמכים של office-2, לא את 5 של Sprint 16 | ✅ |
| R2 | qa-owner-1 (מור) לא רואה כלום של office-2 | ✅ |
| R3 | qa-accountant-2 רואה הכל אבל לא Settings | ✅ |
| R4 | qa-reviewer-2 רואה Review queue, לא Export | redirect |
| R5 | qa-client-2 רואה רק את הדאשבורד הקטן שלו | redirect |
| R6 | qa-client-2 לא יכול לפתוח URL ישיר של /documents | redirect |
| R7 | RLS בדיקת SQL: `set role authenticated; set request.jwt.claim.sub = '<office-2 user>';` ובדיקת SELECT על documents של office-1 | 0 rows |

### DoD
- [ ] כל 7 הבדיקות עוברות
- [ ] חוסר מודעות לא-משוקלת ל-cross-tenant data leak

---

## משימה 4: Drilldown מהדאשבורד (#4)

### היקף
לעבור על Dashboard.jsx ולמפות כל widget ל-route רלוונטי.

### הצעת מיפוי
| Widget | קליק → ניווט |
|---|---|
| "מסמכים בתור" | `/review` |
| "מסמכים מוכנים לייצוא" | `/export` |
| "סה"כ לקוחות" | `/clients` |
| "סה"כ מסמכים" | `/documents` |
| "מסמכים החודש" | `/documents?from=<month-start>&to=<month-end>` (תלוי במשימה 5) |
| "לקוח X" (לוח לקוחות) | `/clients/<id>` |

### DoD
- [ ] כל widget בדאשבורד clickable
- [ ] hover state ברור
- [ ] ניווט מדויק עם פרמטרים נכונים

---

## משימה 5: פילטר תאריך (#1)

### היקף
3 מסכים: `/dashboard`, `/clients/:id`, `/documents`

### רכיב משותף חדש
**קובץ חדש:** `src/components/DateRangeFilter.jsx`
- chips: "החודש", "חודש קודם", "3 חודשים", "YTD", "הכל"
- כפתור "טווח מותאם" → פותח picker (input type=date × 2)
- שולח דרך props את `{from: Date, to: Date}` לקומפוננטה הוורית

### שילוב
- ב-`Dashboard.jsx`, `Documents.jsx`, `ClientDetail.jsx` — לעטוף את ה-query של supabase ב-`.gte('created_at', from).lte('created_at', to)`
- ה-default state: "החודש" (תחילת חודש נוכחי עד היום)
- שמירת state ב-URL params כדי שהפילטר יישמר בניווט

### DoD
- [ ] פילטר עובד ב-3 המסכים
- [ ] בחירת chip מעדכנת מספרים תוך מילישנייה
- [ ] טווח מותאם פותח picker ועובד
- [ ] רענון דף שומר את הפילטר (URL persistence)

---

## תלויות ולוחות זמנים פנימיים

```
Task 2 (yellow) ──┐
                  │
Task 5 (invites) ─┤
  ├─ DB schema ───┤
  ├─ Resend SMTP  │  → blocks Task 3
  ├─ SetupPwd     │
  ├─ Contacts UI ─┤
  └─ Invite flow ─┘
                  │
Task 3 (RBAC) ────┤
                  │
Task 4 (drill) ───┤ (independent)
                  │
Task 1 (filters) ─┘ (independent)
```

**מסלול קריטי:** Task 2 → Task 5 (DB + Resend + SetupPwd + Contacts + Invite) → Task 3 → סיום.
**במקביל:** Task 4 + Task 1 (מי שיש זמן).

---

## Definition of Done לכל הספרינט

- [ ] כל 5 המשימות פעילות בפרודקשן (vercel deploy עובר)
- [ ] חוסר באגים חמורים מ-Sprint 16 (BUG-01 + BUG-02) - **מומלץ לתקן אגב Task 2**
- [ ] עדכון `PROJECT_LOG.md` עם סיכום הספרינט
- [ ] migration files מוכנים ל-Supabase (008_sprint17_*.sql)
- [ ] הוראות הקמת Resend בקובץ `docs/resend-setup.md`
- [ ] בדיקות R1-R7 עוברות (multi-tenancy)

---

## פתוחים / שאלות לדיון בהמשך

- **WhatsApp/SMS להזמנות לקוח-קצה** — נדחה ל-Sprint 18+
- **תזכורות לקראת תפוגת הזמנה** — נדחה
- **Bulk invite via CSV** — נדחה
- **ApprovalQueue testing (שלב C מ-Sprint 16)** — נדחה אלא אם מתעדפת
