import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Package, Users, Wallet, AlertTriangle, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../../shared/components/PageHeader';
import { storeRepository, dashboardRepository, type StoreDashboardSummary } from '../../../services/repositories/supabaseRepositories';
import type { Store } from '../../../domain/types';

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار', confirmed: 'تم التأكيد', processing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', refunded: 'مسترد',
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value);
}

export function DashboardPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [summary, setSummary] = useState<StoreDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const availableStores = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(availableStores);
        if (!availableStores.length) return;
        const selected = availableStores[0];
        setStoreId(selected.id);
        const result = await dashboardRepository.getSummary(selected.id);
        if (active) setSummary(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات لوحة التحكم.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function selectStore(id: string) {
    setStoreId(id);
    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const result = await dashboardRepository.getSummary(id);
      setSummary(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات المتجر.');
    } finally {
      setLoading(false);
    }
  }

  const currency = stores.find(store => store.id === storeId)?.currency ?? 'EGP';
  const cards = summary ? [
    { label: 'المبيعات المحصلة', value: money(summary.sales_collected, currency), Icon: Wallet, hint: 'الطلبات المدفوعة فقط' },
    { label: 'كل الطلبات', value: summary.orders_count.toLocaleString('ar-EG'), Icon: ShoppingBag, hint: 'جميع حالات الطلب' },
    { label: 'المنتجات النشطة', value: summary.products_count.toLocaleString('ar-EG'), Icon: Package, hint: 'باستثناء المنتجات المؤرشفة' },
    { label: 'العملاء', value: summary.customers_count.toLocaleString('ar-EG'), Icon: Users, hint: 'عملاء هذا المتجر' },
  ] : [];

  return <>
    <PageHeader title="نظرة عامة" description="ملخص مباشر لأداء متجرك وطلباتك ومخزونك." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="dashboard-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="dashboard-store" value={storeId} onChange={event => void selectStore(event.target.value)} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل بيانات المتجر...</div>
      : !stores.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
        <h2 className="font-bold">لا يوجد متجر مرتبط بحسابك</h2>
        <p className="mt-2 text-sm text-slate-500">أنشئ متجرًا أولًا لعرض مؤشرات الأداء.</p>
        <Link to="/dashboard/products" className="btn-primary mt-5 inline-flex">إدارة المنتجات</Link>
      </div>
      : summary && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, Icon, hint }) => <div key={label} className="rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon className="text-brand-600" size={20} /></div>
            <p className="mt-4 text-2xl font-bold" dir="auto">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>)}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">أحدث الطلبات</h2>
              <Link to="/dashboard/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">كل الطلبات <ArrowLeft size={15}/></Link>
            </div>
            {summary.recent_orders.length ? <div className="divide-y">
              {summary.recent_orders.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold">طلب #{order.order_number}</p><p className="mt-1 text-xs text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleDateString('ar-EG')}</p></div>
                <div className="text-left"><p className="font-semibold">{money(Number(order.total), order.currency)}</p><p className="mt-1 text-xs text-slate-500">{statusLabels[order.status] ?? order.status}</p></div>
              </div>)}
            </div> : <p className="py-8 text-center text-sm text-slate-500">لا توجد طلبات حتى الآن.</p>}
          </div>
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-2"><AlertTriangle className="text-amber-600" size={20}/><h2 className="font-bold">تنبيهات المخزون</h2></div>
            <p className="mt-5 text-3xl font-bold">{summary.low_stock_count.toLocaleString('ar-EG')}</p>
            <p className="mt-1 text-sm text-slate-500">منتج نشط رصيده 5 قطع أو أقل</p>
            <Link to="/dashboard/inventory" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">إدارة المخزون <ArrowLeft size={15}/></Link>
          </div>
        </div>
      </>}
  </>;
}