import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Save, Plus, RefreshCw, Receipt } from 'lucide-react';
import { getSupabase } from '../../../services/supabase/client';

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
type BillingInterval = 'monthly' | 'yearly' | 'manual';
interface Plan {
  id: string; code: string; name: string; description: string | null; currency: string;
  monthly_price: number; yearly_price: number; max_products: number | null;
  max_team_members: number | null; max_monthly_orders: number | null;
  features: string[]; is_active: boolean;
}
interface StoreOption { id: string; name: string; slug: string; is_active: boolean }
interface Subscription {
  id: string; store_id: string; plan_id: string; status: SubscriptionStatus;
  billing_interval: BillingInterval; current_period_start: string; current_period_end: string | null;
  trial_end: string | null; cancel_at_period_end: boolean;
  stores: { name: string; slug: string } | null;
  subscription_plans: { name: string; code: string } | null;
}
interface Invoice {
  id: string; invoice_number: number; store_id: string; amount: number; currency: string;
  status: string; due_at: string | null; paid_at: string | null; memo: string | null;
  payment_reference: string | null; stores: { name: string; slug: string } | null;
}
interface BillingData { plans: Plan[]; stores: StoreOption[]; subscriptions: Subscription[]; invoices: Invoice[] }

const statusLabels: Record<SubscriptionStatus, string> = {
  trialing: 'فترة تجريبية', active: 'نشط', past_due: 'متأخر السداد',
  cancelled: 'ملغي', suspended: 'موقوف',
};
const invoiceLabels: Record<string, string> = {
  draft: 'مسودة', open: 'مفتوحة', paid: 'مدفوعة', void: 'ملغاة', uncollectible: 'متعذر تحصيلها',
};
const intervalLabels: Record<BillingInterval, string> = { monthly: 'شهري', yearly: 'سنوي', manual: 'يدوي' };

function numericLimit(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

export function AdminBillingPage() {
  const [data, setData] = useState<BillingData>({ plans: [], stores: [], subscriptions: [], invoices: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [monthlyPrice, setMonthlyPrice] = useState('0');
  const [yearlyPrice, setYearlyPrice] = useState('0');
  const [maxProducts, setMaxProducts] = useState('');
  const [maxTeamMembers, setMaxTeamMembers] = useState('');
  const [maxMonthlyOrders, setMaxMonthlyOrders] = useState('');
  const [features, setFeatures] = useState('');

  const [assignStoreId, setAssignStoreId] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignStatus, setAssignStatus] = useState<SubscriptionStatus>('trialing');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('manual');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [trialEnd, setTrialEnd] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [invoiceStoreId, setInvoiceStoreId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceCurrency, setInvoiceCurrency] = useState('EGP');
  const [invoiceDue, setInvoiceDue] = useState('');
  const [invoicePeriodStart, setInvoicePeriodStart] = useState('');
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState('');
  const [invoiceMemo, setInvoiceMemo] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: response, error: invokeError } = await getSupabase().functions.invoke('platform-admin-billing', { method: 'GET' });
      if (invokeError) {
        const status = (invokeError as { context?: { status?: number } }).context?.status;
        throw new Error(status === 403 ? 'ليس لديك صلاحية مدير المنصة.' : 'تعذر تحميل بيانات الفوترة.');
      }
      if (!response?.ok) throw new Error('تعذر تحميل بيانات الفوترة.');
      setData({
        plans: Array.isArray(response.plans) ? response.plans : [],
        stores: Array.isArray(response.stores) ? response.stores : [],
        subscriptions: Array.isArray(response.subscriptions) ? response.subscriptions : [],
        invoices: Array.isArray(response.invoices) ? response.invoices : [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تحميل الفوترة.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function resetPlan() {
    setEditingId(null); setName(''); setCode(''); setDescription('');
    setCurrency('EGP'); setMonthlyPrice('0'); setYearlyPrice('0');
    setMaxProducts(''); setMaxTeamMembers(''); setMaxMonthlyOrders(''); setFeatures('');
  }

  function editPlan(plan: Plan) {
    setEditingId(plan.id); setName(plan.name); setCode(plan.code);
    setDescription(plan.description ?? ''); setCurrency(plan.currency);
    setMonthlyPrice(String(plan.monthly_price)); setYearlyPrice(String(plan.yearly_price));
    setMaxProducts(plan.max_products === null ? '' : String(plan.max_products));
    setMaxTeamMembers(plan.max_team_members === null ? '' : String(plan.max_team_members));
    setMaxMonthlyOrders(plan.max_monthly_orders === null ? '' : String(plan.max_monthly_orders));
    setFeatures((plan.features ?? []).join('\n'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function invokeAction(body: Record<string, unknown>, successMessage: string) {
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: response, error: invokeError } = await getSupabase().functions.invoke('platform-admin-billing', { method: 'POST', body });
      if (invokeError || !response?.ok) {
        const status = (invokeError as { context?: { status?: number } } | null)?.context?.status;
        if (status === 403) throw new Error('ليس لديك صلاحية تنفيذ هذا الإجراء.');
        throw new Error(typeof response?.error === 'string' ? response.error : 'تعذر تنفيذ الإجراء.');
      }
      setNotice(successMessage);
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تنفيذ الإجراء.');
      return false;
    } finally { setSaving(false); }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const productLimit = numericLimit(maxProducts);
    const teamLimit = numericLimit(maxTeamMembers);
    const orderLimit = numericLimit(maxMonthlyOrders);
    if ([productLimit, teamLimit, orderLimit].some(value => Number.isNaN(value))) {
      setError('حدود الخطة يجب أن تكون أعدادًا صحيحة غير سالبة، أو اتركها فارغة لغير المحدود.');
      return;
    }
    const ok = await invokeAction({
      action: 'save_plan', id: editingId, name, code, description, currency,
      monthly_price: Number(monthlyPrice), yearly_price: Number(yearlyPrice),
      max_products: productLimit, max_team_members: teamLimit, max_monthly_orders: orderLimit,
      features: features.split('\n').map(item => item.trim()).filter(Boolean),
    }, editingId ? 'تم تحديث الخطة.' : 'تم إنشاء الخطة.');
    if (ok) resetPlan();
  }

  async function setPlanActive(plan: Plan) {
    await invokeAction({ action: 'set_plan_active', id: plan.id, is_active: !plan.is_active },
      plan.is_active ? 'تم إيقاف الخطة؛ الاشتراكات الحالية لا تتغير تلقائيًا.' : 'تم تفعيل الخطة.');
  }

  async function assignSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignStoreId || !assignPlanId) { setError('اختر المتجر والخطة أولًا.'); return; }
    await invokeAction({
      action: 'assign_subscription', store_id: assignStoreId, plan_id: assignPlanId,
      status: assignStatus, billing_interval: billingInterval,
      current_period_start: periodStart ? new Date(periodStart).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
      trial_end: trialEnd ? new Date(trialEnd).toISOString() : null,
      admin_notes: adminNotes,
    }, 'تم حفظ الاشتراك أو تحديثه.');
  }

  async function updateSubscriptionStatus(subscription: Subscription, status: SubscriptionStatus) {
    await invokeAction({ action: 'update_subscription_status', id: subscription.id, status }, 'تم تحديث حالة الاشتراك.');
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoiceStoreId) { setError('اختر المتجر أولًا.'); return; }
    await invokeAction({
      action: 'create_invoice', store_id: invoiceStoreId, amount: Number(invoiceAmount),
      currency: invoiceCurrency,
      due_at: invoiceDue ? new Date(invoiceDue).toISOString() : null,
      period_start: invoicePeriodStart || null, period_end: invoicePeriodEnd || null,
      memo: invoiceMemo,
    }, 'تم إنشاء الفاتورة اليدوية.');
    setInvoiceAmount(''); setInvoiceDue(''); setInvoicePeriodStart(''); setInvoicePeriodEnd(''); setInvoiceMemo('');
  }

  async function markPaid(invoice: Invoice) {
    if (!window.confirm(`تأكيد تسجيل الفاتورة #${invoice.invoice_number} كمدفوعة؟ لا يُعد ذلك تحصيلًا آليًا من بوابة دفع.`)) return;
    const reference = window.prompt('رقم مرجعي للتحويل أو الإيصال (اختياري):');
    if (reference === null) return;
    await invokeAction({ action: 'mark_invoice_paid', invoice_id: invoice.id, payment_reference: reference.trim() }, 'تم تسجيل الفاتورة كمدفوعة يدويًا.');
  }

  return <main className="container-shell py-10">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-brand-600">Suly Plus / Admin</p><h1 className="mt-1 text-3xl font-bold">الخطط والاشتراكات والفواتير</h1><p className="mt-2 text-sm text-slate-500">إدارة باقات المنصة وتخصيص الاشتراكات ومتابعة الفواتير.</p></div>
      <Link to="/admin" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><ArrowRight size={16}/>العودة للإدارة</Link>
    </header>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-amber-50 p-4 text-sm text-amber-900">
      <p>هذه إدارة يدوية للخطط والفواتير. لا يتم خصم أموال أو تجديد اشتراكات تلقائيًا حتى ربط مزود فوترة والتحقق من webhooks.</p>
      <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold"><RefreshCw size={14}/>تحديث</button>
    </div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل بيانات الخطط والفوترة...</div>
      : <>
        <section className="mb-8 rounded-2xl border bg-white p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{editingId ? 'تعديل خطة' : 'إنشاء خطة اشتراك'}</h2><p className="mt-1 text-sm text-slate-500">الأسعار والحدود تُحدد هنا. اترك الحد فارغًا ليكون غير محدود.</p></div>{editingId && <button type="button" onClick={resetPlan} className="rounded-xl border px-3 py-2 text-sm">إلغاء التعديل</button>}</div>
          <form onSubmit={savePlan} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium">اسم الخطة<input required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">رمز الخطة<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={40} value={code} onChange={event => setCode(event.target.value.toLowerCase())} placeholder="starter" className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">العملة<input required pattern="[A-Za-z]{3}" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border p-3 uppercase"/></label>
            <label className="text-sm font-medium">السعر الشهري<input required type="number" min="0" step="0.01" value={monthlyPrice} onChange={event => setMonthlyPrice(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">السعر السنوي<input required type="number" min="0" step="0.01" value={yearlyPrice} onChange={event => setYearlyPrice(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">حد المنتجات<input type="number" min="0" step="1" value={maxProducts} onChange={event => setMaxProducts(event.target.value)} placeholder="فارغ = غير محدود" className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">حد أعضاء الفريق (شامل المالك)<input type="number" min="1" step="1" value={maxTeamMembers} onChange={event => setMaxTeamMembers(event.target.value)} placeholder="فارغ = غير محدود" className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">حد الطلبات الشهرية<input type="number" min="0" step="1" value={maxMonthlyOrders} onChange={event => setMaxMonthlyOrders(event.target.value)} placeholder="فارغ = غير محدود" className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium md:col-span-2 xl:col-span-3">وصف مختصر<textarea rows={2} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium md:col-span-2 xl:col-span-3">المميزات (ميزة في كل سطر)<textarea rows={3} value={features} onChange={event => setFeatures(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <div className="md:col-span-2 xl:col-span-3"><button disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"><Save size={16}/>{saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إنشاء الخطة'}</button></div>
          </form>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">باقات المنصة ({data.plans.length})</h2>
          {!data.plans.length ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">لم يتم إنشاء خطط بعد. أضف أول خطة من النموذج.</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.plans.map(plan => <article key={plan.id} className="rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{plan.name}</h3><p className="mt-1 font-mono text-xs text-slate-400">{plan.code}</p></div><span className={plan.is_active ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700' : 'rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500'}>{plan.is_active ? 'نشطة' : 'متوقفة'}</span></div>
            <p className="mt-4 text-xl font-bold">{money(Number(plan.monthly_price), plan.currency)}<span className="text-xs font-normal text-slate-500"> / شهر</span></p>
            <p className="mt-1 text-sm text-slate-500">{money(Number(plan.yearly_price), plan.currency)} / سنة</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-50 p-2"><b>{plan.max_products ?? '∞'}</b><p className="mt-1 text-slate-500">منتج</p></div><div className="rounded-lg bg-slate-50 p-2"><b>{plan.max_team_members ?? '∞'}</b><p className="mt-1 text-slate-500">عضو</p></div><div className="rounded-lg bg-slate-50 p-2"><b>{plan.max_monthly_orders ?? '∞'}</b><p className="mt-1 text-slate-500">طلب/شهر</p></div></div>
            {plan.description && <p className="mt-3 text-sm text-slate-600">{plan.description}</p>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => editPlan(plan)} className="flex-1 rounded-xl border px-3 py-2 text-sm font-semibold">تعديل</button><button type="button" disabled={saving} onClick={() => void setPlanActive(plan)} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50">{plan.is_active ? 'إيقاف' : 'تفعيل'}</button></div>
          </article>)}</div>}
        </section>

        <section className="mb-8 rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold">تخصيص اشتراك لمتجر</h2>
          <form onSubmit={assignSubscription} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium">المتجر<select required value={assignStoreId} onChange={event => setAssignStoreId(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">اختر متجرًا</option>{data.stores.map(store => <option key={store.id} value={store.id}>{store.name} ({store.slug})</option>)}</select></label>
            <label className="text-sm font-medium">الخطة<select required value={assignPlanId} onChange={event => setAssignPlanId(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">اختر خطة مفعلة</option>{data.plans.filter(plan => plan.is_active).map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {money(Number(plan.monthly_price), plan.currency)}/شهر</option>)}</select></label>
            <label className="text-sm font-medium">الحالة<select value={assignStatus} onChange={event => setAssignStatus(event.target.value as SubscriptionStatus)} className="mt-2 w-full rounded-xl border bg-white p-3">{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">دورة الفوترة<select value={billingInterval} onChange={event => setBillingInterval(event.target.value as BillingInterval)} className="mt-2 w-full rounded-xl border bg-white p-3">{Object.entries(intervalLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">بداية الفترة<input type="datetime-local" value={periodStart} onChange={event => setPeriodStart(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">نهاية الفترة<input type="datetime-local" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">نهاية التجربة<input type="datetime-local" value={trialEnd} onChange={event => setTrialEnd(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium md:col-span-2">ملاحظات إدارية<input maxLength={1000} value={adminNotes} onChange={event => setAdminNotes(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <div className="md:col-span-2 xl:col-span-3"><button disabled={saving || !data.plans.some(plan => plan.is_active)} className="btn-primary disabled:opacity-50">حفظ الاشتراك / تحديثه</button></div>
          </form>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">اشتراكات المتاجر ({data.subscriptions.length})</h2></div>
          {!data.subscriptions.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد اشتراكات مخصصة حتى الآن.</p> : <div className="divide-y">{data.subscriptions.map(subscription => <article key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><b>{subscription.stores?.name ?? 'متجر'}</b><p className="mt-1 text-sm text-slate-500">{subscription.subscription_plans?.name ?? 'خطة'} · {intervalLabels[subscription.billing_interval]}</p><p className="mt-1 text-xs text-slate-400">{subscription.current_period_end ? `تنتهي ${new Date(subscription.current_period_end).toLocaleDateString('ar-EG')}` : 'لا يوجد تاريخ نهاية محدد'}</p></div>
            <select aria-label={`حالة اشتراك ${subscription.stores?.name ?? ''}`} value={subscription.status} disabled={saving} onChange={event => void updateSubscriptionStatus(subscription, event.target.value as SubscriptionStatus)} className="rounded-xl border bg-white px-3 py-2 text-sm">{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
          </article>)}</div>}
        </section>

        <section className="mb-8 rounded-2xl border bg-white p-6">
          <div className="mb-4 flex items-center gap-2"><Receipt size={18}/><h2 className="text-lg font-bold">إنشاء فاتورة يدوية</h2></div>
          <form onSubmit={createInvoice} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium">المتجر<select required value={invoiceStoreId} onChange={event => setInvoiceStoreId(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">اختر متجرًا</option>{data.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
            <label className="text-sm font-medium">المبلغ<input type="number" required min="0" step="0.01" value={invoiceAmount} onChange={event => setInvoiceAmount(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">العملة<input required pattern="[A-Za-z]{3}" maxLength={3} value={invoiceCurrency} onChange={event => setInvoiceCurrency(event.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border p-3 uppercase"/></label>
            <label className="text-sm font-medium">موعد الاستحقاق<input type="datetime-local" value={invoiceDue} onChange={event => setInvoiceDue(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">بداية فترة الفاتورة<input type="date" value={invoicePeriodStart} onChange={event => setInvoicePeriodStart(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium">نهاية فترة الفاتورة<input type="date" value={invoicePeriodEnd} onChange={event => setInvoicePeriodEnd(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <label className="text-sm font-medium md:col-span-2 xl:col-span-3">ملاحظات الفاتورة<textarea rows={2} maxLength={1000} value={invoiceMemo} onChange={event => setInvoiceMemo(event.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
            <div className="md:col-span-2 xl:col-span-3"><button disabled={saving} className="btn-primary disabled:opacity-50">إنشاء الفاتورة</button></div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">الفواتير ({data.invoices.length})</h2></div>
          {!data.invoices.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد فواتير بعد.</p> : <div className="divide-y">{data.invoices.map(invoice => <article key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><b>فاتورة #{invoice.invoice_number}</b><p className="mt-1 text-sm text-slate-500">{invoice.stores?.name ?? 'متجر'} · {money(Number(invoice.amount), invoice.currency)}</p><p className="mt-1 text-xs text-slate-400">{invoiceLabels[invoice.status] ?? invoice.status}{invoice.due_at ? ` · استحقاق ${new Date(invoice.due_at).toLocaleDateString('ar-EG')}` : ''}</p>{invoice.payment_reference && <p className="mt-1 text-xs text-slate-500">مرجع: {invoice.payment_reference}</p>}</div>
            {invoice.status === 'open' && <button type="button" disabled={saving} onClick={() => void markPaid(invoice)} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">تسجيل السداد يدويًا</button>}
          </article>)}</div>}
        </section>
      </>}
  </main>;
}
