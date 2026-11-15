import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { checkoutRepository, type PublicOrderStatus } from '../../../services/repositories/supabaseRepositories';

const statusLabels: Record<string, string> = {
  pending: 'قيد التأكيد',
  confirmed: 'تم التأكيد',
  processing: 'جارٍ التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  refunded: 'مسترد',
};

export function OrderTrackingPage() {
  const { storeSlug = '', orderNumber = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    checkoutRepository.getOrderStatus(Number(orderNumber), token)
      .then(value => { if (active) setOrder(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلب.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderNumber, token]);

  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل الطلب...</main>;
  return <main className="container-shell max-w-2xl py-14">
    <div className="rounded-3xl border bg-white p-8">
      {error || !order ? <><h1 className="text-2xl font-bold">تعذر العثور على الطلب</h1><p className="mt-3 text-sm text-slate-500">{error || 'رابط التتبع غير صالح.'}</p></> : <>
        <div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-700">✓</div><h1 className="mt-4 text-2xl font-bold">تم تسجيل طلبك</h1><p className="mt-2 text-sm text-slate-500">احتفظ برقم الطلب ورابط التتبع.</p></div>
        <div className="mt-7 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5"><div><p className="text-xs text-slate-500">رقم الطلب</p><b className="mt-1 block">#{order.order_number}</b></div><div><p className="text-xs text-slate-500">الحالة</p><b className="mt-1 block">{statusLabels[order.status] ?? order.status}</b></div></div>
        <h2 className="mt-7 font-bold">تفاصيل المنتجات</h2><div className="mt-3 space-y-3">{order.items.map((item, i) => <div key={i} className="flex justify-between gap-4 border-b pb-3 text-sm"><span>{item.name} × {item.quantity}</span><b>{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: order.currency }).format(item.total_price)}</b></div>)}</div>
        <div className="mt-5 flex justify-between text-lg"><span className="font-bold">الإجمالي</span><strong>{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: order.currency }).format(order.total)}</strong></div>
        <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">طريقة الدفع: نقدًا عند الاستلام. لم يتم تحصيل أي مبلغ إلكتروني.</p>
      </>}
      <Link to={`/store/${storeSlug}`} className="btn-primary mt-7 block text-center">العودة إلى المتجر</Link>
    </div>
  </main>;
}
