import { useEffect, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Order, Store } from '../../../domain/types';
import { orderRepository, storeRepository } from '../../../services/repositories/httpRepositories';

const labels: Record<Order['status'], string> = { pending: 'قيد الانتظار', paid: 'مدفوع', fulfilled: 'مكتمل', cancelled: 'ملغي' };
const money = (minor: number, currency: string) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(minor / 100);

export function OrdersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const availableStores = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(availableStores);
        if (!availableStores.length) { setLoading(false); return; }
        const selected = availableStores[0].id;
        setStoreId(selected);
        const result = await orderRepository.list(selected, 1);
        if (active) setOrders(result.items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id); setLoading(true); setError('');
    try { const result = await orderRepository.list(id, 1); setOrders(result.items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.'); }
    finally { setLoading(false); }
  }

  return <>
    <PageHeader title="الطلبات" description="تابع طلبات عملائك وحالة الدفع والتنفيذ." />
    {stores.length > 1 && <div className="mb-5 max-w-sm"><label htmlFor="orders-store" className="mb-2 block text-sm font-medium">المتجر</label><select id="orders-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={e => void changeStore(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك. أنشئ متجرًا أولًا.</div>}
    <div className="overflow-hidden rounded-2xl border bg-white"><div className="flex justify-between border-b p-5"><h2 className="font-bold">كل الطلبات</h2><span className="text-sm text-slate-500">{orders.length} طلب</span></div>
    {loading ? <p className="p-8 text-center text-slate-500">جارٍ تحميل الطلبات...</p> : orders.length ? <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">رقم الطلب</th><th className="p-4">التاريخ</th><th className="p-4">عدد المنتجات</th><th className="p-4">الإجمالي</th><th className="p-4">الحالة</th></tr></thead><tbody>{orders.map(o => <tr key={o.id} className="border-t"><td className="p-4 font-semibold">{o.id}</td><td className="p-4">{new Date(o.createdAt).toLocaleDateString('ar-EG')}</td><td className="p-4">{o.lines.reduce((n, line) => n + line.quantity, 0)}</td><td className="p-4">{money(o.totalMinor, o.currency)}</td><td className="p-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{labels[o.status]}</span></td></tr>)}</tbody></table></div> : <p className="p-10 text-center text-sm text-slate-500">لا توجد طلبات مسجلة في هذا المتجر حتى الآن.</p>}</div>
  </>;
}