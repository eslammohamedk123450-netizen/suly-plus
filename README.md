# Suly Plus

منصة تجارة إلكترونية متعددة المتاجر (Multi-tenant SaaS) بواجهة عربية RTL، مبنية باستخدام React وTypeScript وSupabase.

## التقنية
- React 18 + TypeScript + Vite 6
- Supabase PostgreSQL وAuth وStorage وEdge Functions وRow Level Security
- React Router 6 وTailwind CSS 3
- Vitest + Testing Library

## تشغيل المشروع محليًا
1. ثبّت Node.js 22.12 أو أحدث وGit.
2. استنسخ المستودع.
3. نفّذ `npm install`.
4. انسخ `.env.example` إلى `.env.local`.
5. تأكد من وجود `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` في `.env.local`.
6. نفّذ `npm run dev`.

## أوامر المشروع
- `npm run dev` — تشغيل بيئة التطوير
- `npm run typecheck` — فحص TypeScript
- `npm test` — الاختبارات
- `npm run build` — بناء نسخة الإنتاج
- `npm run preview` — معاينة نسخة الإنتاج

## الوظائف المتصلة حاليًا
- التسجيل وتسجيل الدخول والخروج عبر Supabase Auth.
- إنشاء المتجر وربطه تلقائيًا بصاحبه كمالك.
- إدارة المنتجات من PostgreSQL: إضافة وتعديل وأرشفة واستعادة كمسودة، وربط المنتج بتصنيف، وإدارة حتى خمس صور عبر Supabase Storage.
- إدارة تصنيفات كل متجر: إضافة وتعديل وترتيب وتفعيل/إيقاف وحذف مع الحفاظ على المنتجات عند حذف التصنيف.
- رفع صور المنتجات إلى `store-assets` تحت مجلد خاص بمعرّف المتجر، مع التحقق من نوع الصورة والحجم قبل الرفع.
- واجهة متجر عامة وسلة مشتريات منفصلة لكل متجر.
- إنشاء الطلبات من الخادم مع إعادة تسعير كامل من قاعدة البيانات والتحقق من المخزون.
- الدفع عند الاستلام.
- تكامل Paymob عبر Intention API وصفحة Unified Checkout المستضافة.
- التحقق من Webhook باستخدام HMAC-SHA512، والتحقق من المبلغ والعملة ورقم التكامل، ومعالجة الأحداث المتكررة بأمان.
- تتبع الطلب برمز وصول عشوائي دون كشف بيانات الاتصال أو عنوان العميل.
- إدارة دورة تنفيذ الطلب من لوحة التاجر: تأكيد، تجهيز، شحن، تسليم أو إلغاء وفق انتقالات مسموحة، مع سجل تدقيق للحالات وملاحظات داخلية.
- فصل حالة تنفيذ الطلب عن حالة الدفع؛ لا تسمح لوحة التاجر بتغيير حالة الدفع يدويًا، ولا تسمح بإلغاء طلب دفعه معلق أو مدفوع من مسار التنفيذ.
- إرجاع المخزون تلقائيًا عند إلغاء طلب لم يكتمل دفعه.
- صور المتاجر والمنتجات في Storage bucket باسم `store-assets`.

## إعداد Paymob
راجع `docs/paymob-setup.md`. لا تُضف مفاتيح Paymob إلى ملفات `VITE_*` أو GitHub. تُحفظ مفاتيح التاجر في Supabase Dashboard ضمن Edge Functions > Secrets فقط.

المفاتيح المطلوبة:
- `PAYMOB_SECRET_KEY`
- `PAYMOB_PUBLIC_KEY`
- `PAYMOB_INTEGRATION_ID`
- `PAYMOB_HMAC_SECRET`
- `SULY_PUBLIC_URL`

**حالة التفعيل:** الدفع عند الاستلام متاح. يظهر Paymob لمتجر واحد تحدده في `PAYMOB_ENABLED_STORE_SLUG` بعد ضبط القيم المطلوبة في أسرار Edge Functions. جميع المتاجر الأخرى تظل على الدفع عند الاستلام فقط.

**ملاحظة تعدد المتاجر:** إعداد Paymob الحالي على مستوى مشروع Suly Plus (حساب تاجر واحد)، وليس حسابًا مستقلاً لكل متجر. قبل فتح الدفع الإلكتروني لكل التجار يجب اعتماد نموذج حسابات فرعية/Marketplace وتسوية مستحقات التجار مع Paymob، أو تنفيذ إعداد منفصل آمن لكل متجر. لا تستخدم حساب Suly كحساب تحصيل مشترك للتجار قبل موافقة Paymob واستكمال المتطلبات القانونية والتسوية.

## حدود الوظائف الحالية
- صفحة المنتجات تدعم حاليًا منتجًا بمتغير أساسي واحد؛ إدارة المتغيرات المتعددة لا تزال غير مكتملة.
- صفحة المخزون تعرض كميات المنتجات وآخر 20 حركة، وتدعم التسويات اليدوية الآمنة للمنتجات ذات المتغير الأساسي الواحد مع منع المخزون السالب.
- إعداد رسوم الشحن وحد الشحن المجاني ومعدل الضريبة لكل متجر.
- كوبونات خصم بنسبة مئوية أو قيمة ثابتة مع حد أدنى وفترة صلاحية وحد استخدام.
- إعادة احتساب السعر والخصم والشحن والضريبة داخل قاعدة البيانات عند التسعير وعند إنشاء الطلب؛ لا تُقبل الإجماليات القادمة من المتصفح.
- واجهة هوية المتجر: الاسم والوصف والشعار وبيانات التواصل؛ الشعار المعروض يجب أن يكون رابط HTTPS.
- إدارة العملاء مع ترقيم الصفحات، وواجهة المتجر العام مع البحث والترتيب وترقيم صفحات المنتجات.
- Webhook يحدّث حالة الدفع فقط بعد تحقق التوقيع. لا يعتمد النظام على نتيجة تحويل المتصفح.
- التهيئة الحالية تتحقق من بيانات HMAC الموثقة غير الفارغة؛ يجب اختبار كل وسيلة دفع بعينة Callback من حساب التاجر قبل تفعيل محافظ أو وسائل لها حقول مصدر مختلفة.

## الأمان
- المفتاح الموجود في الواجهة هو Publishable Key فقط، والوصول للصفوف محكوم بسياسات RLS مرتبطة بـ `store_id`، مع صلاحيات SQL محدودة للزائر والمستخدم المسجل.
- صلاحيات الجداول والدوال الافتراضية في مخطط `public` لا تمنح `anon` أو `authenticated` وصولًا تلقائيًا إلى كائنات جديدة.
- لا تضع أبدًا `service_role` أو Secret Key في ملفات `VITE_*` أو في المتصفح.
- عمليات إنشاء الطلبات، نوايا الدفع، التحقق من Webhook، وتحديث سجل الدفع تتم عبر Edge Functions ودوال قاعدة بيانات لا يستطيع مفتاح المتصفح استدعاءها.
- السعر يحسب على الخادم ولا يُقبل سعر يرسله العميل.
- يتم قفل صفوف المنتجات أثناء حجز المخزون لمنع البيع الزائد في الطلبات المتزامنة.

## قاعدة البيانات
مشروع Supabase: `tihbrxbymkljhuyfoaio` — المنطقة `eu-west-1`.

- لوحة تحكم مباشرة لكل متجر تعرض المبيعات المحصلة من المدفوعات المؤكدة، وعدد الطلبات والمنتجات والعملاء، وتنبيه المخزون المنخفض، وآخر خمسة طلبات. يتم تجميع البيانات عبر دالة SQL بصلاحيات المستدعي (SECURITY INVOKER) وتخضع لسياسات RLS.


## Store checkout pricing and coupons

- Each store can configure its shipping fee, a free-shipping subtotal threshold, and a tax percentage in Dashboard → Settings. All values are expressed in the store currency; defaults are zero and no jurisdiction-specific tax rate is assumed.
- Store managers can create percentage or fixed-value coupons, configure minimum subtotal, optional usage caps and start/expiry times, deactivate or delete coupons.
- The storefront requests a checkout quote from the server. Product prices, availability, coupon eligibility, discount, shipping, tax and total are recomputed from database records.
- The order-creation transaction recalculates the amounts again, locks the coupon row when applicable, increments usage atomically, and updates the payment ledger amount. Client-supplied totals are never accepted.
- Order tracking and the merchant order view display the persisted price breakdown.
- Paymob receives the server-computed final amount and a single summary line item covering products, shipping, tax and discount. Live Paymob settlement and callback tests are still required before production activation.


## حالة الجاهزية قبل الإطلاق

المشروع في مرحلة ما قبل الإطلاق. نجاح TypeScript والاختبارات والبناء لا يغني عن اختبار تدفقات حقيقية بحسابات ومتاجر وطلبات فعلية في بيئة اختبار.

- لا تفعّل Paymob للإنتاج قبل اختبار Sandbox ثم معاملات حقيقية منخفضة القيمة، والتحقق من callbacks والتسوية مع مزود الدفع.
- إعداد Paymob الحالي مقيّد بمتجر واحد وحساب تاجر واحد؛ لا تستخدمه لتحصيل أموال عدة تجار قبل اعتماد نموذج Marketplace والتسوية من Paymob.
- راجع `docs/launch-readiness.md` قبل النشر.
- يجب مراجعة تنبيهات Supabase Security Advisor قبل الإطلاق. تحذير RLS الخاص بجدول `private.checkout_rate_limits` يحتاج قرارًا واعتمادًا لسياسة الخدمة؛ لا تفعّل RLS بلا سياسة مناسبة.
- يجب اختبار عزل المتاجر بحسابين مختلفين، والتحقق من صلاحيات المالك والمدير والموظف.
