import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../shared/components/PageHeader';
import { getSupabase } from '../../../services/supabase/client';

interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  monthly_price: number;
  yearly_price: number;
  max_products: number | null;
  max_team_members: number | null;
  max_monthly_orders: number | null;
  features: string[];
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}
function limit(value: number | null) {
  return value === null ? 'غير محدود' : value.toLocaleString('ar-EG');
}

export function PricingPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('subscription_plans')
          .select('id,code,name,description,currency,monthly_price,yearly_price,max_products,max_team_members,max_monthly_orders,features')
          .eq('is_active', true)
          .order('monthly_price', { ascending: true })
          .order('name', { ascending: true });
        if (queryError) throw new Error('تعذر تحميل الخطط المنشورة.');
        if (active) setPlans((data ?? []) as PublicPlan[]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الخطط.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  return <div className="container-shell py-16">
    <PageHeader title="الأسعار" description="خطط الاشتراك المنشورة حاليًا من إدارة المنصة."/>
    {error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل الخطط...</div>
      : plans.length ? <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => <article key={plan.id} className="flex flex-col rounded-3xl border bg-white p-7">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{plan.code}</p><h2 className="mt-2 text-2xl font-bold">{plan.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description || 'خطة لاستخدام منصة Suly Plus.'}</p></div>
          <div className="mt-6 border-b pb-5">
            <p className="text-2xl font-bold">{money(Number(plan.monthly_price), plan.currency)}<span className="text-xs font-normal text-slate-500"> / شهريًا</span></p>
            <p className="mt-2 text-sm text-slate-500">{money(Number(plan.yearly_price), plan.currency)} / سنويًا</p>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">المنتجات</span><b>{limit(plan.max_products)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">أعضاء الفريق شامل المالك</span><b>{limit(plan.max_team_members)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">الطلبات شهريًا</span><b>{limit(plan.max_monthly_orders)}</b></div>
          </div>
          {plan.features?.length > 0 && <ul className="mt-5 flex-1 space-y-2 border-t pt-5 text-sm text-slate-600">{plan.features.map((feature,index) => <li key={index} className="flex gap-2"><span className="text-emerald-600">✓</span><span>{feature}</span></li>)}</ul>}
          <Link to="/register" className="btn-primary mt-7 text-center">ابدأ إنشاء متجرك</Link>
        </article>)}
      </section> : <div className="mx-auto max-w-lg rounded-3xl border bg-white p-8 text-center"><h2 className="text-2xl font-bold">خطط تناسب نمو تجارتك</h2><p className="mt-3 text-sm leading-7 text-slate-500">لم تنشر إدارة المنصة خطط اشتراك بعد. لن يتم تحصيل رسوم من هذه الواجهة.</p><Link to="/register" className="btn-primary mt-7 inline-block">ابدأ إعداد متجرك</Link></div>}
    <p className="mt-8 text-center text-xs text-slate-400">عرض الأسعار لا يعني تنفيذ تحصيل أو تجديد تلقائي؛ ستُعلن آلية الدفع بعد ربط مزود الفوترة.</p>
  </div>;
}
