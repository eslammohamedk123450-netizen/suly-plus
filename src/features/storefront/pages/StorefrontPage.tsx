import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Product, Store } from '../../../domain/types';
import { productRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';

export function StorefrontPage() {
  const { storeSlug = '' } = useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
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

  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل المتجر...</main>;
  if (error) return <main className="container-shell py-20 text-center text-red-600">{error}</main>;
  if (!store) return <main className="container-shell py-20 text-center"><h1 className="text-2xl font-bold">المتجر غير موجود</h1><Link to="/" className="mt-5 inline-block text-brand-600">العودة للرئيسية</Link></main>;

  return <main className="container-shell py-12">
    <header className="mb-10 text-center"><h1 className="text-3xl font-bold">{store.name}</h1><p className="mt-2 text-sm text-slate-500">تسوّق منتجاتنا</p></header>
    {products.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <article key={product.id} className="overflow-hidden rounded-2xl border bg-white">
      {product.images[0] ? <img src={product.images[0]} alt={product.name} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-slate-100 text-slate-400">لا توجد صورة</div>}
      <div className="p-5"><h2 className="font-bold">{product.name}</h2><p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p><p className="mt-4 font-bold">{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: product.currency }).format((product.variants[0]?.priceMinor ?? 0) / 100)}</p></div>
    </article>)}</div> : <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-500">لا توجد منتجات منشورة في هذا المتجر حاليًا.</div>}
  </main>;
}
