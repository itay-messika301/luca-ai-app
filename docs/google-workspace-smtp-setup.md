# Google Workspace SMTP Setup — Sprint 17

מטרה: לחבר את Supabase Auth ל-Gmail SMTP של ה-Workspace שלך, כך שמיילי ההזמנה יישלחו מדומיין משלך במקום מהדומיין של Supabase.

**למה זה הכי טוב במצב שלך:**
- ✅ כבר משולם (חלק מ-Workspace)
- ✅ Gmail = deliverability מצוין (כמעט לעולם לא ב-Spam)
- ✅ 2,000 מיילים/יום - מעל מה שתצטרכי
- ✅ הקמה ב-~10 דקות (לא צריך לאמת DNS - Google כבר עשתה)

---

## 🎯 3 אופציות — בחרי אחת

| אופציה | סדר עדיפויות | משך זמן | משתמש חדש? | סיכום |
|---|---|---|---|---|
| **A — שימוש במשתמש קיים** | 🥇 הכי פשוט | ~5 דק' | ❌ לא | שולחת מהמייל שלך הקיים (`mor@<domain>`) |
| **B — Alias על משתמש קיים** | 🥈 מקצועי + פשוט | ~10 דק' | ❌ לא | מוסיפה alias `noreply@<domain>` למשתמש שלך |
| **C — Service-relay (SMTP Relay)** | 🥉 לנפח גבוה | ~15 דק' | ❌ לא | שולחת מכל כתובת בדומיין, 10,000/יום |

⛔ **לא צריך** ליצור user חדש בשום אופציה!

---

## ✅ אופציה A — שימוש במשתמש הקיים שלך (הכי מהיר)

ה-Sender יהיה המייל שלך הקיים (לדוגמה `mor@luca-ai.com`). הנמענים יראו "Mor" כשולח. תשובות יחזרו לתיבה שלך.

### שלב 1: הפעלת 2-Step Verification (אם עדיין לא)

App Password אפשרי רק עם 2FA פעיל.

1. https://myaccount.google.com → **Security → 2-Step Verification**
2. הפעילי 2FA (הכי קל: SMS למספר שלך)

### שלב 2: יצירת App Password

1. https://myaccount.google.com/apppasswords (יופיע רק אחרי 2FA)
2. App name: `Luca AI Supabase SMTP`
3. **Generate** → תקבלי **16 תווים** (4 בלוקים של 4)
4. **העתיקי את הסיסמה** — מופיעה פעם אחת בלבד!

### שלב 3: הגדרת Supabase

Supabase Dashboard → **Project Settings → Auth → SMTP Settings** → **Enable Custom SMTP**:

| שדה | ערך |
|---|---|
| Sender email | המייל שלך (`mor@<your-domain>`) |
| Sender name | `Luca AI` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | המייל שלך (זהה ל-Sender) |
| Password | ה-App Password (16 תווים) |
| Minimum interval | `60` שניות |

**Save**. סיימת.

---

## 🥈 אופציה B — Alias על המשתמש הקיים שלך

הוספת alias מאפשרת לשלוח מ-`noreply@<domain>` בלי ליצור משתמש חדש. הנמענים יראו "Luca AI Notifications" כשולח, ותגובות חוזרות לתיבה הראשית שלך.

### שלב 1: הוספת Alias

1. https://admin.google.com → **Directory → Users**
2. לחצי על המשתמש שלך
3. **User information → Alternate email addresses**
4. **Add an alias** → `noreply@<your-domain>` → שמירה
5. ייקח 5-30 דקות שה-alias יהיה פעיל

### שלב 2: 2FA + App Password על המשתמש שלך

(זהה לשלב 1+2 באופציה A — אם כבר עשית, דלגי)

### שלב 3: (חשוב!) הוספת ה-alias ל-"Send mail as" ב-Gmail

זה צעד שאנשים מפספסים. בלעדיו Gmail עלול לעטוף את ה-from בתגית "on behalf of":

1. https://mail.google.com → ⚙️ Settings → **See all settings**
2. **Accounts → Send mail as → Add another email address**
3. Name: `Luca AI` · Email: `noreply@<your-domain>` · ✅ Treat as an alias
4. Next → אם זה alias של Workspace, אישור אוטומטי

### שלב 4: הגדרת Supabase

| שדה | ערך |
|---|---|
| Sender email | `noreply@<your-domain>` ← ה-alias |
| Sender name | `Luca AI` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | המייל הראשי שלך (`mor@<your-domain>`) ← **לא ה-alias!** |
| Password | App Password |
| Minimum interval | `60` |

---

## 🥉 אופציה C — SMTP Relay (לנפח גבוה)

מאפשרת לשלוח מכל כתובת בדומיין שלך, עד 10,000 מיילים/יום. עדיין משתמשת בקרדנציאלים של המשתמש שלך לאוטנטיקציה.

### שלב 1: הפעלת SMTP Relay ב-Workspace

1. https://admin.google.com → **Apps → Google Workspace → Gmail → Routing**
2. גללי ל-**SMTP relay service** → **CONFIGURE / ADD ANOTHER RULE**
3. הגדרות:
   - **Description:** `Luca AI Transactional`
   - **Allowed senders:** "Only addresses in my domains"
   - **Authentication:** "Require SMTP Authentication" ✅
   - **Encryption:** "Require TLS encryption" ✅
4. שמירה

### שלב 2: 2FA + App Password על המשתמש שלך

(זהה לשלב 1+2 באופציה A)

### שלב 3: הגדרת Supabase

| שדה | ערך |
|---|---|
| Sender email | כל מה שתרצי (`noreply@<your-domain>`, `support@<your-domain>` וכו') |
| Sender name | `Luca AI` |
| Host | **`smtp-relay.gmail.com`** ← שונה מ-A/B! |
| Port | `465` |
| Username | המייל הראשי שלך |
| Password | App Password |
| Minimum interval | `60` |

---

## 📝 בדיקה (זהה לכל 3 האופציות)

1. Supabase → **Authentication → Users → Invite a user**
2. הזיני את המייל הפרטי שלך (Gmail / Hotmail וכו')
3. אמורה לקבל מייל תוך שניות, מהדומיין שבחרת
4. בדקי שהלינק עובד (לוחץ → נכנס ל-Luca)

**אם לא מגיע / מגיע ל-Spam:**
- Supabase Dashboard → **Logs → Auth** — מחפשת `SMTP error`
- ודאי שה-App Password הועתק בלי רווחים מיותרים
- אם נראית ב-Spam: סמני "Not Spam", זה משפר עתידית

---

## 🎨 שיפור התבנית של המייל (אופציונלי, מומלץ)

אחרי שה-SMTP עובד, יש לעצב את ה-HTML של מייל ההזמנה:

Supabase Dashboard → **Authentication → Email Templates → Magic Link** → החלפי את ה-HTML עם:

```html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>הזמנה ללוקה AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial; background: #f8fafc; margin: 0; padding: 40px 20px;">
  <table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
    <tr>
      <td style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 32px; text-align: center;">
        <h1 style="color: white; font-size: 24px; margin: 0;">Luca AI</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">מערכת חשבונאות חכמה</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px;">
        <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">שלום!</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          הוזמנת להצטרף ל-<strong>Luca AI</strong> — מערכת ניהול חשבוניות מבוססת בינה מלאכותית.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            כניסה ללוקה AI ←
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
          הלינק תקף ל-7 ימים. אם לא ביקשת את ההזמנה הזו, אפשר להתעלם בבטחה.
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
הזמנה ל-Luca AI - לחצי לכניסה
```

---

## 🆘 פתרון תקלות

| תקלה | פתרון |
|---|---|
| `Authentication failed` ב-Supabase Logs | App Password לא נכון. ייצרי חדש |
| מיילים יוצאים אבל מגיעים ל-Spam | הוספת DMARC ב-DNS (Google כבר טיפלה ב-SPF/DKIM אוטומטית) |
| `Username and Password not accepted` | חזרי לשלב App Password וייצרי חדש |
| `Daily user sending quota exceeded` | חרגת מ-2,000 ביום (אופציות A/B) או 10,000 (C). תחכי 24 שעות |
| באופציה B - המייל יוצא עם `on behalf of` | חזרי לשלב 3 של אופציה B - הוספת ה-alias ל-Gmail "Send mail as" |
| באופציה B - "Add an alias" שגויה ב-Admin | ייתכן שה-alias עוד לא propagated. חכי 30 דק' ונסי שוב |
