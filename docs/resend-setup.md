# Resend SMTP Setup — Sprint 17

מטרה: כל מייל יציאה מ-Luca AI יישלח דרך **Resend** במקום `noreply@*.supabase.co`, עם הדומיין שלך, כדי ש:
- הנמען רואה שולח מקצועי וברור
- אחוז הגעה ל-Inbox עולה משמעותית
- יש לנו לוגים ואנליטיקס של מיילים

---

## שלב 1: יצירת חשבון Resend (5 דקות)

1. היכנס ל-https://resend.com/signup
2. הרשם עם המייל שלך (אפשר Google)
3. תאשר את המייל

**עלות:** Free plan = 3,000 מיילים/חודש, 100 ביום. מספיק לחודשי-עשרות לקוחות בקלות.

---

## שלב 2: אימות דומיין (10-30 דקות, תלוי ב-DNS)

1. בלוח Resend → **Domains** → **Add Domain**
2. הקלד את הדומיין שתרצי (לדוגמה: `luca-ai.com`, או subdomain כמו `mail.luca-ai.com`)
3. Resend ייתן לך 3 רשומות DNS להוסיף:
   - `MX` (לקבלת bounces)
   - `TXT` (SPF - מאשר ש-Resend מורשה לשלוח בשם הדומיין)
   - `TXT` (DKIM - חתימה דיגיטלית)
4. היכנסי לספק ה-DNS שלך (Cloudflare/Namecheap/GoDaddy וכו') והוסיפי את 3 הרשומות
5. חכי 5-30 דקות, ולחצי **Verify** ב-Resend
6. אמורה לראות ✅ ירוק על כל 3 הרשומות

**אם אין לך עדיין דומיין:** אפשר לקנות ב-Namecheap או Cloudflare Registrar (כ-$10/שנה לדומיין `.com`).

---

## שלב 3: יצירת API Key ב-Resend

1. ב-Resend → **API Keys** → **Create API Key**
2. שם: `Luca AI Production SMTP`
3. הרשאה: **Sending access** (כברירת מחדל)
4. **העתיקי את ה-key** — מופיע פעם אחת בלבד!

---

## שלב 4: הגדרת Resend כ-SMTP ב-Supabase (5 דקות)

1. ב-Supabase Dashboard → **Project Settings** → **Auth** → **SMTP Settings**
2. הפעילי "Enable Custom SMTP"
3. מלאי:
   | שדה | ערך |
   |---|---|
   | Sender email | `noreply@luca-ai.com` (או הדומיין שאימתת) |
   | Sender name | `Luca AI` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | ה-API Key שיצרת בשלב 3 |
   | Minimum interval | `60` שניות (להגן מספאם) |
4. **Save**

---

## שלב 5: התאמת תבניות המייל ב-Supabase

ב-**Auth** → **Email Templates** יש 4 תבניות:
- **Confirm signup** — כשמשתמש נרשם
- **Magic Link** — כניסה ללא סיסמה (← זה הכי חשוב להזמנות)
- **Invite user** — לא בשימוש (אנחנו שולחים magic link בעצמנו)
- **Reset password** — אחרי שיתחילו להגדיר סיסמאות (Task #5c)

### תבנית מומלצת ל-Magic Link

עורכת את הטמפלייט "Magic Link" עם זה (HTML בעברית עם branding בסיסי):

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>הזמנה ללוקה AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial; background: #f8fafc; margin: 0; padding: 40px 20px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
    <tr>
      <td style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 32px; text-align: center;">
        <h1 style="color: white; font-size: 24px; margin: 0;">Luca AI</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">מערכת חשבונאות חכמה</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">שלום! 👋</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          הוזמנת להצטרף ל-<strong>Luca AI</strong> — מערכת ניהול חשבוניות מבוססת בינה מלאכותית עבור משרד רואי-החשבון שלך.
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          לחיצה על הכפתור מטה תכניס אותך למערכת:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            כניסה ללוקה AI ←
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
          הלינק תקף ל-7 ימים. אם לא ביקשת את ההזמנה הזו, אפשר להתעלם בבטחה מהמייל.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background: #f1f5f9; padding: 16px 32px; text-align: center;">
        <p style="color: #64748b; font-size: 12px; margin: 0;">
          © 2026 Luca AI · <a href="https://luca-ai-app.vercel.app" style="color: #2563eb;">luca-ai-app.vercel.app</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Subject מומלץ:**
```
הזמנה ל-Luca AI — לחצי לכניסה
```

---

## שלב 6: בדיקת End-to-End

1. בלוח Supabase → **Auth** → **Users** → **Invite a user**
2. הכניסי כתובת מייל שלך
3. בדקי שמגיע מייל מ-`noreply@luca-ai.com` עם התבנית החדשה
4. בדקי שהלינק עובד (לוחץ → נכנס ל-Luca → נחתם)

**אם לא מגיע / מגיע ל-Spam:**
- ודאי שכל 3 רשומות ה-DNS מאומתות ב-Resend
- בדקי ב-Resend → **Logs** אם המייל יצא או נכשל
- ייתכן שצריך עוד 24 שעות עד שהדומיין יקבל reputation

---

## פתרון תקלות נפוצות

| תסמין | פתרון |
|---|---|
| מיילים מגיעים ל-Spam | להוסיף רשומת DMARC ב-DNS: `_dmarc.luca-ai.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@luca-ai.com"` |
| Supabase לא שולח בכלל | לבדוק Logs ב-Supabase Dashboard, לוודא ש-port הוא 465 (SSL) |
| Bounce rate גבוה | המיילים כתובים לא נכון - להוסיף email validation בקוד (תוכננה כבר ב-Sprint 10) |

---

## מה הלאה

אחרי שהשלמת את כל השלבים:
1. תני לי לדעת בצ'אט שה-SMTP מוגדר ועובד
2. אני אוסיף בדיקה ידנית להזמנה חדשה דרך Settings → Team
3. אם הכל זורם, נמשיך ל-Task #5c (מסך Setup Password)
