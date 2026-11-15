import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Product, Store } from '../../../domain/types';
import { productRepository, storeRepository } from '../../../services/repositories/httpRepositories';

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amountMinor / 100);
}

export function ProductsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [status, setStatus] = useState<'draft' | 'active'>('draft');

  const activeStore = useMemo(() => stores.find((store) => store.id === storeId) ?? null, [stores, storeId]);

  const loadProducts = useCallback(async (selectedStoreId: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await productRepository.list(selectedStoreId, 1);
      setProducts(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المنتجات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStores() {
      setLoading(true);
      setError('');
      try {
        const result = await storeRepository.listForCurrentUser();
        if (cancelled) return;
        setStores(result);
        if (result.length) {
          setStoreId(result[0].id);
          await loadProducts(result[0].id);
        } else {
          setProducts([]);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'تعذر تحميل متاجرك. سجّل الدخول أولًا.');
          setLoading(false);
        }
      }
    }
    void loadStores();
    return () => { cancelled = true; };
  }, [loadProducts]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStore) return;
    const numericPrice = Number(price);
    const numericQuantity = Number(quantity);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(numericQuantity) || numericQuantity < 0) {
      setError('أدخل اسمًا صحيحًا وسعرًا أكبر من صفر وكمية مخزون صحيحة.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const created = await productRepository.create(activeStore.id, {
        kind: 'physical',
        name: name.trim(),
        description: description.trim(),
        images: [],
        currency: activeStore.currency,
        status,
        options: [],
        variants: [{ id: '', sku: '', options: {}, priceMinor: Math.round(numericPrice * 100), inventoryQuantity: numericQuantity }],
      });
      setProducts((current) => [created, ...current]);
      setName('');
      setDescription('');
      setPrice('');
      setQuantity('0');
      setStatus('draft');
      setShowForm(false);
      setSuccess('تم حفظ المنتج بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المنتج. تحقق من اتصال الخادم.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="المنتجات"
        description="أضف منتجاتك المادية وتابع أسعارها ومخزونها."
        action={activeStore ? <button className="btn-primary" onClick={() => { setShowForm((value) => !value); setError(''); }}>{showForm ? 'إغلاق النموذج' : 'إضافة منتج'}</button> : undefined}
      />
      {stores.length > 1 && <div className="mb-5 max-w-sm"><label htmlFor="product-store" className="mb-2 block text-sm font-medium">المتجر</label><select id="product-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={(event) => { setStoreId(event.target.value); void loadProducts(event.target.value); }}><option value="">اختر متجرًا</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}
      {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center"><b>لا يوجد متجر مرتبط بحسابك</b><p className="mt-2 text-sm text-slate-500">أنشئ متجرًا أولًا، ثم ارجع لإضافة منتجاتك.</p><a className="btn-primary mt-5" href="/create-store">إنشاء متجر</a></div>}
      {showForm && activeStore && <form onSubmit={handleCreate} className="mb-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
        <div className="md:col-span-2"><h2 className="font-bold">منتج جديد</h2><p className="mt-1 text-sm text-slate-500">سيتم حفظ المنتج في المتجر المحدد عبر خدمة المنتجات.</p></div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="product-name">اسم المنتج</label><input id="product-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border p-3" placeholder="مثال: قميص قطني" /></div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="product-price">السعر ({activeStore.currency})</label><input id="product-price" required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} className="w-full rounded-xl border p-3" placeholder="0.00" /></div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="product-quantity">الكمية المتاحة</label><input id="product-quantity" required min="0" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded-xl border p-3" /></div>
        <div><label className="mb-2 block text-sm font-medium" htmlFor="product-status">حالة المنتج</label><select id="product-status" value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'active')} className="w-full rounded-xl border bg-white p-3"><option value="draft">مسودة</option><option value="active">نشط</option></select></div>
        <div className="md:col-span-2"><label className="mb-2 block text-sm font-medium" htmlFor="product-description">الوصف</label><textarea id="product-description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border p-3" placeholder="اكتب وصف المنتج..." /></div>
        <div className="flex gap-3 md:col-span-2"><button disabled={saving} className="btn-primary disabled:opacity-60" type="submit">{saving ? 'جارٍ الحفظ...' : 'حفظ المنتج'}</button><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>إلغاء</button></div>
      </form>}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b p-5"><h2 className="font-bold">قائمة المنتجات</h2><span className="text-sm text-slate-500">{products.length} منتج</span></div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل المنتجات...</p> : products.length ? <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">المنتج</th><th className="p-4">السعر</th><th className="p-4">المخزون</th><th className="p-4">الحالة</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-t"><td className="p-4"><b>{product.name}</b><p className="mt-1 max-w-sm truncate text-xs text-slate-500">{product.description}</p></td><td className="p-4">{formatPrice(product.variants[0]?.priceMinor ?? 0, product.currency)}</td><td className="p-4">{product.variants.reduce((total, variant) => total + variant.inventoryQuantity, 0)}</td><td className="p-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{product.status === 'active' ? 'نشط' : product.status === 'draft' ? 'مسودة' : 'مؤرشف'}</span></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><b>لا توجد منتجات بعد</b><p className="mt-2 text-sm text-slate-500">ابدأ بإضافة أول منتج إلى متجرك.</p>{activeStore && <button onClick={() => setShowForm(true)} className="btn-primary mt-5">إضافة أول منتج</button>}</div>}
      </div>
    </>
  );
}
