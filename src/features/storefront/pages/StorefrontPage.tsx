import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Category, Product } from '../../../domain/types';
import { categoryRepository, productRepository } from '../../../services/repositories/supabaseRepositories';
import { storeAppearanceRepository, type StoreAppearance } from '../../store-design/storeAppearanceRepository';
import { addCartItem, readCart } from '../cart';

type PublicStore = Pick<StoreAppearance, 'id'|'name'|'slug'|'currency'|'description'|'logoUrl'>;

export function StorefrontPage() {
  const { storeSlug = '' } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<PublicStore | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest'|'price_asc'|'price_desc'|'name'>('newest');
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setCartCount(readCart(storeSlug).reduce((sum, line) => sum + line.quantity, 0));
    async function load() {
      setLoading(true); setError('');
      try {
        const found = await storeAppearanceRepository.getPublicBySlug(storeSlug);
        if (!active) return;
        setStore(found);
        if (found) {
          const [productResult, categoryResult] = await Promise.all([
            productRepository.list(found.id, 1),
            categoryRepository.list(found.id),
          ]);
          if (active) {
            setProducts(productResult.items.filter(product => product.status === 'active'));
            setTotalProducts(productResult.total);
            setPage(productResult.page);
            setCategories(categoryResult.filter(category => category.isActive));
            setActiveCategoryId('');
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل المتجر.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storeSlug]);

  const visibleProducts = activeCategoryId
    ? products.filter(product => product.categoryId === activeCategoryId)
    : products;

  function add(productId: string) {
    const cart = addCartItem(storeSlug, productId);
    setCartCount(cart.reduce((sum, line) => sum + line.quantity, 0));
  }

  if (loading) return <main className="container-shell py-20 text-center text-slate-500">جارٍ تحميل المتجر...</main>;
  if (error) return <main className="container-shell py-20 text-center text-red-600">{error}</main>;
  if (!store) return <main className="container-shell py-20 text-center"><h1 className="text-2xl font-bold">المتجر غير موجود</h1><Link to="/" className="mt-5 inline-block text-brand-600">العودة للرئيسية</Link></main>;

  return <main className="container-shell py-12">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {store.logoUrl && <img src={store.logoUrl} alt={`شعار ${store.name}`} className="h-16 w-16 rounded-xl border bg-white object-contain p-1" />}
        <div className="text-center sm:text-right">
          <h1 className="text-3xl font-bold">{store.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{store.description || 'تسوّق منتجاتنا'}</p>
        </div>
      </div>
      <button onClick={() => navigate(`/store/${storeSlug}/cart`)} className="btn-primary">السلة ({cartCount})</button>
    </header>
    <section className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
      <input aria-label="البحث عن منتج" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن منتج بالاسم أو الوصف..." className="w-full rounded-xl border bg-white p-3 text-sm" />
      <select aria-label="ترتيب المنتجات" value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="rounded-xl border bg-white p-3 text-sm">
        <option value="newest">الأحدث أولًا</option><option value="price_asc">السعر: من الأقل للأعلى</option><option value="price_desc">السعر: من الأعلى للأقل</option><option value="name">الاسم: أ-ي</option>
      </select>
    </section>
    {categories.length > 0 && <nav aria-label="تصنيفات المنتجات" className="mb-8 flex flex-wrap gap-2">
      <button type="button" onClick={() => setActiveCategoryId('')} aria-pressed={!activeCategoryId}
        className={`rounded-full border px-4 py-2 text-sm font-medium ${!activeCategoryId ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>كل المنتجات</button>
      {categories.map(category => <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} aria-pressed={activeCategoryId === category.id}
        className={`rounded-full border px-4 py-2 text-sm font-medium ${activeCategoryId === category.id ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{category.name}</button>)}
    </nav>}
    {visibleProducts.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleProducts.map(product => <article key={product.id} className="overflow-hidden rounded-2xl border bg-white">
      {product.images[0] ? <img src={product.images[0]} alt={product.name} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-slate-100 text-slate-400">لا توجد صورة</div>}
      <div className="p-5"><Link to={`/store/${storeSlug}/product/${product.id}`} className="font-bold hover:text-brand-600">{product.name}</Link><p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p><p className="mt-4 font-bold">{new Intl.NumberFormat('ar-EG', { style: 'currency', currency: product.currency }).format((product.variants[0]?.priceMinor ?? 0) / 100)}</p><div className="mt-4 grid grid-cols-2 gap-2"><Link to={`/store/${storeSlug}/product/${product.id}`} className="rounded-xl border px-3 py-2 text-center text-sm font-semibold">التفاصيل</Link><button onClick={() => add(product.id)} className="btn-primary">أضف للسلة</button></div></div>
    </article>)}</div> : <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-500">{activeCategoryId ? 'لا توجد منتجات منشورة في هذا التصنيف.' : 'لا توجد منتجات منشورة في هذا المتجر حاليًا.'}</div>}
  </main>;
}
