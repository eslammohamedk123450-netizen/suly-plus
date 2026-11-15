import { useEffect, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Order, OrderStatus, OrderStatusHistory, Store } from '../../../domain/types';
import { orderRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';

const statusLabels: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار', confirmed: 'تم التأكيد', processing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', refunded: 'مسترد',
};
const paymentLabels: Record<string, string> = {
  unpaid: 'غير مدفوع', pending: 'الدفع قيد المعالجة', paid: 'مدفوع',
  failed: 'فشل الدفع', refunded: 'تم الاسترداد',
};
const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
};
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(minor / 100);

export function OrdersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, OrderStatusHistory[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  async function loadOrders(id: string) {
    const result = await orderRepository.list(id, 1);
    setOrders(result.items);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const availableStores = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(availableStores);
        if (!availableStores.length) return;
        setStoreId(availableStores[0].id);
        const result = await orderRepository.list(availableStores[0].id, 1);
        if (active) setOrders(result.items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id);
    setLoading(true);
    setError('');
    setNotice('');
    setHistory({});
    setExpanded(null);
    try { await loadOrders(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.'); }
    finally { setLoading(false); }
  }

  async function updateStatus(order: Order, nextStatus: OrderStatus) {
    setSaving(order.id);
    setError('');
    setNotice('');
    try {
      await orderRepository.updateStatus(storeId, order.id, nextStatus, notes[order.id] ?? '');
      await loadOrders(storeId);
      setNotes(current => ({ ...current, [order.id]: '' }));
      setNotice(`تم تحديث الطلب #${order.orderNumber} إلى: ${statusLabels[nextStatus]}.`);
      if (expanded === order.id) {
        const entries = await orderRepository.listStatusHistory(storeId, order.id);
        setHistory(current => ({ ...current, [order.id]: entries }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة الطلب.');
    } finally { setSaving(null); }
  }

  async function toggleHistory(order: Order) {
    if (expanded === order.id) { setExpanded(null); return; }
    setExpanded(order.id);
    setHistoryLoading(order.id);
    try {
      const entries = await orderRepository.listStatusHistory(storeId, order.id);
      setHistory(current => ({ ...current, [order.id]: entries }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل سجل الطلب.');
    } finally { setHistoryLoading(null); }
  }

  return <>
    <PageHeader title="الطلبات" description="إدارة دورة تنفيذ الطلبات ومتابعة الدفع وسجل التغييرات." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="orders-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="orders-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={e => void changeStore(e.target.value)}>
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك. أنشئ متجرًا أولًا.</div>}
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b p-5">
        <h2 className="font-bold">كل الطلبات</h2>
        <span className="text-sm text-slate-500">{orders.length} من الطلبات المعروضة</span>
      </div>
      {loading ? <p className="p-8 text-center text-slate-500">جارٍ تحميل الطلبات...</p> :
        orders.length ? <div className="divide-y">
          {orders.map(order => {
            const next = transitions[order.status] ?? [];
            const address = order.shippingAddress;
            const addressText = [address.address, address.city, address.governorate, address.postal_code]
              .filter(value => typeof value === 'string' && value.trim()).join('، ');
            return <article key={order.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">طلب #{order.orderNumber}</h3>
                  <p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString('ar-EG')}</p>
                  <p className="mt-2 text-sm">{order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</p>
                  {addressText && <p className="mt-1 text-sm text-slate-500">{String(addressText)}</p>}
                </div>
                <div className="text-left">
                  <p className="font-bold">{money(order.totalMinor, order.currency)}</p>
                  <p className="mt-1 text-xs text-slate-500">الدفع: {paymentLabels[order.paymentStatus] ?? order.paymentStatus}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{statusLabels[order.status]}</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800">{order.paymentMethod === 'paymob' ? 'Paymob' : 'الدفع عند الاستلام'}</span>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs">{order.lines.reduce((sum, line) => sum + line.quantity, 0)} قطعة</span>
              </div>
              <div className="mt-3 space-y-1">
                {order.lines.map((line, index) => <div key={`${line.productId}-${index}`} className="flex justify-between gap-3 text-sm text-slate-600">
                  <span>{line.name} × {line.quantity}</span><span>{money(line.unitPriceMinor * line.quantity, order.currency)}</span>
                </div>)}
              </div>
              {next.length > 0 && <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <label className="mb-2 block text-xs font-semibold text-slate-600" htmlFor={`note-${order.id}`}>ملاحظة داخلية (اختيارية)</label>
                <input id={`note-${order.id}`} value={notes[order.id] ?? ''} onChange={e => setNotes(current => ({ ...current, [order.id]: e.target.value }))}
                  maxLength={500} placeholder="مثال: تم التواصل مع العميل..." className="mb-3 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  {next.filter(status => status !== 'cancelled' || ['unpaid', 'failed'].includes(order.paymentStatus)).map(status =>
                    <button key={status} type="button" disabled={saving === order.id} onClick={() => void updateStatus(order, status)}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-900 text-white'}`}>
                      {saving === order.id ? 'جارٍ الحفظ...' : status === 'cancelled' ? 'إلغاء الطلب' : statusLabels[status]}
                    </button>
                  )}
                </div>
              </div>}
              <button type="button" onClick={() => void toggleHistory(order)} className="mt-3 text-sm font-semibold text-slate-700 underline underline-offset-4">
                {expanded === order.id ? 'إخفاء سجل التغييرات' : 'عرض سجل التغييرات'}
              </button>
              {expanded === order.id && <div className="mt-3 rounded-xl border p-3">
                <h4 className="mb-2 text-sm font-bold">سجل حالة الطلب</h4>
                {historyLoading === order.id ? <p className="text-sm text-slate-500">جارٍ تحميل السجل...</p> :
                  history[order.id]?.length ? <ol className="space-y-2">
                    {history[order.id].map(entry => <li key={entry.id} className="border-r-2 border-slate-200 pr-3 text-sm">
                      <p>{statusLabels[entry.previousStatus]} ← {statusLabels[entry.newStatus]}</p>
                      {entry.note && <p className="text-slate-500">{entry.note}</p>}
                      <p className="text-xs text-slate-400">{new Date(entry.changedAt).toLocaleString('ar-EG')}</p>
                    </li>)}
                  </ol> : <p className="text-sm text-slate-500">لا توجد تغييرات مسجلة لهذا الطلب بعد.</p>}
              </div>}
            </article>;
          })}
        </div> : <p className="p-10 text-center text-sm text-slate-500">لا توجد طلبات مسجلة في هذا المتجر حتى الآن.</p>}
    </div>
  </>;
}