-- ============================================================================
-- Sprint 17 — #6 דיבאג מייל הזמנה שלא הגיע
-- ============================================================================
-- מצב: מור שלחה הזמנה לכתובת כ-end_client. שום מייל לא הגיע (גם לא ל-Spam).
-- מטרת ה-queries: לאתר באיזה שלב הצינור נשבר.
--
-- אופן הרצה: לפתוח Supabase Dashboard → SQL Editor → להדביק כל query בנפרד.
-- להחליף `<EMAIL>` באימייל הנמען (למשל 'mornis2@...').
-- ============================================================================

-- 1️⃣  האם נוצרה רשומה ב-workspace_invitations?
--     אם 0 שורות → ה-API נכשל לפני שהגיע ל-DB (בדוק Vercel logs).
--     אם יש שורה → ה-API עבר תקין; הבעיה לאחר insert (כנראה SMTP).
select id, email, role, status, invited_by, created_at, expires_at, accepted_at
from   public.workspace_invitations
where  email = lower('<EMAIL>')
order  by created_at desc
limit  5;


-- 2️⃣  האם client_contacts.invited_at עודכן?
--     אם invited_at NULL → ה-update ב-API נכשל (RLS? trigger?)
select id, full_name, email, invited_at, accepted_at, invited_user_id, client_id
from   public.client_contacts
where  lower(email) = lower('<EMAIL>')
order  by created_at desc;


-- 3️⃣  האם המשתמש כבר קיים ב-auth.users?
--     רלוונטי לבדוק אם מתקיים race condition עם generateLink.
select id, email, created_at, last_sign_in_at, email_confirmed_at
from   auth.users
where  lower(email) = lower('<EMAIL>')
limit  3;


-- 4️⃣  האם user_clients נוצר עבור המשתמש (אם הוא כן נכנס)?
select uc.user_id, uc.client_id, uc.granted_at, c.business_name
from   public.user_clients uc
join   public.clients c on c.id = uc.client_id
join   auth.users au   on au.id = uc.user_id
where  lower(au.email) = lower('<EMAIL>');


-- 5️⃣  לראות את כל ההזמנות האחרונות באופן כללי - אולי עוזר לזהות תבנית
select email, role, status, created_at
from   public.workspace_invitations
order  by created_at desc
limit  20;


-- 6️⃣  לאחר אבחון - אם אובחן שה-DB תקין אבל אין מייל:
--     הבעיה היא ב-SMTP של Supabase. לבדוק ב-:
--     - Supabase Dashboard → Project Settings → Auth → SMTP Settings
--     - לוודא: Host = smtp.gmail.com, Port = 587, Username = itay@luca-ai.io
--       (לא noreply@!), Password = App Password של 16 תווים
--     - לבדוק Logs → Auth Logs → סנן ל-"smtp" או "Authentication failed"
--
--     טיפ: ה-Sender Email יכול להיות noreply@luca-ai.io (alias),
--     אבל Username חייב להיות הכתובת האמיתית שיש לה App Password.


-- 7️⃣  אם רוצים לדחות הזמנה תקועה ולשלוח חדשה לבדיקה:
-- update public.workspace_invitations
-- set    status = 'cancelled'
-- where  email = lower('<EMAIL>') and status = 'pending';
