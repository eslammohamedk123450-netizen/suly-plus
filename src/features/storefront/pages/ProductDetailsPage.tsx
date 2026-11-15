import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Store } from '../../../domain/types';
import { checkoutRepository, storeRepository, type CheckoutCartProduct } from '../../../services/repositories/supabaseRepositories';
import { addCartItem, readCart } from '../cart';

const money = (amount: number, currency: string) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amount);

export function ProductDetailsPage() {
  const { storeSlug = '', productId = '' } = useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [product, setProduct] = useState<CheckoutCartProduct | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  useEffect(() => {
    let active = true;
    setCartCount(readCart(storeSlug).reduce((sum, line) => sum + line.quantity, 0));
    async function load() {
      setLoading(true); setError('');
      try {
        const found = await storeRepository.getBySlug(storeSlug);
        if (!active) return;
        setStore(found);
        if (!found) return;
        const items = await checkoutRepository.getProducts(found.id, [productId]);
        if (active) setProduct(items[0] ?? null);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل المنتج.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storeSlug, productId]);
  function add() {
    for (let index = 0; index < quantity; index += 1) addCartItem(storeSlug, productId);
    setCartCount(readCart(storeSlug).reduce((sum, line) => sum + line.quantity, 0));
    setAdded(true);
  }
  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل المنتج...</main>;
  if (error) return <main className="container-shell py-20 text-center text-red-600">{error}</main>;
  if (!store || !product) return <main className="container-shell py-20 text-center"><h1 className="text-2xl font-bold">المنتج غير متاح</h1><Link to={'/store/' + storeSlug} className="mt-4 inline-block text-brand-600">العودة للمتجر</Link></main>;
  const maxQuantity = product.track_inventory ? Math.max(0, Math.min(100, product.stock_quantity)) : 100;
  return <main className="container-shell max-w-6xl py-10">
    <div className="mb-6 flex items-center justify-between"><Link to={'/store/' + storeSlug} className="text-sm text-brand-600">العودة للمتجر</Link><Link to={'/store/' + storeSlug + '/cart'} className="text-sm text-brand-600">السلة ({cartCount})</Link></div>
    <div className="grid gap-8 rounded-2xl border bg-white p-5 md:grid-cols-2 md:p-8"><section>
      {product.images[selectedImage] ? <img src={product.images[selectedImage]} alt={product.name} className="aspect-square w-full rounded-2xl bg-slate-50 object-contain" /> : <div className="grid aspect-square place-items-center rounded-2xl bg-slate-100 text-slate-400">لا توجد صورة للمنتج</div>}
      {product.images.length > 1 && <div className="mt-3 flex flex-wrap gap-3">{product.images.map((url, index) => <button type="button" key={url} onClick={() => setSelectedImage(index)} aria-label={'عرض الصورة ' + (index + 1)} aria-pressed={selectedImage === index} className={'overflow-hidden rounded-xl border-2 ' + (selectedImage === index ? 'border-brand-600' : 'border-transparent')}><img src={url} alt="" className="h-20 w-20 object-cover" /></button>)}</div>}
    </section><section className="flex flex-col"><h1 className="text-3xl font-bold">{product.name}</h1>
      <p className="mt-4 whitespace-pre-wrap leading-8 text-slate-600">{product.description || 'لا يوجد وصف لهذا المنتج.'}</p>
      <p className="mt-6 text-2xl font-bold">{money(product.price, store.currency)}</p>
      {product.track_inventory && <p className={'mt-2 text-sm ' + (product.stock_quantity > 0 ? 'text-emerald-700' : 'text-red-600')}>{product.stock_quantity > 0 ? 'متوفر: ' + product.stock_quantity : 'غير متوفر حاليًا'}</p>}
      <div className="mt-6 flex items-center gap-3"><label htmlFor="product-quantity" className="text-sm font-medium">الكمية</label><input id="product-quantity" type="number" min="1" max={maxQuantity} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(maxQuantity || 1, Number(event.target.value) || 1)))} className="w-24 rounded-xl border p-3" /></div>
      <button type="button" onClick={add} disabled={maxQuantity === 0 || quantity > maxQuantity} className="btn-primary mt-6 w-full disabled:opacity-50">أضف إلى السلة</button>
      {added && <div role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">تمت إضافة المنتج إلى السلة. <Link to={'/store/' + storeSlug + '/cart'} className="font-semibold underline">عرض السلة</Link></div>}
      <p className="mt-auto pt-8 text-xs text-slate-500">السعر المعروض لا يشمل رسوم الشحن أو الضرائب إن وجدت.</p>
    </section></div></main>;
}