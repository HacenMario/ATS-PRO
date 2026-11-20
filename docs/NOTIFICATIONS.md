# Notifications — in-app, realtime & Web Push

> English summary at the end.

<div dir="rtl">

## طبقات الإشعار الثلاث

1. **داخل التطبيق (محفوظة)**: كل إشعار يُخزن في مجموعة `notifications` مع حقيبة ترجمة `params` — تُعرض بلغة المستخدم **الحالية** دائمًا، مع عدّاد غير مقروء وحالات مقروء (`readAt`) وصفحة إشعارات كاملة مع ترقيم.
2. **لحظية (Socket.IO)**: عند الاتصال ينضم العميل لغرفة `user:{id}` بعد مصادقة برمز JWT قصير (`GET /api/auth/socket-token`). الحدث `notification` يصل فورًا: توست أنيق + تحديث العدّاد + صوت اختياري (إن فعّله المستخدم وسمح المتصفح — احترام كامل لسياسات autoplay مع بديل مرئي دائم).
3. **Web Push**: عبر `web-push` ومفاتيح VAPID. الاشتراك لكل جهاز، الإذن بزر واضح من «حسابي»، واشتراكات ميتة (404/410) تُحذف تلقائيًا. نص الإشعار يُبنى **على الخادم بلغة المستلم المختارة** في وقت الإرسال، والـService Worker يعرضه ويفتح صفحة المهمة عند النقر (الصفحة تتحقق من الصلاحية).

## منع التكرار وإعادة المحاولة

- `dedupKey` فريد لكل مستخدم (مثل `overdue:{taskId}` أو `due-soon:{taskId}`): دورة المجدول لا ترسل إشعار «متأخرة» مرتين لنفس الحلقة تأخير.
- Push: 3 محاولات بفواصل (0/1.5s/5s) — النتيجة تُسجل في `deliveries` (قناة/محاولات/الخطأ/الوقت).
- الإشعار يُخزن **قبل** أي محاولة إرسال: جهاز غير متصل أو متصفح مغلق لا يفقد شيئًا.

## المزامنة بعد عودة الاتصال

- حدث `online` في المتصفح، أو نجاح إعادة اتصال الـsocket، أو دورة polling احتياطية كل 45 ثانية (لبيئات تحجب WebSocket) — أيها سبق يجلب غير المقروء ويحدّث العدّاد ويحمّل القائمة.
- العدّاد يظهر في الجرس وفي عنوان الصفحة `(n)`.

## أحداث الإشعارات المولّدة

| الحدث | المستلم |
| --- | --- |
| إسناد مهمة / إعادة جدولة | العامل المكلف |
| تعديل مهمة موكلة | العامل المكلف |
| إلغاء مهمة | العامل المكلف |
| قرب الموعد (قبل الانتهاء بساعة) | العامل |
| تأخر المهمة | العامل + كل مشرفي الورشة |
| إبلاغ عن الإتمام | كل مشرفي الورشة |
| اعتماد (مع التقييم) / إعادة (مع السبب) | العامل المكلف |
| تعليق جديد | الطرف الآخر (العامل أو المنشئ) |
| استخدام رمز دعوة | مشرفو الورشة |
| قبول عضوية / إزالة عضوية | المستخدم المعني |
| إيقاف/تفعيل الحساب | المستخدم المعني |
| طلب تغيير كلمة المرور | مشرفو الورشة (مع قائمة معالجة) |
| تعيين كلمة مرور جديدة للعامل | العامل + مشرفه المسؤول (النص الصريح وفق الإجراء) |
| إنشاء حساب عامل جديد | مشرفو الورشة |

## حدود صادقة (لا وعود مبالغة)

وصول Web Push **في الخلفية** يعتمد على:
1. دعم المتصفح ونظام التشغيل (iOS يقتصر على تطبيقات PWA المثبتة على iOS ≥16.4).
2. إذن المستخدم الصريح.
3. اتصال الجهاز بخدمة Push (FCM/APNs) وقت الإرسال.
4. النظام قد يجمّد الخدمة لجهاز مغلق جدًا أو Doze on Android؛ الإشعار يظل محفوظًا على الخادم ويُزامَن فور عودة الاتصال.

لذلك لا يدّعي التطبيق «إشعار مضمون والهاتف مغلق على كل الأجهزة» — ما يضمنه: التخزين الدائم على الخادم، سجل تسليم لكل جهاز، وإعادة مزامنة فورية عند أول اتصال.

## اختبار يدوي سريع

```bash
# جهازان (أو نافذتان): مشرف + عامل
# 1. العامل يفعّل الإشعارات من «حسابي»
# 2. المشرف يُسند مهمة جديدة
# 3. العامل يرى: توست + عدّاد الجرس + إشعار متصفح (إن مُنح الإذن)
# 4. العامل يضغط «أبلغ عن الإتمام» → المشرف يتلقى فورًا
# 5. أوقف الـsocket (DevTools → Offline) وأرسل مهمة → عُد Online → العدّاد يُزامَن
```

</div>

## English summary

Three layers: stored in-app notifications (translated client-side with an i18n `params` bag), realtime Socket.IO events (room per user, short-lived socket tokens, toast + optional sound that respects autoplay policies and user preference), and Web Push (VAPID, per-device subscriptions, dead-endpoint cleanup, localized payload rendered server-side). Dedup via per-user `dedupKey`, bounded 3-attempt retries recorded per delivery, offline-first: notifications persist server-side and sync on `online`/socket-reconnect/45s polling fallback. Full trigger table above. Honest limits: background push depends on browser/OS support, permission, and push-service connectivity — the platform guarantees server-side persistence and sync, not guaranteed delivery to every powered-off device.
