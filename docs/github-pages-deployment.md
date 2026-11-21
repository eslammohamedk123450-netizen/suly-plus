# نشر Suly Plus على GitHub Pages

## ما الذي ينشره GitHub Pages؟

GitHub Pages يستضيف الواجهة الأمامية الثابتة فقط. تظل المصادقة وقاعدة PostgreSQL وStorage وEdge Functions على مشروع Supabase الحالي:
`tihbrxbymkljhuyfoaio`.

رابط الموقع المتوقع للمستودع:
`https://eslammohamedk123450-netizen.github.io/suly-plus/`

## إعداد أول مرة مطلوب من مالك المستودع

1. افتح مستودع GitHub ثم Settings → Pages.
2. ضمن Build and deployment اختر Source = GitHub Actions.
3. لا تستخدم نشر فرع `gh-pages` أو Jekyll؛ سير العمل `.github/workflows/deploy-pages.yml` يبني Vite ويرفع مجلد `dist`.
4. بعد أول نشر، تحقق من رابط `github-pages` في صفحة Actions.

## إعداد Supabase Auth بعد ظهور رابط Pages

من Supabase Dashboard → Authentication → URL Configuration:

- اضبط Site URL على `https://eslammohamedk123450-netizen.github.io/suly-plus/`.
- أضف رابط Pages ضمن Additional Redirect URLs، ويمكن إضافة النمط `https://eslammohamedk123450-netizen.github.io/suly-plus/**` إذا كان مطلوبًا للمسارات الداخلية.
- احتفظ بعنوان مشروع Supabase الحالي ومفتاح Publishable فقط في إعدادات الواجهة.

لا يستطيع سير عمل GitHub ضبط إعدادات Authentication في مشروع Supabase تلقائيًا؛ يجب تأكيد هذه القيم يدويًا بعد النشر الأول. لم ينفذ هذا التغيير على مشروع Supabase.

## إعدادات عامة وأسرار

- يعتمد البناء على `.env.example` الذي يحتوي على عنوان Supabase ومفتاح Publishable المخصص للمتصفح فقط.
- لا تضف `service_role` أو مفاتيح Paymob إلى متغيرات Vite أو مستودع GitHub.
- احتفظ بأسرار Paymob داخل Supabase Edge Function Secrets.
- بعد اعتماد رابط الموقع، راجع قيمة `SULY_PUBLIC_URL` في إعدادات Edge Functions يدويًا عند الحاجة.
- GitHub Pages لا يستضيف API أو مهام خادم؛ هذه الوظائف تبقى على Supabase.

## التحقق بعد النشر

1. افتح الصفحة الرئيسية ورابطًا داخليًا مثل `/login` ثم حدّث الصفحة؛ يجب أن يعيد ملف `404.html` المسار إلى تطبيق React.
2. اختبر التسجيل وتأكيد البريد وتسجيل الدخول بعد ضبط Site URL وRedirect URLs.
3. اختبر إنشاء متجر ورفع صورة منتج وإنشاء طلب تجريبي بحسابات اختبار.
4. اختبر عزل متجرين وحساب Admin وحساب Merchant وحساب Customer قبل فتح التسجيل التجاري.

هذا النشر تجريبي حتى اجتياز اختبارات المصادقة والصلاحيات والطلبات والدفع والأداء. إعداد Paymob الحالي ليس إعداد Marketplace متعدد التجار، ولا ينبغي استخدام حساب تحصيل واحد لأموال عدة تجار دون اعتماد مزود الدفع والتسوية.
