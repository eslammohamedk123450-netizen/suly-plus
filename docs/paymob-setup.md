# إعداد Paymob في Suly Plus

## ما تم تنفيذه
- إنشاء طلب Paymob من الخادم فقط.
- إنشاء Payment Intention عبر Paymob Egypt API.
- تحويل العميل إلى Unified Checkout المستضاف لدى Paymob.
- استقبال Transaction Processed Callback والتحقق من HMAC-SHA512.
- التحقق من Integration ID، ورقم الطلب الداخلي، ورقم طلب Paymob، والمبلغ والعملة.
- معالجة Callback المتكرر دون تكرار اعتماد الدفع.
- عدم اعتبار صفحة العودة من Paymob دليلًا على الدفع.

## إعداد الأسرار
افتح Supabase Dashboard ثم المشروع `tihbrxbymkljhuyfoaio` ثم **Edge Functions → Secrets**، وأضف الأسرار التالية بقيم حساب التاجر:

| Secret | الوصف |
|---|---|
| `PAYMOB_SECRET_KEY` | مفتاح Paymob السري لإنشاء Payment Intentions |
| `PAYMOB_PUBLIC_KEY` | Public Key الخاص بالمتجر/حساب التاجر |
| `PAYMOB_INTEGRATION_ID` | رقم Payment Integration في حساب Paymob |
| `PAYMOB_HMAC_SECRET` | قيمة HMAC Secret من إعدادات Paymob |
| `SULY_PUBLIC_URL` | عنوان HTTPS العام للواجهة الأمامية، دون / في النهاية |

لا ترسل المفاتيح في المحادثة ولا تضفها إلى `.env.local` أو GitHub أو أي متغير يبدأ بـ `VITE_`.

بعد إضافة القيم، يقرأ `get-checkout-methods` حالة الإعداد تلقائيًا، ويظهر خيار Paymob في Checkout. لا تحتاج إلى إعادة نشر الدوال بعد ضبط Secrets.

## روابط Callback وRedirect
- Callback: `https://tihbrxbymkljhuyfoaio.supabase.co/functions/v1/paymob-webhook`
- Redirect: `SULY_PUBLIC_URL/store/{storeSlug}/order/{orderNumber}?token={publicToken}`

أدخل رابط Callback أعلاه في إعدادات تكامل Paymob عند الحاجة. يستخدم إنشاء الـ Intention عنوان Callback نفسه تلقائيًا، ويحدد Redirect من `SULY_PUBLIC_URL`.

## قيود مهمة
- التكامل الحالي يستخدم حساب Paymob واحدًا على مستوى مشروع Suly Plus؛ لا يوفّر بعد حساب تحصيل مستقلًا لكل متجر أو تحويل مستحقات.
- لا تفعّل حسابًا مشتركًا لتحصيل أموال تجار متعددين قبل موافقة Paymob على نموذج Marketplace/Submerchant وتسوية المستحقات.
- ابدأ باختبار بطاقة/Integration ID تجريبي في حساب Paymob. الحقول المستخدمة في HMAC يجب أن تطابق بنية Callback الفعلية؛ يتم رفض الحقول الناقصة بدل تخمين طريقة تحويل null إلى نص.
- لا تعتمد على Query Parameters الخاصة بصفحة Redirect في تغيير حالة الدفع. فقط HMAC-verified Webhook يغيّر `payment_status`.
- اختبر عمليات النجاح والرفض، إعادة إرسال Webhook، وعدم تطابق المبلغ/العملة قبل تفعيل الوضع Live.
