# دليل النشر الكامل — ATS PRO v1.3.0

هذه النسخة نظيفة تماماً: خالية من ملف تفريغ الذاكرة `apps/api/core` (377MB) الذي كان
يُرفض من GitHub، وتحتوي `.gitignore` جاهزاً يمنع عودته، وكل إعدادات النشر موثقة هنا.

---

## الخطوة 0: فك الأرشيف وتشغيل المشروع محلياً (اختياري للتأكد)

```powershell
# فك ضغط advanced-tasks-supervisor-v1.2.6.zip إلى مجلد جديد
cd D:\ATS-PRO
npm install
npm run check:ci     # يبني كل الحزم ويشغّل 87 اختباراً — يجب أن ينتهي بنجاح
```

---

## الخطوة 1: الرفع إلى GitHub (من مجلد نظيف — لا تستخدم المستودع القديم)

```powershell
cd D:\ATS-PRO
# أو شغّل السكربت الجاهز: .\deploy-github.ps1
git init
git add .
git status --short            # تأكد ألا يظهر apps/api/core (مستحيل الآن — الـ .gitignore يمنعه)
git commit -m "ATS PRO v1.2.6"
git branch -M main
git remote add origin https://github.com/HacenMario/ATS-PRO.git
git push -u origin main --force
```

> الدفع سينجح لأن أكبر ملف في المستودع الآن هو أصول التطبيق الصغيرة،
> ولا يوجد أي ملف يتجاوز حد GitHub (100MB). ملف `package-lock.json` مرفق
> وهو ضروري ليعمل النشر على Vercel بنسخ حزم مطابقة تماماً.

---

## الخطوة 2: النشر على Railway (الـ API + قاعدة البيانات)

### 2.1 أنشئ المشروع
1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → اختر `ATS-PRO`.
2. أضف قاعدة البيانات: **New → Database → MongoDB** (داخل نفس المشروع)،
   أو استخدم MongoDB Atlas وخذ رابط `mongodb+srv://...`.

### 2.2 إعدادات الخدمة (Settings)
| الإعداد | القيمة |
|---|---|
| Root Directory | فارغ (جذر المستودع) |
| Build Command | `npm install && npm run build -w @ats/api` |
| Start Command | `npm run start -w @ats/api` |

### 2.3 المتغيرات (Variables)
```
NODE_ENV=production
MONGODB_URI=${{MongoDB.MONGO_URL}}        # أو رابط Atlas
JWT_ACCESS_SECRET=<عشوائي 64 حرفاً على الأقل>
JWT_REFRESH_SECRET=<عشوائي مختلف>
CORS_ORIGINS=https://<مشروعك>.vercel.app,http://localhost:3000
COOKIE_SECURE=true
COOKIE_CROSS_SITE=true
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=<كلمة مرور قوية تتبع قواعد التطبيق>
VAPID_PUBLIC_KEY=<من npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<نفس الأمر>
VAPID_SUBJECT=mailto:you@example.com
```
- ولّد الأسرار بـ: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- **لا تضف PORT** — Railway يحقنه تلقائياً والخادم يقرأه من البيئة.
- **حساب المدير الأعلى يُنشأ تلقائياً** عند أول إقلاع من المتغيرين أعلاه (إن وُجد مسبقاً لن يُستبدل).

### 2.4 الدومين
Settings → Networking → **Generate Domain** → سيصبح رابط الـ API مثل:
`https://ats-api-production.up.railway.app` — جرّب `GET /api/meta` يجب أن يرجع 200.

---

## الخطوة 3: النشر على Vercel (واجهة Next.js)

1. [vercel.com](https://vercel.com) → **Add New → Project** → استورد `ATS-PRO`.
2. الإعدادات:
   | الإعداد | القيمة |
   |---|---|
   | Root Directory | `apps/web` |
   | Framework Preset | Next.js (يُكتشف تلقائياً) |
   | Build Command | `next build` (الافتراضي — اتركه) |
   | Install Command | فارغ (يُكتشف npm workspaces تلقائياً) |
3. المتغيرات (Environment Variables):
   ```
   NEXT_PUBLIC_API_URL=https://ats-api-production.up.railway.app
   NEXT_PUBLIC_WEB_URL=https://<مشروعك>.vercel.app
   ```
4. **Deploy** → خذ الدومين النهائي مثل `https://ats-pro.vercel.app`.
5. ارجع لـ Railway وحدّث `CORS_ORIGINS` بدومين Vercel النهائي ثم **Redeploy**.
   (خطوة 5 إلزامية — بدونها سيرفض المتصفح طلبات الواجهة للـ API)

> ملاحظة: أي تغيير في متغيرات `NEXT_PUBLIC_*` يتطلب إعادة Deploy كاملة لأنها
> تُدمج في حزمة الواجهة وقت البناء.

---

## الخطوة 4: التحقق النهائي

1. افتح `https://<مشروعك>.vercel.app` → سجّل دخول المدير الأعلى.
2. أنشئ ورشة → عضو مشرف → مهمة → أكمل الدورة.
3. جرّب الإشعارات اللحظية (تعمل عبر HTTPS تلقائياً في المنصتين).
4. أي خطأ: Railway → Deployments → **View Logs** يعرض رسالة واضحة تسمّي
   المتغير الناقص بالضبط (الخادم يفشل بسرعة برسالة خالية من الأسرار).

---

## ما الذي أُصلح في هذه النسخة تحديداً؟

### الجديد في v1.3.0

| الإضافة | التفاصيل |
|---|---|
| صفحة التقارير والتحليلات `/reports` | للمشرفين ومدير المنصة: 7 بطاقات KPI، رسم نشاط 8 أسابيع (أُنشئت/أُنجزت)، توزيع الحالات والأولويات، لوحة أداء العاملين مع نسبة الالتزام بالمواعيد، تصدير CSV متوافق مع Excel والعربية |
| بطاقة التعليقات والنقاش | في صفحة المهمة: خيط تعليقات مقروء + محرّر مباشر (للمشرف والمُسندَ إليه والمنشئ أثناء المهمة المفتوحة) |
| منع الزوم نهائياً | حقول ≥16px (`max(16px, 1em)`) + `maximumScale=1` — لا زوم تلقائي عند ظهور الكيبورد ولا يدوي |
| ترتيب الطبقات الموحّد | قوائم منسدلة (85) فوق النوافذ (80)، اللوحة الجانبية (70)، العارض الكامل (86)، التنبيهات (100) — لا شيء يظهر خلف نافذة مفتوحة |
| تحديث CSS شامل v1.3 | جداول تتحول لبطاقات على الهاتف، سهم مخصص للقوائم المنسدلة RTL/LTR، رسوم CSS خالية من المكتبات، أهداف لمس ≥44px، تباين أعلى في الوضعين النهاري والليلي |

أدوات تطوير جديدة في المستودع: `apps/api/dev-mongo.mjs` (Mongo محلي للتجربة) و`visual-check.mjs` (فحص بصري آلي بمقاس الهاتف).

خطوات النشر والرفع بدون تغيير — نفس أوامر Vercel وRailway (النسخة ذاتية البناء).

### إصلاحات سابقة (v1.2.6 → v1.2.8)

| المشكلة | الحل |
|---|---|
| ملف `apps/api/core` (377MB) يُرفض من GitHub | حُذف من الحزمة نهائياً + قاعدة `/apps/api/core` في `.gitignore` تمنع عودته (كان تفريغ ذاكرة من انهيار mongod التطويري) |
| دفع فاشل ⇒ Vercel ينشر شجرة قديمة ناقصة ⇒ Module not found | بمجرد نجاح الدفع يبني Vercel الشجرة الكاملة الصحيحة |
| خطأ `should NOT have additional property rootDirectory` عند استيراد Vercel | حُذف ملف `vercel.json` من جذر المستودع — خاصية `rootDirectory` غير مسموحة في الملف وتُضبط من لوحة Vercel فقط (Root Directory = apps/web) |
| 14 خطأ `Can't resolve '@ats/i18n'` / `'@ats/shared'` عند بناء Vercel | الحزمتان الداخليتان تُستهلكان من `dist/` المُتجاهَل في `.gitignore` ولا يُبنى على المنصات. أصبح البناء ذاتي التشغيل: `postinstall` في الجذر يبنيهما بعد كل `npm install`، وسكربتا `build` في apps/web و apps/api يبنيانهما قبل `next build`/`tsc` — لا حاجة لأي إعدادات إضافية على Vercel أو Railway |
| غياب توثيق النشر | هذا الدليل + `deploy-github.ps1` |
