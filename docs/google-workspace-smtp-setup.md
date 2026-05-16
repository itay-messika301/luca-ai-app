# Google Workspace SMTP Setup — Sprint 17

מטרה: לחבר את Supabase Auth ל-Gmail SMTP של ה-Workspace שלך, כך שמיילי ההזמנה יישלחו מ-`noreply@luca-ai.com` (או דומיין אחר שלך) במקום מהדומיין של Supabase.

**למה זה הכי טוב במצב שלך:**
- ✅ כבר משולם (חלק מ-Workspace)
- ✅ Gmail = deliverability מצוין (כמעט לעולם לא ב-Spam)
- ✅ 2,000 מיילים/יום - מעל מה שתצטרכי
- ✅ הקמה ב-~15 דקות (לא צריך לאמת DNS - Google כבר עשתה)

---

## האפשרות המומלצת: App Password (הכי פשוט)

### שלב 1: יצירת חשבון "noreply" ב-Workspace (5 דקות)

1. היכנסי ל-https://admin.google.com (Google Admin Console)
2. **Directory → Users → Add new user**
3. צרי משתמש:
   - First name: `Luca AI`
   - Last name: `Notifications`
   - Primary email: `noreply@<your-domain>` (למשל `noreply@luca-ai.com`)
4. תני סיסמה חזקה — שמרי אותה לרגע
5. שמירה

> **הערה:** אם יש לך כבר חשבון שאת רוצה לשלוח דרכו, אפשר להשתמש בו במקום - דלגי לשלב 2.

### שלב 2: הפעלת 2-Step Verification בחשבון החדש

App Password אפשרי רק עם 2FA פעיל.

1. צאי מהאדמין וכנסי כ-`noreply@<your-domain>` (אם זה משתמש חדש, יבקש החלפת סיסמה ראשונה)
2. https://myaccount.google.com → **Security → 2-Step Verification**
3. הפעילי 2FA (הכי קל - באמצעות מספר טלפון שלך)

### שלב 3: יצירת App Password

1. https://myaccount.google.com → **Security → App Passwords** (יופיע רק אחרי הפעלת 2FA)
2. App name: `Luca AI Supabase SMTP`
3. **Generate** → תקבלי **16 תווים** (4 בלוקים של 4)
4. **העתיקי את הסיסמה** — מופיעה פעם אחת בלבד!

### שלב 4: הגדרת Supabase SMTP (5 דקות)

1. Supabase Dashboard → **Project Settings → Auth → SMTP Settings**
2. הפעילי **"Enable Custom SMTP"**
3. מלאי:

| שדה | ערך |
|---|---|
| Sender email | `noreply@<your-domain>` |
| Sender name | `Luca AI` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `noreply@<your-domain>` (אותו כמו Sender) |
| Password | ה-App Password שיצרת בשלב 3 (16 תווים) |
| Minimum interval | `60` שניות |

4. **Save**

### שלב 5: בדיקה

1. Supabase → **Auth → Users → Invite a user**
2. הזיני את המייל הפרטי שלך
3. תוך שניות אמורה לקבל מייל מ-`noreply@<your-domain>`
4. בדקי שהלינק עובד

**אם לא מגיע:**
- בדקי ב-Supabase **Logs** האם היה SMTP error
- ודאי שה-App Password הועתק נכון (בלי רווחים)
- ודאי שב-Workspace החשבון פעיל ולא locked

---

## אפשרות מתקדמת: SMTP Relay (לנפח גבוה)

אם בעתיד תרצי לשלוח מעל 2,000 מיילים/יום, או רוצה להגדיר IPs מותרים בלי password:

1. Google Admin → **Apps → Google Workspace → Gmail → Routing → SMTP relay service**
2. הוסיפי allowed senders (IP של Supabase)
3. השתמשי ב-host `smtp-relay.gmail.com` במקום `smtp.gmail.com`

לרוב המקרים, App Password מספיק בהחלט.

---

## עיצוב תבנית המייל ב-Supabase

אחרי שה-SMTP עובד, יש לערוך את ה-HTML של מייל ההזמנה:

1. Supabase Dashboard → **Auth → Email Templates → Magic Link**
2. החליפי את ה-HTML עם:

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

## טיפים לבעיות נפוצות

| תסמין | פתרון |
|---|---|
| `Authentication failed` ב-Supabase logs | App Password לא נכון. ייצרי חדש ב-myaccount.google.com |
| מיילים יוצאים אבל מגיעים ל-Spam | להוסיף `noreply@` כ-contact אצל הנמען או להוסיף DMARC ב-DNS (Google כבר טיפלה ב-SPF/DKIM אוטומטית) |
| `Daily user sending quota exceeded` | חרגת מ-2,000 ביום. תחכי 24 שעות או תשדרגי ל-SMTP Relay |
| המייל יוצא מ-`noreply@luca-ai.com` אבל מציג שמך | זה תקין - Google מציגה את ה-`displayName` של הסולח. אפשר לעדכן ב-Admin Console |

---

## הערה: אם תצטרכי לשנות

הכל reversible:
- אם תרצי לעבור ל-Resend אחר כך, יש מדריך ב-`docs/resend-setup.md`
- אם תרצי לחזור לברירת מחדל של Supabase, פשוט תבטלי "Enable Custom SMTP" בהגדרות
