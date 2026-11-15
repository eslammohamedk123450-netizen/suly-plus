import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Store } from '../../../domain/types';
import { checkoutRepository, storeRepository, type CheckoutCartProduct } from '../../../services/repositories/supabaseRepositories';
import { clearCart, readCart, writeCart, type CartLine } from '../cart';

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amount);

export function CheckoutPage() {
  const { storeSlug = '' } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<CheckoutCartProduct[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const savedCart = readCart(storeSlug);
    setCart(savedCart);
    async function load() {
      setLoading(true); setError('');
      try {
        const found = await storeRepository.getBySlug(storeSlug);
        if (!active) return;
        setStore(found);
        if (!found) return;
        if (!savedCart.length) return;
        const result = await checkoutRepository.getProducts(found.id, savedCart.map(line => line.productId));
        if (active) setProducts(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات السلة.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storeSlug]);

  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const availableLines = cart.map(line => ({ ...line, product: productMap.get(line.productId) })).filter(line => Boolean(line.product));
  const subtotal = availableLines.reduce((sum, line) => sum + (line.product?.price ?? 0) * line.quantity, 0);
  const missingProducts = cart.length !== availableLines.length;
  const stockExceeded = availableLines.some(line => line.product?.track_inventory && line.product.stock_quantity < line.quantity);

  function changeQuantity(productId: string, quantity: number) {
    const next = quantity < 1
      ? cart.filter(line => line.productId !== productId)
      : cart.map(line => line.productId === productId ? { ...line, quantity: Math.min(100, quantity) } : line);
    setCart(next);
    writeCart(storeSlug, next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store || !cart.length || missingProducts || stockExceeded) return;
    setSubmitting(true); setError('');
    try {
      const order = await checkoutRepository.createGuestOrder({
        store_slug: store.slug,
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim(),
        shipping_address: {
          address: address.trim(),
          city: city.trim(),
          governorate: governorate.trim(),
          postal_code: postalCode.trim(),
        },
        items: cart.map(line => ({ product_id: line.productId, quantity: line.quantity })),
        payment_method: 'cash_on_delivery',
        notes: notes.trim(),
      });
      clearCart(storeSlug);
      setCart([]);
      navigate(`/store/${storeSlug}/order/${order.order_number}?token=${encodeURIComponent(order.public_token)}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الطلب.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل السلة...</main>;
  if (!store) return <main className="container-shell py-20 text-center">المتجر غير متاح.</main>;

  return <main className="container-shell max-w-5xl py-10">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><div><Link to={`/store/${storeSlug}`} className="text-sm text-brand-600">العودة إلى المتجر</Link><h1 className="mt-3 text-3xl font-bold">إتمام الطلب</h1><p className="mt-2 text-sm text-slate-500">{store.name}</p></div><span className="rounded-full bg-slate-100 px-4 py-2 text-sm">الدفع عند الاستلام</span></div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!cart.length && <div className="rounded-2xl border bg-white p-10 text-center"><h2 className="font-bold">سلتك فارغة</h2><Link to={`/store/${storeSlug}`} className="btn-primary mt-5 inline-block">تصفح المنتجات</Link></div>}
    {cart.length > 0 && <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-white p-6">
        <section><h2 className="text-lg font-bold">بيانات العميل</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">الاسم بالكامل<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="name" /></label>
          <label className="text-sm font-medium">رقم الهاتف<input required type="tel" minLength={8} maxLength={24} value={phone} onChange={e => setPhone(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="tel" /></label>
          <label className="text-sm font-medium sm:col-span-2">البريد الإلكتروني<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="email" /></label>
        </div></section>
        <section><h2 className="text-lg font-bold">عنوان الشحن</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">العنوان بالتفصيل<input required minLength={5} maxLength={500} value={address} onChange={e => setAddress(e.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="الشارع، رقم العقار، علامة مميزة" autoComplete="street-address" /></label>
          <label className="text-sm font-medium">المحافظة<input required value={governorate} onChange={e => setGovernorate(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="address-level1" /></label>
          <label className="text-sm font-medium">المدينة / المركز<input required value={city} onChange={e => setCity(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="address-level2" /></label>
          <label className="text-sm font-medium">الرمز البريدي (اختياري)<input value={postalCode} onChange={e => setPostalCode(e.target.value)} className="mt-2 w-full rounded-xl border p-3" autoComplete="postal-code" /></label>
        </div></section>
        <section><h2 className="text-lg font-bold">ملاحظات الطلب</h2><textarea rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className="mt-3 w-full rounded-xl border p-3" placeholder="أي تفاصيل إضافية للتوصيل (اختياري)" /></section>
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">سيتم تأكيد الطلب والدفع نقدًا عند الاستلام. لا يتم تحصيل أي مبلغ إلكتروني حاليًا.</div>
        <button disabled={submitting || missingProducts || stockExceeded} className="btn-primary w-full disabled:opacity-50">{submitting ? 'جارٍ تسجيل الطلب...' : 'تأكيد الطلب'}</button>
      </form>
      <aside className="h-fit rounded-2xl border bg-white p-6"><h2 className="text-lg font-bold">ملخص الطلب</h2>
        <div className="mt-5 space-y-4">{availableLines.map(line => <div key={line.productId} className="flex items-start justify-between gap-4 border-b pb-3 text-sm"><div className="min-w-0"><p className="font-medium">{line.product?.name}</p><div className="mt-2 flex items-center gap-2"><button type="button" aria-label="تقليل الكمية" onClick={() => changeQuantity(line.productId, line.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md border">−</button><span className="min-w-5 text-center">{line.quantity}</span><button type="button" aria-label="زيادة الكمية" onClick={() => changeQuantity(line.productId, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md border" disabled={line.quantity >= 100}>+</button><button type="button" onClick={() => changeQuantity(line.productId, 0)} className="mr-2 text-xs text-red-600">حذف</button></div></div><b className="whitespace-nowrap">{money((line.product?.price ?? 0) * line.quantity, store.currency)}</b></div>)}</div>
        {missingProducts && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">أحد المنتجات لم يعد متاحًا. ارجع للمتجر وحدّث السلة.</p>}
        {availableLines.some(line => line.product?.track_inventory && line.product.stock_quantity < line.quantity) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">بعض الكميات أكبر من المخزون المتاح؛ سيُعاد التحقق عند إرسال الطلب.</p>}
        <div className="mt-6 flex justify-between border-t pt-5"><span className="font-semibold">الإجمالي</span><strong className="text-xl">{money(subtotal, store.currency)}</strong></div>
        <p className="mt-2 text-xs text-slate-500">الشحن والضرائب غير مضافين حاليًا؛ سيظهر المبلغ النهائي الذي يحسبه الخادم في الطلب.</p>
      </aside>
    </div>}
  </main>;
}
