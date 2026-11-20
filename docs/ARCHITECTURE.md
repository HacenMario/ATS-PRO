# Architecture — Advanced Tasks Supervisor

> بالعربية أدناه / English summary at the end.

<div dir="rtl">

## لماذا هذه البنية؟

التطبيق خدمتان مستقلتان تتخاطبان عبر HTTPS فقط:

| الخدمة | الاستضافة | لماذا |
| --- | --- | --- |
| `apps/web` — Next.js 16 (App Router) | Vercel | العرض شبه استاتيكي: كل الصفحات عميلية، والبيانات تُجلب حصرًا من الـAPI. لا دوال خادم تحتاج MongoDB، فالتكلفة شبه معدومة والتحديث نشر ثابت. |
| `apps/api` — Express 4 + TypeScript | Railway | يحتاج عملية Node دائمة: Socket.IO للإشعارات اللحظية، مجدول المتأخرة كل دقيقة، Web Push، بث ملفات GridFS. دوال Vercel بلا خادم غير مناسبة لاتصالات طويلة ودورة حياة ثابتة. |
| MongoDB | Atlas للإنتاج | مخططات مرنة تخدم تعدد المستأجرين، فهارس مركّبة، وGridFS للمرفقات دون خدمة تخزين إضافية. |

### لماذا لا تمر الملفات عبر Vercel؟
المتصفح يرفع/ينزّل المرفقات من نطاق Railway مباشرة (`NEXT_PUBLIC_API_URL`). عند استعمال `apps/web` عبر Vercel لا يمر أي بايت من الملفات عبر Fast Origin Transfer للـAPI — الواجهة تجلب من Vercel الأصول الثابتة فقط (HTML/JS/CSS مضغوطة، أيقونات SVG صغيرة). أيضًا:
- استعلامات مقسمة صفحات (20–40 عنصرًا افتراضيًا) بلا استعلامات مكررة (debounce 250ms على الفلاتر، مفاتيح طلبات مستقرة).
- الإشعارات اللحظية عبر socket واحد بدل polling مكثف، مع polling احتياطي كل 45s فقط.
- لا بيانات مستخدم خاصة في أي CDN أو cache مشترك: كل استجابات الـAPI تحمل `Cache-Control` افتراضيًا بلا تخزين، والمفاتيح حساسة في cookies httpOnly.

### الاتصال الآمن بين الخدمتين
- الواجهة لا تحمل أي سر: `NEXT_PUBLIC_*` قيم عامة فقط.
- كل مصادقة عبر JWT قصير العمر + refresh دوّار في cookies httpOnly (أو Bearer داخل الذاكرة عند حجب cookies عبر النطاقات — انظر SECURITY.md).
- CORS قائمة بيضاء صريحة، وحارس Origin + ترويسة `X-Requested-With` على كل العمليات المُعدِّلة.
- الاتصال بين الخدمتين يمر عبر HTTPS دائمًا؛ لا حاجة لسر مشترك لأن كل طلب يحمل هوية موثقة ويُصرَّح به على الخادم.

## قاعدة البيانات والمخططات

| المجموعة | النقاط الأساسية |
| --- | --- |
| `users` | email فريد (collation غير حساس)، passwordHash bcrypt-12، تفضيلات (لغة/مظهر/حجم خط/صوت)، قفل بعد 5 محاولات، hash رمز استعادة كلمة المرور. |
| `workshops` | المستأجر: بيانات، حالة نشط/موقوف، منطقة زمنية. |
| `memberships` | فريد `(workshopId,userId)`، الدور داخل الورشة (worker/supervisor)، الحالة (active/pending/suspended/removed). |
| `invitations` | رمز فريد، autoJoin، حد استخدام + انتهاء. |
| `tasks` | كل الحقول المطلوبة + `previousStatus` للمتأخرة + `dueSoonNotifiedAt/overdueNotifiedAt` للمنع من التكرار + `changeLog` مضمّن + مرفقات معلنة. فهارس: `(workshopId,status,plannedEnd)`، `(workshopId,assigneeId,status)`، نصي `(title,description)`. |
| `notifications` | `params` (حقيبة ترجمة) تُعرض بلغة المستخدم الحالية، `dedupKey` فريد sparse لكل مستخدم، TTL 120 يومًا، سجل `deliveries` (قناة/محاولات/خطأ). |
| `pushsubscriptions` | endpoint فريد، مفاتيح، User-Agent. |
| `refreshtokens` | hash فقط، دوّار، كشف إعادة الاستخدام يبطل العائلة كلها. |
| `auditlogs` | أحداث حساسة (دخول، أدوار، إيقاف، إعدادات…) مع IP وactor. |
| `platformsettings` | وثيقة `global` واحدة: آلية التسجيل، اللغات المفعّلة، الافتراضية، بيانات التواصل المعروضة. |

## آلة حالات المهمة (مصدر الحقيقة المشترك)

مذكورة في `packages/shared/src/task-state-machine.ts` ويستهلكها الـAPI والويب:

- قواعد `(from, action, to, actor)` — `actor` يحدد: مشرف فقط / العامل المكلف حصرًا / الاثنان.
- **حماية هيكلية**: لا يوجد أي انتقال يصل إلى `completed_approved` أو `awaiting_supervisor_review` بفعل عامل — واختبار `assertWorkerSafety` يتحقق منها بنيةً.
- الخادم يعيد التحقق (`canPerformTaskAction` + `resolveTransition`) في كل طلب؛ الواجهة لا تخفي الأزرار إلا للراحة.

## التدفق اللحظي والإشعارات

```
عمل → مُبلَّغ عن الإنجاز ──▶ notifyWorkshopSupervisors() ─┬─▶ حفظ في notifications (in_app delivery)
                                                        ├─▶ Socket.IO غرفة user:{id} (عدّاد + توست)
                                                        └─▶ Web Push بلغة المستلم + 3 محاولات (سجل التسليم)
```

المجدول (كل 60 ثانية): تعليم المتأخرة بـ`overduePatch` مع `previousStatus`، إشعار مرة واحدة لكل حلقة، وإشعار «قرب الموعد» قبل الانتهاء بساعة. كل المنطق في `jobs/scheduler.ts` قابل للإيقاف في الاختبارات.

## تدقيق i18n كجزء من البناء

`scripts/i18n-audit.mjs` يقارن مفاتيح fr/en مع المرجع ar، يرفض القيم الفارغة، ويمسح الشيفرة عن المفاتيح غير المستخدمة (تحذير). `packages/i18n` تكرر نفس فحص التكافؤ في اختبارات vitest — أي نقص يوقف `check:ci` بالكامل.

## حدود كل خدمة (صادقة)

- Railway Free/Sleep: الخدمة تنام عند الخمول؛ socket لا يعمل أثناء النوم — الإشعارات محفوظة على الخادم وتُزامَن عند العودة. للاستخدام الحقيقي استخدم خطة دائمة.
- Atlas M0: لا نسخ احتياطي مجدول — `mongodump` خارجي أو ترقية.
- تحديد المعدل في الذاكرة: نسخة واحدة؛ للتحجيم وصّل Redis.
- Socket.IO بلا Adapter Redis: نافذة الاتصال لكل نسخة؛ مع نسخة Railway واحدة يعمل كاملًا.

</div>

## English summary

Monorepo with three deployables: `apps/web` (Next.js 16 on Vercel — near-static client rendering, all data from the API), `apps/api` (Express 4 + Socket.IO + Web Push + GridFS on Railway — persistent process), MongoDB/Atlas (multi-tenant collections strictly scoped by `workshopId` in every query, compound indexes, GridFS attachments). Files stream directly from Railway (never proxied through Vercel). The task state machine lives in `packages/shared` and is enforced server-side on every request (workers can never reach approved states — structurally tested). Notifications are stored first (with per-delivery logs), pushed over Socket.IO and Web Push in the recipient's language, deduped via `dedupKey`, and synced on reconnect. `scripts/i18n-audit.mjs` fails the build on missing/empty/extra translation keys. Honest limitations: Railway free-tier sleep pauses sockets (server keeps data), rate limiting is in-memory (single instance), Atlas M0 has no scheduled backups.
