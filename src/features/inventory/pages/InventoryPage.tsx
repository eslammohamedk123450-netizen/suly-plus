import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Product, Store } from '../../../domain/types';
import {
  inventoryRepository,
  productRepository,
  storeRepository,
  type InventoryMovement,
} from '../../../services/repositories/supabaseRepositories';

const LOW_STOCK_THRESHOLD = 5;

const reasonLabels: Record<string, string> = {
  manual_adjustment: 'تسوية يدوية',
  product_edit: 'تعديل بيانات المنتج',
  order_reservation: 'حجز طلب',
  order_cancellation: 'إلغاء طلب واسترجاع المخزون',
};

function movementLabel(reason: string) {
  return reasonLabels[reason] ?? reason;
}

export function InventoryPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantityDelta, setQuantityDelta] = useState('1');

  const loadInventory = useCallback(async (selectedStoreId: string, selectedPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const [productResult, movementResult] = await Promise.all([
        productRepository.list(selectedStoreId, selectedPage),
        inventoryRepository.listMovements(selectedStoreId, 20),
      ]);
      setProducts(productResult.items);
      setTotalProducts(productResult.total);
      setMovements(movementResult);
      setPage(selectedPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات المخزون.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStores() {
      setLoading(true);
      setError('');
      try {
        const availableStores = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(availableStores);
        if (!availableStores.length) {
          setLoading(false);
          return;
        }
        setStoreId(availableStores[0].id);
        await loadInventory(availableStores[0].id, 1);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'تعذر تحميل المتاجر.');
          setLoading(false);
        }
      }
    }
    void loadStores();
    return () => { active = false; };
  }, [loadInventory]);

  const totalUnits = useMemo(
    () => products.reduce((sum, product) => sum + (product.variants[0]?.inventoryQuantity ?? 0), 0),
    [products],
  );
  const outOfStock = useMemo(
    () => products.filter((product) => (product.variants[0]?.inventoryQuantity ?? 0) === 0).length,
    [products],
  );
  const lowStock = useMemo(
    () => products.filter((product) => {
      const stock = product.variants[0]?.inventoryQuantity ?? 0;
      return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
    }).length,
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ar');
    if (!normalized) return products;
    return products.filter((product) =>
      [product.name, product.description, product.variants[0]?.sku ?? '']
        .some((value) => value.toLocaleLowerCase('ar').includes(normalized)),
    );
  }, [products, search]);

  function closeAdjustment() {
    setSelectedProduct(null);
    setQuantityDelta('1');
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !selectedProduct) return;
    const variant = selectedProduct.variants[0];
    const delta = Number(quantityDelta);

    if (selectedProduct.variants.length !== 1 || !variant?.id || variant.id === selectedProduct.id) {
      setError('التسوية اليدوية متاحة حاليًا للمنتجات ذات المتغير الأساسي الواحد فقط.');
      return;
    }
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
      setError('أدخل فرق كمية صحيحًا غير صفر. استخدم رقمًا سالبًا للخصم.');
      return;
    }
    if (variant.inventoryQuantity + delta < 0) {
      setError('لا يمكن أن يصبح المخزون أقل من صفر.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await inventoryRepository.adjustStock(storeId, selectedProduct.id, variant.id, delta);
      closeAdjustment();
      await loadInventory(storeId, page);
      setSuccess(delta > 0 ? `تمت إضافة ${delta} قطعة إلى المخزون.` : `تم خصم ${Math.abs(delta)} قطعة من المخزون.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ تسوية المخزون.');
    } finally {
      setSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalProducts / 20));

  return (
    <>
      <PageHeader
        title="المخزون"
        description="تابع الكميات المتاحة وسجّل الإضافات والخصومات مع سجل حركة لكل متجر."
      />

      {stores.length > 1 && (
        <div className="mb-5 max-w-sm">
          <label htmlFor="inventory-store" className="mb-2 block text-sm font-medium">المتجر</label>
          <select id="inventory-store" className="w-full rounded-xl border bg-white p-3" value={storeId}
            onChange={(event) => {
              closeAdjustment();
              setStoreId(event.target.value);
              setSearch('');
              void loadInventory(event.target.value, 1);
            }}>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </div>
      )}

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      {!loading && !stores.length && (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <b>لا يوجد متجر مرتبط بحسابك</b>
          <p className="mt-2 text-sm text-slate-500">أنشئ متجرًا أولًا لعرض المخزون.</p>
          <a className="btn-primary mt-5" href="/create-store">إنشاء متجر</a>
        </div>
      )}

      {stores.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-sm text-slate-500">إجمالي المنتجات</p>
              <p className="mt-2 text-2xl font-bold">{totalProducts}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-sm text-slate-500">وحدات المخزون في الصفحة الحالية</p>
              <p className="mt-2 text-2xl font-bold">{totalUnits}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <p className="text-sm text-slate-500">نفد / منخفض في الصفحة (حتى {LOW_STOCK_THRESHOLD})</p>
              <p className="mt-2 text-2xl font-bold">{outOfStock} / {lowStock}</p>
            </div>
          </div>

          {selectedProduct && (
            <form onSubmit={submitAdjustment} className="mb-6 rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">تسوية المخزون: {selectedProduct.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">المتاح حاليًا: {selectedProduct.variants[0]?.inventoryQuantity ?? 0} قطعة</p>
                </div>
                <button type="button" className="btn-secondary" onClick={closeAdjustment}>إغلاق</button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block text-sm font-medium" htmlFor="inventory-delta">
                  فرق الكمية (موجب للإضافة، سالب للخصم)
                  <input id="inventory-delta" type="number" step="1" required value={quantityDelta}
                    onChange={(event) => setQuantityDelta(event.target.value)}
                    className="mt-2 w-full rounded-xl border p-3" placeholder="مثال: 5 أو -2" />
                </label>
                <button disabled={saving} className="btn-primary disabled:opacity-60" type="submit">
                  {saving ? 'جارٍ حفظ التسوية...' : 'حفظ حركة المخزون'}
                </button>
              </div>
            </form>
          )}

          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <h2 className="font-bold">كميات المنتجات</h2>
              <input aria-label="البحث في المخزون" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث عن منتج أو SKU..." className="w-full max-w-xs rounded-xl border p-2.5 text-sm" />
            </div>
            {loading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل المخزون...</p>
              : visibleProducts.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr><th className="p-4">المنتج</th><th className="p-4">الكمية</th><th className="p-4">الحالة</th><th className="p-4">الإجراء</th></tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((product) => {
                          const stock = product.variants[0]?.inventoryQuantity ?? 0;
                          const supportsAdjustment = product.variants.length === 1 && Boolean(product.variants[0]?.id) && product.variants[0].id !== product.id;
                          return (
                            <tr key={product.id} className="border-t">
                              <td className="p-4">
                                <b>{product.name}</b>
                                {product.variants[0]?.sku && <p className="mt-1 text-xs text-slate-400">SKU: {product.variants[0].sku}</p>}
                              </td>
                              <td className="p-4 font-semibold">{stock}</td>
                              <td className="p-4">
                                <span className={stock === 0 ? 'rounded-full bg-red-50 px-3 py-1 text-xs text-red-700' : stock <= LOW_STOCK_THRESHOLD ? 'rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800' : 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700'}>
                                  {stock === 0 ? 'نفد المخزون' : stock <= LOW_STOCK_THRESHOLD ? 'مخزون منخفض' : 'متاح'}
                                </span>
                              </td>
                              <td className="p-4">
                                <button type="button" disabled={!supportsAdjustment}
                                  title={!supportsAdjustment ? 'التسوية اليدوية تدعم حاليًا متغيرًا واحدًا فقط' : 'تسوية المخزون'}
                                  onClick={() => { setSelectedProduct(product); setQuantityDelta('1'); setError(''); setSuccess(''); }}
                                  className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                                  تسوية الكمية
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t p-4 text-sm">
                    <span className="text-slate-500">صفحة {page} من {pageCount}</span>
                    <div className="flex gap-2">
                      <button disabled={page <= 1 || loading} onClick={() => void loadInventory(storeId, page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">السابق</button>
                      <button disabled={page >= pageCount || loading} onClick={() => void loadInventory(storeId, page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">التالي</button>
                    </div>
                  </div>
                </>
              ) : <p className="p-10 text-center text-sm text-slate-500">{products.length ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد منتجات في هذا المتجر حتى الآن.'}</p>}
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
            <div className="border-b p-5">
              <h2 className="font-bold">آخر حركات المخزون</h2>
              <p className="mt-1 text-xs text-slate-500">أحدث 20 حركة مسجلة لهذا المتجر.</p>
            </div>
            {loading ? <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل الحركات...</p>
              : movements.length ? (
                <div className="divide-y">
                  {movements.map((movement) => {
                    const positive = movement.quantity_delta > 0;
                    return (
                      <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                        <div>
                          <b>{movement.product_name ?? 'منتج محذوف'}</b>
                          <p className="mt-1 text-xs text-slate-500">{movementLabel(movement.reason)} · {new Date(movement.created_at).toLocaleString('ar-EG')}</p>
                        </div>
                        <span className={positive ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
                          {positive ? '+' : ''}{movement.quantity_delta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="p-8 text-center text-sm text-slate-500">لا توجد حركات مخزون حتى الآن.</p>}
          </section>
        </>
      )}
    </>
  );
}
