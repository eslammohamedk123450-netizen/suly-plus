import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Store } from '../../../domain/types';
import { storeRepository } from '../../../services/repositories/supabaseRepositories';
import { getSupabase } from '../../../services/supabase/client';

interface Plan {
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
interface Subscription {
  id: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  billing_interval: 'monthly' | 'yearly' | 'manual';
  current_period_start: string;
  current_period_end: string | null;
  trial_end: string | null;
  subscription_plans: Plan | Plan[] | null;
}
interface Invoice {
  id: string;
  invoice_number: number;
  amount: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  memo: string | null;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  trialing: 'فترة تجريبية', active: 'نشط', past_due: 'متأخر السداد',
  cancelled: 'ملغي', suspended: 'موقوف', expired: 'منتهي', upcoming: 'لم يبدأ بعد',
};
const invoiceLabels: Record<string, string> = {
  draft: 'مسودة', open: 'مفتوحة', paid: 'مدفوعة', void: 'ملغاة', uncollectible: 'متعذر تحصيلها',
};
const intervalLabels: Record<string, string> = { monthly: 'شهري', yearly: 'سنوي', manual: 'يدوي' };
const formatMoney = (value: number, currency: string) => {
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
};
const limitText = (value: number | null | undefined) => value == null ? 'غير محدود' : value.toLocaleString('ar-EG');

export function SubscriptionPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [canViewInvoices, setCanViewInvoices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadStore(id: string) {
    setLoading(true); setError('');
    setSubscription(null); setInvoices([]); setCanViewInvoices(false);
    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('سجّل الدخول لعرض اشتراك المتجر.');

      const { data: membership, error: memberError } = await supabase.from('store_members')
        .select('role').eq('store_id', id).eq('user_id', authData.user.id).maybeSingle();
      if (memberError) throw memberError;
      if (!membership) throw new Error('لا تملك صلاحية الوصول إلى هذا المتجر.');

      const { data: subRow, error: subError } = await supabase.from('store_subscriptions')
        .select('id,status,billing_interval,current_period_start,current_period_end,trial_end,subscription_plans(name,description,currency,monthly_price,yearly_price,max_products,max_team_members,max_monthly_orders,features)')
        .eq('store_id', id).maybeSingle();
      if (subError) throw subError;
      const planValue = Array.isArray(subRow?.subscription_plans) ? subRow.subscription_plans[0] : subRow?.subscription_plans;
      if (subRow && planValue) setSubscription({ ...subRow, subscription_plans: planValue } as Subscription);

      const manager = membership.role === 'owner' || membership.role === 'admin';
      setCanViewInvoices(manager);
      if (manager) {
        const { data: invoiceRows, error: invoiceError } = await supabase.from('subscription_invoices')
          .select('id,invoice_number,amount,currency,status,due_at,paid_at,payment_reference,memo,created_at')
          .eq('store_id', id).order('created_at', { ascending: false }).limit(50);
        if (invoiceError) throw invoiceError;
        setInvoices((invoiceRows ?? []) as Invoice[]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات الاشتراك.');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (available.length) {
          setStoreId(available[0].id);
          await loadStore(available[0].id);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل المتاجر.');
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, []);

  const planValue = subscription?.subscription_plans;
  const plan = Array.isArray(planValue) ? planValue[0] : planValue;
  const currentStore = stores.find(store => store.id === storeId);
  const now = Date.now();
  const periodStart = subscription?.current_period_start ? Date.parse(subscription.current_period_start) : null;
  const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : null;
  const trialEnd = subscription?.trial_end ? Date.parse(subscription.trial_end) : null;
  const effectiveStatus = subscription
    ? (periodStart !== null && periodStart > now ? 'upcoming'
      : (periodEnd !== null && periodEnd <= now) ? 'expired'
      : (subscription.status === 'trialing' && (trialEnd === null || trialEnd <= now)) ? 'expired'
      : (subscription.status === 'active' && ['monthly','yearly'].includes(subscription.billing_interval) && periodEnd === null) ? 'expired'
      : subscription.status)
    : null;

  return <>
    <PageHeader title="اشتراك المتجر والفواتير" description="تابع الخطة الحالية وحدود الاستخدام والفواتير الصادرة لهذا المتجر." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="subscription-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="subscription-store" value={storeId} onChange={event => { setStoreId(event.target.value); void loadStore(event.target.value); }} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك.</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل الاشتراك والفواتير...</div>
      : stores.length > 0 && <>
        {!subscription || !plan ? <section className="rounded-2xl border bg-white p-7">
          <h2 className="text-xl font-bold">لم يتم تعيين خطة لهذا المتجر</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">إدارة المنصة لم تعيّن اشتراكًا لهذا المتجر حتى الآن. تواصل مع إدارة المنصة لمعرفة الخطط المتاحة وآلية الفوترة.</p>
          <Link to="/pricing" className="btn-primary mt-5 inline-flex">عرض الخطط المتاحة</Link>
        </section> : <>
          <section className="rounded-2xl border bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-sm text-slate-500">الخطة الحالية</p><h2 className="mt-1 text-2xl font-bold">{plan.name}</h2><p className="mt-2 text-sm text-slate-500">{plan.description}</p></div>
              <span className={effectiveStatus === 'active' || effectiveStatus === 'trialing' ? 'rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800' : 'rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800'}>{statusLabels[effectiveStatus ?? subscription.status] ?? subscription.status}</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">السعر الشهري</p><b className="mt-1 block text-lg">{formatMoney(Number(plan.monthly_price), plan.currency)}</b></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">السعر السنوي</p><b className="mt-1 block text-lg">{formatMoney(Number(plan.yearly_price), plan.currency)}</b></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">دورة الفوترة</p><b className="mt-1 block text-lg">{intervalLabels[subscription.billing_interval] ?? subscription.billing_interval}</b></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">نهاية الفترة الحالية</p><b className="mt-1 block text-lg">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString('ar-EG') : 'غير محددة'}</b></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">حد المنتجات</p><b className="mt-1 block">{limitText(plan.max_products)}</b></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">حد أعضاء الفريق شامل المالك</p><b className="mt-1 block">{limitText(plan.max_team_members)}</b></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-slate-500">حد الطلبات شهريًا</p><b className="mt-1 block">{limitText(plan.max_monthly_orders)}</b></div>
            </div>
            {plan.features?.length > 0 && <ul className="mt-6 grid gap-2 border-t pt-5 sm:grid-cols-2">{plan.features.map((feature,index) => <li key={index} className="text-sm text-slate-600">✓ {feature}</li>)}</ul>}
          </section>
        </>}
        {canViewInvoices && <section className="mt-7 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">فواتير {currentStore?.name ?? 'المتجر'}</h2><p className="mt-1 text-xs text-slate-500">عرض الفواتير متاح لمالك المتجر والمسؤول فقط.</p></div>
          {!invoices.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد فواتير صادرة لهذا المتجر حتى الآن.</p> : <div className="divide-y">{invoices.map(invoice => <article key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><b>فاتورة #{invoice.invoice_number}</b><p className="mt-1 text-sm text-slate-600">{formatMoney(Number(invoice.amount), invoice.currency)}</p><p className="mt-1 text-xs text-slate-400">{invoice.memo || 'فاتورة اشتراك'} · {new Date(invoice.created_at).toLocaleDateString('ar-EG')}</p>{invoice.payment_reference && <p className="mt-1 text-xs text-slate-500">مرجع السداد: {invoice.payment_reference}</p>}</div>
            <div className="text-left"><span className={invoice.status === 'paid' ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800' : 'rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800'}>{invoiceLabels[invoice.status] ?? invoice.status}</span>{invoice.due_at && <p className="mt-2 text-xs text-slate-400">استحقاق {new Date(invoice.due_at).toLocaleDateString('ar-EG')}</p>}</div>
          </article>)}</div>}
        </section>}
        {!canViewInvoices && <p className="mt-5 text-xs text-slate-400">فواتير المتجر التفصيلية يمكن للمالك والمسؤول فقط عرضها.</p>}
        <p className="mt-5 text-xs text-slate-400">تُسجل الفواتير حاليًا يدويًا من إدارة المنصة. لا يوجد خصم تلقائي أو تجديد آلي حتى ربط مزود فوترة.</p>
      </>}
  </>;
}
