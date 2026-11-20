# Security — Advanced Tasks Supervisor

> English below the Arabic section.

<div dir="rtl">

## المصادقة والجلسات

- **الوصول**: JWT (HS256) صالح 15 دقيقة، Audience `web` أو `socket` (رمز منفصل قصير لعقدة Socket.IO عبر `GET /api/auth/socket-token`).
- **التحديث**: رمز مبهم عشوائي (48 بايت) يُخزن **مجزأً** (SHA-256) في `refreshtokens`، يُدوَّر عند كل استعمال؛ إعادة استعمال رمز مدوَّر تُعتبر سرقة فتبطل العائلة كلها.
- **Cookies**: httpOnly + Secure + SameSite (None مع `COOKIE_CROSS_SITE=true` أو Lax). المسار محصور بـ`/`، وأعمارها مطابقة لأعمار الرموز.
- **وضع النطاقين المختلفين**: عندما يمنع المتصفح cookies الطرف الثالث (مثل Safari مع vercel.app+railway.app)، يعيد العميل الاستعلام عبر `Authorization: Bearer` في الذاكرة مع نسخة احتياطية من refresh في localStorage — مقايضة موثقة: خطر XSS تتم إدارته بغيب dangerouslySetInnerHTML للمحتوى الديناميكي وCSP صارم في الواجهة وعدم عرض HTML من المستخدمين أبدًا. الخيار الأفضل إنتاجيًا يبقى النطاق الأعلى الواحد (`app.domain` + `api.domain`) مع `COOKIE_CROSS_SITE=false`.

## حماية CSRF

ثلاث طبقات:
1. SameSite cookies (Lax افتراضيًا داخل نفس النطاق).
2. حارس Origin: أي طلب يحمل ترويسة Origin يجب أن يأتي من قائمة `CORS_ORIGINS`.
3. كل عملية مُعدِّلة تتطلب ترويسة `X-Requested-With: XMLHttpRequest` — لا يمكن لموقع خارجي إضافتها دون اجتياز preflight مرفوضة.

## التحقق من المدخلات ومنح الاستعلامات

- كل جسم طلب/استعلام يمر عبر مخططات **zod** في `packages/shared` (نفس المخططات تُستخدم في الواجهة) — `.strict()` يرفض المفاتيح الزائدة.
- لا يُبنى أي استعلام MongoDB من نص خام للمستخدم: المعرفات تُتحقق بـ`Types.ObjectId.isValid`، والبحث النصي عبر `$text` مع فهرس، وأسماء الملفات تُنظف من فواصل المسارات وأحرف التحكم.
- الأخطاء تعيد **رموزًا مستقرة** (`errors.*`) تُترجم في الواجهة؛ رسائل الاستثناء الخام لا تخرج للمستخدم أبدًا، وسجلات الخادم لا تطبع أسرارًا أو قيم متغيرات البيئة.

## عزل المستأجرين (الأهم)

- `requireWorkshopScope()` يحل عضوية المستخدم من قاعدة البيانات **في كل طلب على مسار ورشة**؛ العضو غير العضو يحصل 403 حتى لو خمّن المعرفات.
- قوائم المهام تُبنى بمرشح `workshopId ∈ أورشتي النشطة` + `assigneeId = أنا` للعامل — لا يمكن طلب مهام ورشة أخرى ولا مهام زميل.
- إنشاء مهمة: المكلف يجب أن يكون عضوًا **نشيطًا في نفس الورشة** يتحقق منه الخادم (اختبار تكامل يغطي المحاولة عبر ورشة أخرى).
- لوحة المدير كلها خلف `requireSuperAdmin`، ولا يمكن تعديل حساب super_admin آخر، ولا إيقاف حسابك بنفسك من هناك.

## كلمات المرور

- bcrypt cost 12. سياسة المستخدم: ≥10 حروف مع أحرف وأرقام. سياسة Super Admin: ≥12 مع كبيرة/صغيرة/رقم/رمز — بلا حساب افتراضي نهائيًا؛ نقص/ضعف المتغيرات يطبع خطأ إعداد ولا يُنشئ الحساب، والحساب القائم لا يُكتب فوقه أبدًا عند إعادة الإقلاع.
- قفل الحساب بعد 5 فشل (15 دقيقة) + محدد معدل على /login لكل IP+بريد.
- تغيير كلمة المرور يبطل كل جلسات المستخدم (revoke refresh family).
- استعادة كلمة المرور: رمز مرة واحدة 30 دقيقة (hash في القاعدة). البريد عبر SMTP إن مهيأ؛ وإلا يُصدر المدير الرابط من اللوحة ويعرض **مرة واحدة**.

## سجل التدقيق والخصوصية

- كل حدث حساس يُسجل: دخول/فشل دخول/خروج، إنشاء وتعديل وإيقاف الورشات، تغيير الأدوار وحالات العضويات، إعدادات المنصة، إصدار روابط الاستعادة، اشتراكات Push.
- لا تُسجل قيم كلمات المرور أو الرموز؛ IP والمستخدم والهدف فقط.
- الإشعارات TTL 120 يومًا، والمرفقات تُحذف مع حذف مهمتها أو بمسار DELETE مصرح به.

## حدود الملفات المرفوعة

- حد الحجم من البيئة (`MAX_UPLOAD_MB=4` افتراضيًا)، حد العدد لكل مهمة (6)، قائمة MIME بيضاء (PDF/صور/مستندات Office)، الرفع عبر multer memory ثم GridFS.
- التنزيل مصرح به: يجب أن يمر بقراءة المهمة الأصلية (نفس عزل الورشة) قبل البث.
- التنظيف: حذف ملف من المهمة يحذفه من GridFS؛ حذف مهمة كاملة يجري التنظيف عبر `deleteTaskAttachments`.

## تحديد المعدل

| المسار | الحد |
| --- | --- |
| عام | 600 طلب / 15 دقيقة / IP |
| `/auth/login` | 10 محاولات فاشلة / 15 دقيقة / IP+بريد |
| `/auth/register` | 20 / ساعة / IP |
| `/auth/forgot-password` | 6 / ساعة / IP |
| رفع المرفقات | 40 / 15 دقيقة |

في الذاكرة — كافٍ لنسخة Railway واحدة؛ للتحجيم الأفقي وصّل مخزن Redis (نقطة التوصيل موثقة في `src/middleware/rate.ts`).

## ترويسات الأمان

- API: helmet (بدون CSP — لا يقدم HTML)، تعطيل `x-powered-by`.
- WEB: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` مقيّد، و`Service-Worker-Allowed`.

</div>

## English summary

JWT access (15 min, audience-scoped) + rotating refresh tokens stored hashed with reuse detection that revokes the whole family. httpOnly cookies (SameSite None cross-site / Lax same-site) plus an in-memory Bearer fallback when third-party cookies are blocked; the recommended production topology is one registrable domain. CSRF defense = SameSite + strict Origin allowlist + mandatory `X-Requested-With` header on mutations. All inputs validated by strict zod schemas shared between apps; no raw user strings reach Mongo queries; errors return stable translated codes without leaking internals. Tenant isolation is enforced per request via server-side membership resolution — workers see only their own tasks, supervisors only their workshop, cross-workshop assignee IDs are rejected. bcrypt-12 passwords with stronger policy for the env-bootstrapped Super Admin (no defaults, no overwrites, clear config errors). Account lockout, rate limits per route, one-time password-reset links (SMTP optional), comprehensive audit log without secrets, whitelisted size/type-limited GridFS attachments with authorized streaming and cleanup, and security headers on both services.
