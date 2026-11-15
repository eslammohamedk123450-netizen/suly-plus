import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Store } from '../../../domain/types';
import { checkoutRepository, storeRepository, type CheckoutCartProduct } from '../../../services/repositories/supabaseRepositories';
import { readCart, writeCart, type CartLine } from '../cart';

const money = (amount: number, currency: string) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amount);

export function CartPage() {
  const { storeSlug = '' } = useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<CheckoutCartProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const current = readCart(storeSlug);
    setCart(current);
    async function load() {
      setLoading(true); setError('');
      try {
        const found = await storeRepository.getBySlug(storeSlug);
        if (!active) return;
        setStore(found);
        if (found && current.length) {
          const result = await checkoutRepository.getProducts(found.id, current.map(line => line.productId));
          if (active) setProducts(result);
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل السلة.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storeSlug]);
  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const lines = cart.map(line => ({ ...line, product: productMap.get(line.productId) }));
  const subtotal = lines.reduce((sum, line) => sum + (line.product?.price ?? 0) * line.quantity, 0);
  const unavailable = lines.some(line => !line.product);
  function update(productId: string, quantity: number) {
    const next = quantity < 1 ? cart.filter(line => line.productId !== productId) : cart.map(line => line.productId === productId ? { ...line, quantity: Math.min(100, quantity) } : line);
    setCart(next); writeCart(storeSlug, next);
  }
  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل سلتك...</main>;
  if (!store) return <main className="container-shell py-20 text-center">المتجر غير متاح.</main>;
  return <main className="container-shell max-w-5xl py-10">
    <div className="mb-8"><Link to={'/store/' + storeSlug} className="text-sm text-brand-600">متابعة التسوق</Link><h1 className="mt-3 text-3xl font-bold">سلة المشتريات</h1><p className="mt-2 text-sm text-slate-500">{store.name}</p></div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!cart.length ? <div className="rounded-2xl border bg-white p-12 text-center"><h2 className="text-xl font-bold">سلتك فارغة</h2><p className="mt-2 text-sm text-slate-500">ابدأ بإضافة المنتجات التي تريد شراءها.</p><Link to={'/store/' + storeSlug} className="btn-primary mt-5 inline-block">تصفح المنتجات</Link></div> :
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]"><section className="space-y-3">
        {lines.map(line => <article key={line.productId} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4">
          {line.product?.images[0] ? <img src={line.product.images[0]} alt={line.product.name} className="h-24 w-24 rounded-xl object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">لا توجد صورة</div>}
          <div className="min-w-0 flex-1"><h2 className="font-bold">{line.product?.name ?? 'منتج غير متاح'}</h2>
            {line.product && <p className="mt-1 text-sm text-slate-500">{money(line.product.price, store.currency)} للقطعة</p>}
            <div className="mt-3 flex items-center gap-2"><button type="button" aria-label="تقليل الكمية" onClick={() => update(line.productId, line.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-lg border">−</button><span className="min-w-6 text-center">{line.quantity}</span><button type="button" aria-label="زيادة الكمية" disabled={!line.product || line.quantity >= 100} onClick={() => update(line.productId, line.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-lg border disabled:opacity-40">+</button><button type="button" onClick={() => update(line.productId, 0)} className="mr-2 text-xs text-red-600">إزالة</button></div>
            {line.product?.track_inventory && line.product.stock_quantity < line.quantity && <p className="mt-2 text-xs text-amber-700">المتاح حاليًا: {line.product.stock_quantity}</p>}
          </div>{line.product && <b className="text-sm">{money(line.product.price * line.quantity, store.currency)}</b>}
        </article>)}
        {unavailable && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">بعض المنتجات لم تعد متاحة. أزلها من السلة للمتابعة.</div>}
      </section><aside className="h-fit rounded-2xl border bg-white p-6"><h2 className="font-bold">ملخص السلة</h2>
        <div className="mt-5 flex justify-between border-b pb-4 text-sm"><span>عدد القطع</span><span>{cart.reduce((sum, line) => sum + line.quantity, 0)}</span></div>
        <div className="mt-4 flex justify-between"><span className="font-semibold">الإجمالي المبدئي</span><b className="text-lg">{money(subtotal, store.currency)}</b></div>
        <p className="mt-3 text-xs text-slate-500">لا يشمل الشحن أو الضرائب أو الخصومات. سيتم تأكيد الإجمالي عند إتمام الطلب.</p>
        <Link to={'/store/' + storeSlug + '/checkout'} aria-disabled={unavailable} className={'mt-6 block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white ' + (unavailable ? 'pointer-events-none opacity-50' : '')}>إتمام الطلب</Link>
      </aside></div>}
  </main>;
}