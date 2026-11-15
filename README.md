# Suly Plus

منصة تجارة إلكترونية متعددة المتاجر (Multi-tenant SaaS) بواجهة عربية RTL، مبنية باستخدام React وTypeScript وSupabase.

## التقنية
- React 18 + TypeScript + Vite 6
- Supabase PostgreSQL وAuth وStorage وRow Level Security
- React Router 6 وTailwind CSS 3
- Vitest + Testing Library

## تشغيل المشروع محليًا
1. ثبّت Node.js LTS وGit.
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

## ما تم ربطه
- التسجيل وتسجيل الدخول والخروج عبر Supabase Auth.
- إنشاء المتجر وربطه تلقائيًا بصاحبه كمالك.
- بيانات المتاجر والمنتجات والعملاء والطلبات من PostgreSQL.
- صفحة متجر عامة تقرأ المتجر والمنتجات المنشورة.
- صور المتاجر والمنتجات في Storage bucket باسم `store-assets`.
- سياسات RLS لعزل بيانات كل متجر حسب العضوية والدور.

## الأمان
- المفتاح الموجود في الواجهة هو Publishable Key فقط، والوصول للصفوف محكوم بسياسات RLS.
- لا تضع أبدًا `service_role` أو Secret Key في ملفات `VITE_*` أو في المتصفح.
- إنشاء الطلبات العامة والدفع والشحن والإشعارات لم يتم تفعيله بعد؛ يجب تنفيذه عبر Edge Functions موثوقة مع التحقق من الأسعار والمخزون ومزودي الدفع.

## قاعدة البيانات
مشروع Supabase: `tihbrxbymkljhuyfoaio` — المنطقة `eu-west-1`.
