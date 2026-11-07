# תבניות מייל בעברית — Supabase Auth

איפה מדביקים: Supabase → Authentication → Emails → Templates. בכל תבנית מחליפים את ה-Subject ואת ה-Body, ולוחצים **Save changes**.

---

## 1. Invite user (הזמנה)

**Subject:**
```
הוזמנת ל-Luca AI
```

**Body:**
```html
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6;text-align:right">
  <h2 style="margin:0 0 12px">הוזמנת ל-Luca AI</h2>
  <p style="margin:0 0 12px">שלום,</p>
  <p style="margin:0 0 12px">
    {{ if .Data.workspace_name }}המשרד <b>{{ .Data.workspace_name }}</b> הזמין אותך{{ else }}הוזמנת{{ end }}
    להצטרף ל-Luca AI{{ if .Data.business_name }} עבור העסק <b>{{ .Data.business_name }}</b>{{ end }}.
  </p>
  <p style="margin:0 0 20px">לחצו על הכפתור כדי להיכנס. אין צורך בסיסמה.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">כניסה ל-Luca AI</a>
  </p>
  <p style="margin:0 0 6px;font-size:13px;color:#64748b">הקישור אישי, תקף לזמן מוגבל ומשמש לכניסה אחת. אם פג תוקפו — בקשו מהמשרד הזמנה חדשה.</p>
  <p style="margin:0;font-size:13px;color:#64748b">אם לא ציפיתם להזמנה הזו, אפשר להתעלם מהמייל.</p>
</div>
```

---

## 2. Magic link or OTP (קישור כניסה)

**Subject:**
```
קישור הכניסה שלך ל-Luca AI
```

**Body:**
```html
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6;text-align:right">
  <h2 style="margin:0 0 12px">כניסה ל-Luca AI</h2>
  <p style="margin:0 0 20px">לחצו על הכפתור כדי להיכנס לחשבון שלכם. אין צורך בסיסמה.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">כניסה ל-Luca AI</a>
  </p>
  <p style="margin:0 0 6px;font-size:13px;color:#64748b">אפשר גם להזין את הקוד: <b dir="ltr">{{ .Token }}</b></p>
  <p style="margin:0 0 6px;font-size:13px;color:#64748b">הקישור תקף לזמן מוגבל ומשמש לכניסה אחת.</p>
  <p style="margin:0;font-size:13px;color:#64748b">אם לא ביקשתם להיכנס, אפשר להתעלם מהמייל.</p>
</div>
```
