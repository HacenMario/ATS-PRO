# Deployment — Railway (API) + Vercel (Web) + MongoDB Atlas

> بالعربية أدناه / English below.

<div dir="rtl">

## نظرة عامة على التسلسل

```
GitHub repo ──┬──▶ Railway  (apps/api  عبر railway.json + Dockerfile)  ──▶ api.your-domain.tld
              └──▶ Vercel   (apps/web  Root Directory = apps/web)      ──▶ app.your-domain.tld
                                 │
MongoDB Atlas ◀──────────────────┘  MONGODB_URI
```

## 1) MongoDB Atlas (الإنتاج)

1. أنشئ عنقودًا (M0 مجاني للبدء، M10 للنسخ الاحتياطي المجدول).
2. Database Access: مستخدم بكلمة مرور قوية.
3. Network Access: أضف `0.0.0.0/0` (Railway لا يوفر IP ثابتًا) أو نطاق مخصص متوفر في خطتك.
4. انسخ سلسلة الاتصال `mongodb+srv://user:pass@cluster/ats?retryWrites=true&w=majority`.

## 2) الـAPI على Railway

1. أنشئ مشروعًا جديدًا ← Deploy from GitHub repo (اختر المستودع).
2. Railway يكتشف `railway.json` في الجذر ويستخدم `apps/api/Dockerfile` (بناء من جذر المستودع: يثبّت workspaces ويبني shared → i18n → api).
3. Variables — أضف (قيم حقيقية، لا تُرفع أبدًا للمستودع):

| المتغير | ملاحظة |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | من الخطوة 1 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 64+ حرفًا عشوائيًا لكل واحد (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `CORS_ORIGINS` | `https://app.your-domain.tld,https://<vercel-preview-domain>` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_CROSS_SITE` | `false` مع نطاق أعلى واحد؛ `true` فقط مع vercel.app+railway.app |
| `SUPER_ADMIN_EMAIL` | بريد المدير الفعلي |
| `SUPER_ADMIN_PASSWORD` | ≥12 حرفًا بفئات الأربعة — أو `SUPER_ADMIN_PASSWORD_FILE` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npm run vapid:generate --workspace @ats/api` |
| `WEB_ORIGIN` | `https://app.your-domain.tld` |
| `SMTP_*` | اختياري — بريد استعادة كلمات المرور |

4. Deploy — تحقق من الصحة: `https://<railway-domain>/api/health` يعيد `{"ok":true,...}` وسجلات الإقلاع تطبع `[super-admin] created super admin account …`.
5. (اختياري) اربط نطاقًا مخصصًا `api.your-domain.tld` — Railway يصدر TLS تلقائيًا.

## 3) الواجهة على Vercel

1. Add New Project ← Import المستودع.
2. **Root Directory**: `apps/web` (Next.js يكتشف تلقائيًا).
3. Environment Variables:

| المتغير | القيمة |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.your-domain.tld` (بدون شرطة مائلة) |
| `NEXT_PUBLIC_WEB_URL` | `https://app.your-domain.tld` |

4. Deploy. ثم اربط النطاق `app.your-domain.tld` (Domains في إعدادات المشروع).
5. مهم: قيم `NEXT_PUBLIC_*` تُدمج عند البناء — أي تغيير لاحق يتطلب إعادة Deploy.

## 4) اتصال الخدمات (ممتع القراءة قبل الإطلاق)

- أضف نطاق Vercel النهائي إلى `CORS_ORIGINS` في Railway (إلا فسيرفض المتصفح الطلبات).
- سيناريو النطاقين:
  - **موصى به (إنتاج)**: `app.your-domain.tld` + `api.your-domain.tld` — نفس النطاق الأعلى → cookies SameSite=Lax تعمل في كل المتصفحات، مع `COOKIE_CROSS_SITE=false` (أقوى عزل CSRF).
  - **تجريبي** (`*.vercel.app` + `*.up.railway.app`): نطاقان مختلفان → `COOKIE_CROSS_SITE=true`. Chrome/Firefox/Edge تعمل؛ Safari قد يحجب cookies الطرف الثالث — حينها يتحول التطبيق تلقائيًا إلى وضع Bearer داخل الذاكرة (انظر docs/SECURITY.md) وتستمر الأداء دون cookies.

## 5) بعد الإطلاق — قائمة تحقق

- [ ] سجلات Railway تُظهر الإقلاع النظيف بدون `[super-admin] CONFIG ERROR`.
- [ ] سجّل الدخول بحساب المدير ← غيّر الاسم/البريد إن أردت ← أنشئ أول ورشة ← عيّن مشرفًا (إضافة عضو بدور supervisor).
- [ ] من الإعدادات العامة: اختر آلية التسجيل المناسبة (open/invite/closed) وفعّل اللغات وعبّئ بيانات الاتصال المعروضة في صفحة الاتصال.
- [ ] ولّد VAPID قبل تسجيل أول أجهزة Push.
- [ ] Atlas Backup: مجدول خارجيًا (M0) أو مفعّل من اللوحة (M10+).
- [ ] راقب `/api/health` بمتابعة Railway Healthcheck (مضبوطة في railway.json).

## 6) الترحيلات والترقيات

- الفهارس والمخططات تُنشأ وتتزامن تلقائيًا عند كل إقلاع (`syncIndexes`) — لا خطوات ترحيل يدوية للإصدارات العادية.
- عند إضافة حقول جديدة: Mongoose defaults تكفي؛ للتحديثات الهيكلية الكبيرة وثّق خطوة `mongorestore` مؤقتة قبل الترقية.

## 7) تطوير محلي محاكي للإنتاج

```bash
npm run build
# API:
cd apps/api && NODE_ENV=production node dist/server.js
# WEB (بعد بنائه مع NEXT_PUBLIC_API_URL الصحيح):
cd apps/web && npm run start
```

</div>

## English deployment summary

1. **Atlas**: create cluster + user + network access; copy `mongodb+srv://…`.
2. **Railway**: deploy from the repo (uses root `railway.json` → `apps/api/Dockerfile`), set variables (Mongo URI, JWT secrets, CORS origins, cookies flags, Super Admin credentials, VAPID keys, SMTP optional), verify `/api/health`.
3. **Vercel**: import repo, Root Directory `apps/web`, set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_WEB_URL`, deploy, attach custom domain.
4. Cross-origin notes: same registrable domain (`app.` / `api.`) with `COOKIE_CROSS_SITE=false` is the recommended production topology; split dev domains need `COOKIE_CROSS_SITE=true` and fall back to in-memory Bearer when browsers block third-party cookies.
5. Post-launch checklist: clean boot logs (no super-admin config errors), create the first workshop + supervisor, set registration mode / languages / contact info in admin settings, generate VAPID keys before first push subscription, schedule backups.
6. Migrations: indexes sync automatically at boot; no manual migration steps for normal releases.
