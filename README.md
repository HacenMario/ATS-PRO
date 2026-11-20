# Advanced Tasks Supervisor

<div dir="rtl">

منصة ويب متعددة المستأجرين لإدارة مهام العاملين في الورش والمصانع: المشرف يُنشئ المهام ويوكّلها ويعاين العمل ميدانيًا ثم يعتمده بتقييم، والعامل يرى مهامه فقط ويُبلغ عن الإتمام، ومدير المنصة يدير الورشات والحسابات والإعدادات — مع إشعارات لحظية وداخل التطبيق وإشعارات متصفح (Web Push)، وثلاث لغات كاملة (العربية RTL / الفرنسية / الإنجليزية)، ووضع نهاري وليلي، وحجم خط قابل للضبط.

> من تطوير **مادونين حسان** — Developed by Madouni Hassan — Développé par Madouni Hassan

---

## الجديد في v1.1.0

- **علم الجزائر الرسمي** بهندسته الصحيحة (هلال يفتح جهة السهم والنجمة داخل تجويفه).
- **خطوط احترافية**: Cairo للعربية + Manrope للاتينية (self-hosted).
- **نوافذ غير شفافة** (قوائم/توست/نوافذ منبثقة) بنص واضح في الوضعين.
- **تواريخ موحدة** بصيغة `yyyy/mm/dd hh:mm:ss` في كل اللغات.
- **صورة شخصية** عند التسجيل مع تغيير لحظي في «حسابي» (base64 مع ضغط تلقائي).
- **استعادة كلمة المرور بعبارة الاسترجاع** (بدون بريد) + **طلبات تغيير كلمة المرور للمشرف** مع إشعار احترافي وقائمة معالجة.
- **إنشاء حسابات**: Super Admin ينشئ عاملاً ويربطه بورشة، والمشرف ينشئ حسابات في ورشته مباشرة.
- **تحكم كامل برموز الدعوة** للمدير: تعديل/تعطيل/تفعيل/حذف نهائي.
- **كلمة مرور مرنة** (6 أحرف بأي صيغة) لحسابات العاملين.
- **إحصاءات موسّعة للمشرف** بدوائر نسبة ثلاثية الأبعاد وجدول أداء العمال.
- **مسح سجل التدقيق بضغطة** + تنظيف تلقائي أسبوعي (>7 أيام).
- **تنقل ذكي حسب الدور** وشريط سفلي مخصص، وحذف صفحة الورشة من حساب العامل (اسم الورشة شارة في حسابه).
- **تفعيل إشعارات المتصفح من نافذة الإشعارات مباشرة**.
- **إلزامية رمز الدعوة** في كل تسجيل ذاتي + حقول الجنس/الميلاد/الزمرة الدموية.
- نصوص كاملة بلا اقتصاص «…»، تداخل صفري على 375px، وأزرار حجم خط بمقاييس معقولة (A حتى A+++).

## المحتويات
1. [البنية العامة](#البنية-العامة)
2. [الأدوار والصلاحيات](#الأدوار-والصلاحيات)
3. [دورة حياة المهمة](#دورة-حياة-المهمة)
4. [التشغيل محليًا](#التشغيل-محليا)
5. [متغيرات البيئة](#متغيرات-البيئة)
6. [النشر على Railway + Vercel](#النشر-على-railway--vercel)
7. [MongoDB وMongoDB Atlas](#mongodb-ومongodb-atlas)
8. [Web Push](#web-push)
9. [الأوامر](#الأوامر)
10. [الاختبارات](#الاختبارات)
11. [قيود معروفة](#قيود-معروفة)

## البنية العامة

Monorepo بإدارة npm workspaces:

| المسار | الوصف | الاستضافة |
| --- | --- | --- |
| `apps/web` | Next.js 16 (App Router, TypeScript, Tailwind CSS 4) | **Vercel** |
| `apps/api` | Node + Express 4 + Socket.IO + Web Push + GridFS | **Railway** |
| `packages/shared` | الأنواع المشتركة، آلة حالات المهمة، حساب المدد، مخططات zod | — |
| `packages/i18n` | قواميس ar/fr/en + دوال الترجمة + تدقيق مفاتيح | — |
| `MongoDB` | قاعدة البيانات (فهارس مركّبة + عزل `workshopId`) | Atlas للإنتاج |

**سبب اختيار هذا التكامل:**
- الواجهة على Vercel: أشخاص على Vercel يعرفون Next.js أفضل من الجميع، والعرض شبه استاتيكي (كل البيانات تُجلب من الـAPI في المتصفح) يخفض تكاليف الدوال والنقل.
- الـAPI على Railway: عمليات طويلة الاتصال (Socket.IO للإشعارات اللحظية، Web Push، بث ملفات GridFS) لا تناسب دوال Vercel بلا خادم؛ Railway يوفّر عملية Node دائمة بنطاق مستقر.
- الملفات المرفوعة تُخزّن في GridFS داخل MongoDB وتُبثّ **مباشرة من Railway** — لا تمر عبر Vercel إطلاقًا (تقليل Fast Origin Transfer).
- لمزيد من التفاصيل: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## الأدوار والصلاحيات

| الدور | الصلاحيات |
| --- | --- |
| **Super Admin** | يُهيأ من متغيرات البيئة فقط (لا حساب افتراضي). يدير الورشات والحسابات والأدوار وإيقاف/تفعيل الحسابات، وسجل النشاط، وإعدادات المنصة (آلية التسجيل، اللغات المفعّلة، بيانات التواصل). |
| **مشرف الورشة** | يدير ورشته فقط: يُنشئ المهام ويوكّلها لأعضاء ورشته النشطين، يعدّلها ويؤجلها، يعاين العمل ميدانيًا (حالة «بانتظار المعاينة»)، يعتمد الإنجاز بتقييم 1–5 وتعليق أو يعيد المهمة بسبب واضح، يدير الأعضاء (إضافة بالبريد، ترقية، إيقاف، إزالة) ويولّد رموز الدعوة، ويعدّل بيانات ورشته. |
| **العامل** | يُسجّل وفق آلية التسجيل المعتمدة ثم ينضم برمز دعوة. يرى **مهامه الموكلة إليه فقط**، يبدأ التنفيذ ويحدّث نسبة التقدم ويُبلغ عن الإتمام (تتحول المهمة إلى «بانتظار معاينة المشرف» ولا يمكنه اعتمادها إطلاقًا)، ويعلّق ويُرفق ملفات. |

**حالات الحساب والعضوية:** الحساب `active/suspended` (الموقوف لا يدخل)، والعضوية `active/pending/suspended/removed`. رمز الدعوة إما `autoJoin` (انضمام مباشر) أو بانتظار موافقة المشرف من صفحة العاملين.

كل طلب API يتحقق: JWT صالح ← الحساب نشط ← العضوية نشطة في الورشة المعنية ← الدور يسمح بالعملية — **عزل بيانات الورشة في طبقة الاستعلام نفسها**، لا إخفاء واجهة فقط.

## دورة حياة المهمة

```
مسودة ──جدولة──▶ مجدولة ──بدء──▶ قيد التنفيذ ──إبلاغ العامل──▶ أُبلغ عن الإنجاز
                    │                │                              │
                    │                │                          بدء المعاينة
                    │                ▼                              ▼
                 إلغاء          متأخرة ◀──(مجدول تلقائي)      بانتظار معاينة المشرف
                    │                │                              │
                    ▼                ▼                        اعتماد ─┴─ إعادة مع السبب
                 ملغاة ◀─────────────┘                          ▼              ▼
                                                     منجزة ومعتمدة      عودة إلى قيد التنفيذ
```

- الحقول الإلزامية: عنوان، وصف، ورشة، عامل مكلّف، منشئ، موعدا البدء والانتهاء المحددان، البدء الفعلي، وقت الإبلاغ، وقت الاعتماد، المدد المحسوبة تلقائيًا، الحالة، الأولوية، نسبة التقدم، الموقع، تعليمات السلامة، مرفقات (GridFS، حتى 4MB×6)، تعليق، تقييم، وسجل تغييرات زمني كامل.
- **العامل لا يستطيع أبدًا** نقل المهمة إلى «منجزة ومعتمدة» — محمي في آلة الحالات المشتركة وفي كل نقطة API، ومغطى باختبارات.
- مهمة مجدولة تلقائيًا كل دقيقة: تعليم المتأخرة + إشعار واحد لكل حلقة تأخير (dedup)، وإشعار «قرب الموعد» قبل الانتهاء بساعة مرة واحدة.

## التشغيل محليًا

المتطلبات: Node ≥ 20.9، npm ≥ 10، MongoDB محلي أو Atlas.

```bash
# 1. الحزم
npm install

# 2. البيئة
cp apps/api/.env.example apps/api/.env        # عدّل القيم
cp apps/web/.env.example apps/web/.env.local  # عدّل القيم

# 3. مفاتيح Web Push (مرة واحدة)
npm run vapid:generate --workspace @ats/api   # انسخ الناتج إلى .env

# 4. تشغيل
npm run dev:api     # Express + Socket.IO على :4000
npm run dev:web     # Next.js على :3000

# 5. فحص الجاهزية
curl http://localhost:4000/api/health
```

عند أول تشغيل للـAPI يُنشأ حساب Super Admin من `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` (كلمة مرور ≥12 حرفًا بأحرف كبيرة وصغيرة وأرقام ورموز، تُخزن مجزأة bcrypt ولا تُكتب فوق حساب قائم أبدًا). إن نقصت المتغيرات يُطبع خطأ إعداد واضح ويستمر الخادم دون إنشاء الحساب — **لا يوجد حساب افتراضي في الكود**.

## متغيرات البيئة

القوالب الكاملة مع تعليقات: [`apps/api/.env.example`](apps/api/.env.example) و[`apps/web/.env.example`](apps/web/.env.example).

| المتغير (API) | الغرض |
| --- | --- |
| `MONGODB_URI` | اتصال MongoDB (إلزامي) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | أسرار الجلسات (≥32 حرفًا عشوائيًا) |
| `CORS_ORIGINS` | قائمة نطاقات الواجهة المسموحة بفواصل |
| `COOKIE_SECURE` / `COOKIE_CROSS_SITE` | cookies آمنة / عبر نطاقين مختلفين |
| `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD` أو `_FILE` | تهيئة حساب المدير (مرة واحدة، إلزامية للاستخدام) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SMTP_*` | بريد استعادة كلمة المرور (اختياري) |
| `WEB_ORIGIN` | يُستخدم في روابط البريد |
| `MAX_UPLOAD_MB` / `MAX_FILES_PER_TASK` | حدود المرفقات |

| المتغير (WEB) | الغرض |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | عنوان الـAPI على Railway (يُدمج عند البناء) |
| `NEXT_PUBLIC_WEB_URL` | عنوان الواجهة |

ملفات `.env` مستبعدة من Git عبر `.gitignore`، ولا تُوضع أسرار في الواجهة أو المستودع.

## النشر على Railway + Vercel

### 1. MongoDB Atlas
أنشئ عنقودًا مجانيًا (M0 يكفي للبدء)، مستخدم بكلمة مرور قوية، واسمح بالوصول من Railway (0.0.0.0/0 أو نطاق Railway). انسخ `mongodb+srv://...` إلى `MONGODB_URI`.

### 2. الـAPI على Railway
- اربط مستودع GitHub بمشروع Railway جديد ← Deploy from repo.
- Railway يقرأ [`railway.json`](railway.json) ويبني عبر `apps/api/Dockerfile` من جذر المستودع.
- أضف المتغيرات في قسم Variables (انسخها من `.env.example` واملأها). منح `PORT` يتولى Railway.
- بعد النشر: `https://<service>.up.railway.app/api/health` يجب أن يعيد `{"ok":true}`.
- أنشئ VAPID keys وأضفها قبل أول تسجيل أجهزة.

### 3. الواجهة على Vercel
- Import Project ← اختر المستودع، واضبط **Root Directory = `apps/web`**.
- أضف `NEXT_PUBLIC_API_URL=https://<railway-domain>` و`NEXT_PUBLIC_WEB_URL` في Environment Variables.
- Build/Dev أوامر الافتراضية من Next.js تكفي (npm يثبّت workspaces تلقائيًا من جذر المستودع).

### 4. CORS والدومينات
- ضع نطاق Vercel (والدومين المخصص إن وجد) في `CORS_ORIGINS` في Railway.
- **النطاقان الافتراضيان** (`*.vercel.app` + `*.up.railway.app`) نطاقان مختلفان تمامًا: اجعل `COOKIE_CROSS_SITE=true` (cookies SameSite=None) — يعمل في Chrome/Firefox/Edge، وقد يمنعه Safari لأنه يعتبرها third-party cookies؛ في هذه الحالة يتحول التطبيق تلقائيًا إلى وضع Bearer + refresh في localStorage (انظر docs/SECURITY.md §النطاقات).
- **الإنتاج الموصى به**: `app.your-domain.tld` على Vercel + `api.your-domain.tld` على Railway (نفس النطاق الأعلى) مع `COOKIE_CROSS_SITE=false` → أقوى عزل CSRF ويعمل في كل المتصفحات.

### 5. الترحيل والنسخ الاحتياطي
- المخططات والفهارس تُنشأ تلقائيًا عند الإقلاع (`syncIndexes`).
- النسخ الاحتياطي: Atlas Free لا يوفر snapshots مجدولة — استخدم `mongodump`/`mongorestore` مجدولة خارجيًا أو رقِّ لخطة M10+ لتفعيل Backups.
- الترقيم بين الإصدارات: لا ترحيلات صلبة؛ التغييرات إضافية في مخططات Mongoose مع قيم افتراضية.

## MongoDB وMongoDB Atlas

- العزل: كل استعلام للمهام/الإشعارات/الأعضاء يمر عبر مرشح `workshopId` مشتق من عضوية المستخدم في الطلب نفسه — لا يمكن للمستلم تمرير ورشة أُخرى.
- الفهارس: `workshopId+status+plannedEnd`, `workshopId+assigneeId+status`, نصي على `title/description`, فريد على `email` (collation غير حساس للحالة)، `userId+dedupKey` فريد sparse لمنع تكرار الإشعارات، TTL على الإشعارات (120 يومًا).
- GridFS لحظة الرفع: حد 4MB/ملف (قابل للضبط)، أنواع مسموحة فقط (PDF/صور/مستندات)، الملف مرتبط بمهمة والتنزيل يمر بتحقق عضوية نفسه.

## Web Push

1. ولّد المفاتيح: `npm run vapid:generate --workspace @ats/api`.
2. ضع المفاتيح في بيئة الـAPI. المفتاح العام يُعرض في `GET /api/meta` ويستخدمه المتصفح.
3. المستخدم يفعّل الإشعارات من صفحة «حسابي» (زر واضح يطلب الإذن ويدير الاشتراك لكل جهاز).
4. Service Worker (`public/sw.js`) يعرض الإشعار بنص **مترجم باللغة المختارة لدى المستلم** وقابل للنقر يفتح صفحة المهمة (الصلاحية تُتحقق في الصفحة).
5. سجل التسليم محفوظ في قاعدة البيانات (`deliveries` لكل إشعار: القناة، المحاولات، الخطأ، وقت الإرسال)، مع إعادة محاولة منضبطة (3 محاولات) وتنظيف الاشتراكات الميتة (404/410).
6. **حدود صادقة**: وصول Push في الخلفية يعتمد على دعم المتصفح ونظام التشغيل وإذن المستخدم واتصال الجهاز بخدمة Push — لا يضمن التطبيق وصول إشعار لجهاز مغلق على كل الأجهزة. كل إشعار يُخزن على الخادم أولًا، وعند عودة الاتصال (حدث `online` أو إعادة اتصال الـsocket أو دورة polling كل 45 ثانية) يجلب التطبيق غير المقروء ومزامنة العدّاد فورية.

## الأوامر

```bash
npm install            # تثبيت كل الـworkspaces
npm run dev:api        # تشغيل الـAPI بالتطوير (tsx watch)
npm run dev:web        # تشغيل الواجهة بالتطوير
npm run build          # بناء كل الحزم (shared → i18n → api → web)
npm run typecheck      # tsc --noEmit لكل الحزم
npm run lint           # ESLint للـAPI والويب
npm test               # اختبارات الحزم الأربع (توقف عند أول فشل)
npm run i18n:audit     # تدقيق مفاتيح الترجمة (يفشل البناء عند نقص/فراغ)
npm run check:ci       # audit + typecheck + lint + test + build (المسار الكامل)
npm run seed:superadmin    # إنشاء/ترقية Super Admin يدويًا (نفس قواعد الإقلاع)
npm run vapid:generate --workspace @ats/api
```

## الاختبارات

- **packages/shared** (25 اختبار): آلة الحالات ومصفوفة الأدوار (العامل لا يعتمد أبدًا)، المدد، مخططات التحقق.
- **packages/i18n** (7): تكافؤ المفاتيح بين اللغات + اتجاهات RTL/LTR.
- **apps/api** (33 تكامل على MongoDB في الذاكرة): تدفق المصادقة كاملًا (تسجيل/دخول/تدوير refresh وكشف إعادة استخدامه/قفل الحساب/استعادة كلمة المرور/حارس CSRF)، **عزل بيانات الورشات** (مشرف B لا يرى بيانات A، العامل يرى مهامه فقط، المكلف حصرًا من أعضاء الورشة)، ودورة حياة المهمة من الإسناد حتى الاعتماد مع الإشعارات والسجل الزمني وتجميع الإحصاءات، وتجربة المتأخرة المتكررة.
- **apps/web** (11): تكافؤ الترجمة كحارس بناء، RTL/LTR على `<html>`، حجم الخط، مساعدات التنسيق، وعميل API (401 → refresh → إعادة واحدة، وربط رموز الأخطاء).
- `npm run check:ci` يشغّل كل ما سبق ويكون **بوابة النشر**.

## قيود معروفة

- تحديد المعدل في الذاكرة: صحيح لنسخة Railway واحدة؛ للتحجيم الأفقي وصّل مخزن Redis في `apps/api/src/middleware/rate.ts`.
- عدم وجود خدمة بريد مهيأة يجعل استعادة كلمة المرور تمر بإصدار رابط لمرة واحدة من لوحة المدير (مغطاة بالمتغيرات `SMTP_*` عند توفرها).
- وصف الخطأ في الـAPI يُسجل بدون أسرار، ورموز الأخطاء تُترجم في الواجهة.
- الاختبار الآلي للواجهة تغطي المنطق والترجمة والعميل، وليس لقطات بصرية؛ اختبر التخطيط يدويًا على شاشات 375px و1440px بعد النشر.

</div>

---

## English summary

Advanced Tasks Supervisor is a multi-tenant platform for managing workshop/factory worker tasks. **Stack:** Next.js 16 (Vercel) + Express/Socket.IO/Web Push API (Railway) + MongoDB (Atlas). **Roles:** Super Admin (env-bootstrapped, manages tenants/accounts/settings/audit), Workshop Supervisor (create/assign/review/approve-or-return tasks with rating & comment, manage members & invite codes), Worker (sees only own tasks, reports completion — can never self-approve). **Full i18n** (Arabic RTL / French / English) with a dictionary-parity audit that fails the build, dark/light themes, adjustable font size, realtime in-app + Web Push notifications with server-side delivery logs and reconnect sync. **Run locally:** see the Arabic section above (`npm install`, copy the two `.env.example` files, `npm run dev:api` + `npm run dev:web`). **Deploy:** Atlas → Railway (uses `railway.json` + `apps/api/Dockerfile`) → Vercel (Root Directory `apps/web`). Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).

## Résumé en français

Advanced Tasks Supervisor est une plateforme multi-clients de gestion des tâches des ouvriers (ateliers/usines). **Stack :** Next.js 16 (Vercel) + API Express/Socket.IO/Web Push (Railway) + MongoDB (Atlas). **Rôles :** administrateur de la plateforme (initialisé via variables d'environnement), superviseur d'atelier (crée/assigne/contrôle/approuve ou retourne avec note et motif, gère membres et codes d'invitation), ouvrier (ne voit que ses tâches, signale la fin — ne peut jamais valider lui-même). **i18n complet** (arabe RTL / français / anglais) avec audit d'égalité des clés, thème clair/sombre, taille de police réglable, notifications temps réel + Web Push avec journal de livraison et synchronisation après reconnexion. **Démarrage local :** voir la section arabe ci-dessus. **Déploiement :** Atlas → Railway → Vercel (Root Directory `apps/web`). Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).
