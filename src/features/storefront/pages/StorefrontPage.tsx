import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Product, Store } from '../../../domain/types';
import { productRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';
import { addCartItem, readCart } from '../cart';

export function StorefrontPage() {
  const { storeSlug = '' } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setCartCount(readCart(storeSlug).reduce((sum, line) => sum + line.quantity, 0));
    async function load() {
      setLoading(true); setError('');
      try {
        const found = await storeRepository.getBySlug(storeSlug);
        if (!active) return;
        setStore(found);
        if (found) {
          const result = await productRepository.list(found.id, 1);
          if (active) setProducts(result.items.filter(product => product.status === 'active'));
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل المتجر.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storeSlug]);

  function add(productId: string) {
    const cart = addCartItem(storeSlug, productId);
    setCartCount(cart.reduce((sum, line) => sum + line.quantity, 0));
  }

  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل المتجر...</main>;
  if (error) return <main className="container-shell py-20 text-center text-red-600">{error}</main>;
  if (!store) return <main className="container-shell py-20 text-center"><h1 className="text-2xl font-bold">المتجر غير موجود</h1><Link to="/" className="mt-5 inline-block text-brand-600">العودة للرئيسية</Link></main>;

  return <main className="container-shell py-12">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <div className="text-center sm:text-right"><h1 className="text-3xl font-bold">{store.name}</h1><p className="mt-2 text-sm text-slate-500">تسوّق منتجاتنا</p></div>
      <button onClick={() => navigate(`/store/${storeSlug}/checkout`)} className="btn-primary">السلة ({cartCount}) وإتمام الطلب</button>
    </header>
    {products.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <article key={product.id} className="overflow-hidden rounded-2xl border bg-white">
      {product.images[0] ? <img src={product.images[0]} alt={product.name} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-slate-100 text-slate-400">لا توجد صورة</div>}
      <div className="p-5"><h2 className="font-bold">{product.name}</h2><p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p><p className="mt-4 font-bold">{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: product.currency }).format((product.variants[0]?.priceMinor ?? 0) / 100)}</p><button onClick={() => add(product.id)} className="btn-primary mt-4 w-full">أضف إلى السلة</button></div>
    </article>)}</div> : <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-500">لا توجد منتجات منشورة في هذا المتجر حاليًا.</div>}
  </main>;
}
