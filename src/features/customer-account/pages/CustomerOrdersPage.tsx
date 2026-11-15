import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, RefreshCw } from 'lucide-react';
import { getSupabase } from '../../../services/supabase/client';

interface CustomerOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}
interface CustomerOrder {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  created_at: string;
  store_name: string;
  store_slug: string;
  items: CustomerOrderItem[];
}

const orderStatusLabels: Record<string, string> = {
  pending: 'قيد الانتظار', confirmed: 'تم التأكيد', processing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', refunded: 'مسترد',
};
const paymentStatusLabels: Record<string, string> = {
  unpaid: 'غير مدفوع', pending: 'قيد الدفع', paid: 'مدفوع',
  failed: 'فشل الدفع', refunded: 'مسترد',
};
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

export function CustomerOrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadOrders(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const supabase = getSupabase();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setNeedsLogin(true);
        setOrders([]);
        return;
      }
      setNeedsLogin(false);
      const { data, error: invokeError } = await supabase.functions.invoke('get-my-orders', { method: 'GET' });
      if (invokeError) {
        const status = (invokeError as { context?: { status?: number } }).context?.status;
        if (status === 403) {
          setNeedsVerification(true);
          setOrders([]);
          return;
        }
        if (status === 401) {
          setNeedsLogin(true);
          setOrders([]);
          return;
        }
        throw new Error('تعذر تحميل سجل الطلبات. حاول مرة أخرى.');
      }
      if (!data?.ok || !Array.isArray(data.orders)) throw new Error('تعذر تحميل سجل الطلبات.');
      setNeedsVerification(false);
      setVerifiedEmail(String(data.verified_email ?? auth.user.email ?? ''));
      setOrders(data.orders as CustomerOrder[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تحميل الطلبات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadOrders(); }, []);

  return <main className="container-shell py-12">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-brand-600">حساب العميل</p><h1 className="mt-1 text-3xl font-bold">طلباتي</h1><p className="mt-2 text-sm text-slate-500">تتبع طلباتك التي أُنشئت باستخدام بريدك الإلكتروني المؤكد.</p></div>
      <button type="button" disabled={loading || refreshing} onClick={() => void loadOrders(true)} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16}/>{refreshing ? 'جارٍ التحديث...' : 'تحديث'}</button>
    </header>
    {error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل طلباتك...</div>
      : needsLogin ? <section className="rounded-2xl border bg-white p-8 text-center">
        <Package className="mx-auto mb-4 text-slate-400" size={32}/>
        <h2 className="text-xl font-bold">سجّل الدخول لعرض طلباتك</h2>
        <p className="mt-2 text-sm text-slate-500">استخدم نفس البريد الإلكتروني الذي كتبته عند إتمام الشراء.</p>
        <Link to="/login?next=%2Faccount%2Forders" className="btn-primary mt-6 inline-flex">تسجيل الدخول</Link>
        <p className="mt-4 text-sm text-slate-500">ليس لديك حساب؟ <Link to="/register?next=%2Faccount%2Forders" className="font-semibold text-brand-600">أنشئ حسابًا بهذا البريد</Link></p>
      </section> : needsVerification ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <h2 className="text-xl font-bold text-amber-950">أكد بريدك الإلكتروني أولًا</h2>
        <p className="mt-2 text-sm leading-7 text-amber-900">لحماية بيانات الطلبات، لا نعرض سجل الطلبات إلا بعد تأكيد ملكية البريد المرتبط بالطلبات من رابط التأكيد المرسل إليك.</p>
        <button type="button" onClick={() => void loadOrders(true)} className="mt-5 rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900">إعادة التحقق</button>
      </section> : <>
        <div className="mb-5 rounded-xl border bg-white px-4 py-3 text-sm text-slate-600">البريد المؤكد: <b dir="ltr">{verifiedEmail}</b> · آخر 50 طلبًا</div>
        {!orders.length ? <section className="rounded-2xl border bg-white p-10 text-center">
          <Package className="mx-auto mb-4 text-slate-400" size={32}/>
          <h2 className="text-xl font-bold">لا توجد طلبات مرتبطة بهذا البريد</h2>
          <p className="mt-2 text-sm text-slate-500">عند الشراء، استخدم البريد الإلكتروني نفسه المرتبط بحسابك.</p>
          <Link to="/" className="mt-5 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold">العودة للتسوق</Link>
        </section> : <div className="space-y-4">{orders.map(order => <article key={order.id} className="overflow-hidden rounded-2xl border bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-5">
            <div><p className="text-xs text-slate-500">طلب رقم</p><h2 className="mt-1 text-lg font-bold">#{order.order_number}</h2><p className="mt-1 text-xs text-slate-500">{order.store_name} · {new Date(order.created_at).toLocaleString('ar-EG')}</p></div>
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800">{orderStatusLabels[order.status] ?? order.status}</span><span className={order.payment_status === 'paid' ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800' : 'rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700'}>{paymentStatusLabels[order.payment_status] ?? order.payment_status}</span></div>
          </header>
          <div className="space-y-3 p-5">
            {(order.items ?? []).map((item,index) => <div key={index} className="flex flex-wrap items-center justify-between gap-3 text-sm"><div><b>{item.product_name}</b><p className="mt-1 text-xs text-slate-500">الكمية: {item.quantity} · سعر الوحدة: {money(Number(item.unit_price), order.currency)}</p></div><b>{money(Number(item.total_price), order.currency)}</b></div>)}
            <div className="grid gap-1 border-t pt-4 text-sm sm:max-w-xs sm:mr-auto">
              <div className="flex justify-between"><span className="text-slate-500">المنتجات</span><span>{money(Number(order.subtotal), order.currency)}</span></div>
              {Number(order.discount_total) > 0 && <div className="flex justify-between"><span className="text-slate-500">الخصم</span><span>-{money(Number(order.discount_total), order.currency)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">الشحن</span><span>{money(Number(order.shipping_total), order.currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">الضريبة</span><span>{money(Number(order.tax_total), order.currency)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>الإجمالي</span><span>{money(Number(order.total), order.currency)}</span></div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-slate-500"><span>طريقة الدفع: {order.payment_method === 'paymob' ? 'دفع إلكتروني' : 'الدفع عند الاستلام'}</span><Link to={`/store/${order.store_slug}`} className="font-semibold text-brand-600">زيارة المتجر</Link></footer>
          </div>
        </article>)}</div>}
      </>}
  </main>;
}
