import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Store } from '../../../domain/types';
import { checkoutRepository, storeRepository, type CheckoutCartProduct, type CheckoutQuote } from '../../../services/repositories/supabaseRepositories';
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
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'paymob'>('cash_on_delivery');
  const [paymentMethods, setPaymentMethods] = useState({ cash_on_delivery: true, paymob: false });
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponMessage, setCouponMessage] = useState('');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
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
        const [found, methods] = await Promise.all([
          storeRepository.getBySlug(storeSlug),
          checkoutRepository.getPaymentMethods(storeSlug),
        ]);
        if (!active) return;
        setStore(found);
        setPaymentMethods(methods);
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


  useEffect(() => {
    let active = true;
    if (!store || !cart.length || !products.length || cart.some(line => !products.some(product => product.id === line.productId))) {
      setQuote(null);
      setQuoteLoading(false);
      return () => { active = false; };
    }
    setQuote(null);
    setQuoteLoading(true);
    checkoutRepository.getCheckoutQuote(
      store.slug,
      cart.map(line => ({ product_id: line.productId, quantity: line.quantity })),
      appliedCouponCode || undefined,
    ).then(nextQuote => {
      if (!active) return;
      setQuote(nextQuote);
      setCouponMessage(appliedCouponCode ? `تم تطبيق الكوبون ${appliedCouponCode}.` : '');
      setError('');
    }).catch(cause => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : 'تعذر حساب إجمالي الطلب.';
      setCouponMessage(message);
      if (!appliedCouponCode) setError(message);
    }).finally(() => {
      if (active) setQuoteLoading(false);
    });
    return () => { active = false; };
  }, [store, cart, products, appliedCouponCode]);

  function applyCoupon() {
    const normalized = couponInput.trim().toUpperCase();
    setCouponMessage(normalized ? 'جارٍ التحقق من الكوبون...' : 'اكتب كود الخصم أولًا.');
    if (normalized) setAppliedCouponCode(normalized);
  }

  function removeCoupon() {
    setAppliedCouponCode('');
    setCouponInput('');
    setCouponMessage('تم إلغاء الكوبون.');
  }

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
        payment_method: paymentMethod,
        notes: notes.trim(),
        coupon_code: appliedCouponCode || null,
      });
      clearCart(storeSlug);
      setCart([]);
      if (paymentMethod === 'paymob') {
        if (!order.checkout_url) throw new Error('لم يرجع خادم الدفع رابط التحويل الآمن.');
        window.location.assign(order.checkout_url);
        return;
      }
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
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><div><Link to={`/store/${storeSlug}`} className="text-sm text-brand-600">العودة إلى المتجر</Link><h1 className="mt-3 text-3xl font-bold">إتمام الطلب</h1><p className="mt-2 text-sm text-slate-500">{store.name}</p></div><span className="rounded-full bg-slate-100 px-4 py-2 text-sm">إتمام آمن للطلب</span></div>
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
        <section><h2 className="text-lg font-bold">طريقة الدفع</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${paymentMethod === 'cash_on_delivery' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="payment-method" value="cash_on_delivery" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} className="mt-1" />
              <span><b className="block text-sm">الدفع عند الاستلام</b><span className="mt-1 block text-xs text-slate-500">ادفع نقدًا عند وصول الطلب.</span></span>
            </label>
            <label className={`flex items-start gap-3 rounded-xl border p-4 ${paymentMethods.paymob ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${paymentMethod === 'paymob' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="payment-method" value="paymob" checked={paymentMethod === 'paymob'} disabled={!paymentMethods.paymob} onChange={() => setPaymentMethod('paymob')} className="mt-1" />
              <span><b className="block text-sm">الدفع الإلكتروني عبر Paymob</b><span className="mt-1 block text-xs text-slate-500">{paymentMethods.paymob ? 'بطاقة أو وسيلة الدفع المفعّلة بحساب التاجر.' : 'غير متاح حتى يضبط صاحب المنصة بيانات حساب Paymob في Supabase.'}</span></span>
            </label>
          </div>
        </section>
        <section><h2 className="text-lg font-bold">ملاحظات الطلب</h2><textarea rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className="mt-3 w-full rounded-xl border p-3" placeholder="أي تفاصيل إضافية للتوصيل (اختياري)" /></section>
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{paymentMethod === 'paymob' ? 'سيتم تحويلك إلى صفحة Paymob الآمنة. حالة الدفع ستتحدث بعد وصول التأكيد الموثوق من بوابة الدفع.' : 'ستدفع نقدًا عند استلام الطلب. لا يتم تحصيل أي مبلغ إلكتروني.'}</div>
        <button disabled={submitting || quoteLoading || !quote || missingProducts || stockExceeded || (paymentMethod === 'paymob' && !paymentMethods.paymob)} className="btn-primary w-full disabled:opacity-50">{submitting ? 'جارٍ تسجيل الطلب...' : paymentMethod === 'paymob' ? 'المتابعة إلى الدفع الإلكتروني' : 'تأكيد الطلب'}</button>
      </form>
      <aside className="h-fit rounded-2xl border bg-white p-6"><h2 className="text-lg font-bold">ملخص الطلب</h2>
        <div className="mt-5 space-y-4">{availableLines.map(line => <div key={line.productId} className="flex items-start justify-between gap-4 border-b pb-3 text-sm"><div className="min-w-0"><p className="font-medium">{line.product?.name}</p><div className="mt-2 flex items-center gap-2"><button type="button" aria-label="تقليل الكمية" onClick={() => changeQuantity(line.productId, line.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md border">−</button><span className="min-w-5 text-center">{line.quantity}</span><button type="button" aria-label="زيادة الكمية" onClick={() => changeQuantity(line.productId, line.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md border" disabled={line.quantity >= 100}>+</button><button type="button" onClick={() => changeQuantity(line.productId, 0)} className="mr-2 text-xs text-red-600">حذف</button></div></div><b className="whitespace-nowrap">{money((line.product?.price ?? 0) * line.quantity, store.currency)}</b></div>)}</div>
        {missingProducts && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">أحد المنتجات لم يعد متاحًا. ارجع للمتجر وحدّث السلة.</p>}
        {availableLines.some(line => line.product?.track_inventory && line.product.stock_quantity < line.quantity) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">بعض الكميات أكبر من المخزون المتاح؛ سيُعاد التحقق عند إرسال الطلب.</p>}
        <div className="mt-5 border-t pt-5">
          <label htmlFor="checkout-coupon" className="text-sm font-semibold">كود الخصم</label>
          <div className="mt-2 flex gap-2">
            <input id="checkout-coupon" value={couponInput} onChange={event => setCouponInput(event.target.value.toUpperCase())}
              maxLength={40} placeholder="اكتب الكود" className="min-w-0 flex-1 rounded-xl border px-3 py-2 font-mono uppercase" />
            <button type="button" onClick={applyCoupon} disabled={quoteLoading || !cart.length}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">تطبيق</button>
            {appliedCouponCode && <button type="button" onClick={removeCoupon} className="rounded-xl border px-3 py-2 text-sm">إزالة</button>}
          </div>
          {couponMessage && <p role="status" className={`mt-2 text-xs ${quote?.coupon_code ? 'text-emerald-700' : 'text-slate-500'}`}>{couponMessage}</p>}
        </div>
        <div className="mt-5 space-y-3 border-t pt-5 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">قيمة المنتجات</span><span>{money(quote?.subtotal ?? subtotal, store.currency)}</span></div>
          {(quote?.discount_total ?? 0) > 0 && <div className="flex justify-between text-emerald-700"><span>الخصم{quote?.coupon_code ? ` (${quote.coupon_code})` : ''}</span><span>−{money(quote?.discount_total ?? 0, store.currency)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-600">الشحن</span><span>{quote ? quote.shipping_total === 0 ? 'مجاني' : money(quote.shipping_total, store.currency) : '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">الضريبة {quote && quote.tax_rate > 0 ? `(${quote.tax_rate}%)` : ''}</span><span>{quote ? money(quote.tax_total, store.currency) : '—'}</span></div>
          <div className="flex justify-between border-t pt-4 text-base"><span className="font-bold">الإجمالي النهائي</span>
            <strong className="text-xl">{quote ? money(quote.total, store.currency) : quoteLoading ? 'جارٍ الحساب...' : '—'}</strong>
          </div>
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-500">السعر المعروض هنا محسوب من قاعدة البيانات. يعيد الخادم التحقق من أسعار المنتجات والمخزون والكوبون والشحن والضريبة عند تأكيد الطلب.</p>
      </aside>
    </div>}
  </main>;
}
