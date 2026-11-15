import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Category, Product, Store } from '../../../domain/types';
import { categoryRepository, productRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';
import { getSupabase } from '../../../services/supabase/client';

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(amountMinor / 100);
}

const statusLabels: Record<Product['status'], string> = {
  active: 'نشط',
  draft: 'مسودة',
  archived: 'مؤرشف',
};

export function ProductsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingProductId, setActingProductId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [sku, setSku] = useState('');
  const [status, setStatus] = useState<Product['status']>('draft');
  const [categoryId, setCategoryId] = useState('');
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    setNewImagePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  const activeStore = useMemo(() => stores.find((store) => store.id === storeId) ?? null, [stores, storeId]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ar');
    if (!normalizedSearch) return products;
    return products.filter((product) =>
      [product.name, product.description, product.variants[0]?.sku ?? '']
        .some((value) => value.toLocaleLowerCase('ar').includes(normalizedSearch)),
    );
  }, [products, search]);

  const loadProducts = useCallback(async (selectedStoreId: string) => {
    setLoading(true);
    setError('');
    try {
      const [result, categoryItems] = await Promise.all([
        productRepository.list(selectedStoreId, 1),
        categoryRepository.list(selectedStoreId),
      ]);
      setProducts(result.items);
      setCategories(categoryItems.filter((category) => category.isActive));
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

  function clearForm() {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setQuantity('0');
    setSku('');
    setStatus('draft');
    setCategoryId('');
    setExistingImages([]);
    setSelectedFiles([]);
  }

  function openCreateForm() {
    clearForm();
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    if (product.variants.length !== 1 || !product.variants[0]?.id || product.variants[0].id === product.id) {
      setError('تعديل المنتجات ذات المتغيرات المتعددة غير متاح بعد. لم يتم تغيير أي بيانات.');
      return;
    }
    const variant = product.variants[0];
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description);
    setPrice((variant.priceMinor / 100).toFixed(2));
    setQuantity(String(variant.inventoryQuantity));
    setSku(variant.sku);
    setStatus(product.status);
    setCategoryId(product.categoryId ?? '');
    setExistingImages(product.images);
    setSelectedFiles([]);
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    clearForm();
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStore) return;

    const numericPrice = Number(price);
    const numericQuantity = Number(quantity);
    if (!name.trim() || name.trim().length > 120
        || !Number.isFinite(numericPrice) || numericPrice <= 0
        || !Number.isInteger(numericQuantity) || numericQuantity < 0) {
      setError('أدخل اسمًا لا يتجاوز 120 حرفًا، وسعرًا أكبر من صفر، وكمية مخزون صحيحة.');
      return;
    }

    if (existingImages.length + selectedFiles.length > 5) {
      setError('يمكن إضافة خمس صور كحد أقصى للمنتج.');
      return;
    }
    if (selectedFiles.some((file) => !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setError('الصور المدعومة: JPEG وPNG وWebP وAVIF، وبحد أقصى 10 ميجابايت للصورة.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    const uploadedPaths: string[] = [];
    try {
      const supabase = getSupabase();
      const uploadedUrls: string[] = [];
      for (const file of selectedFiles) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[file.type];
        const objectPath = `${activeStore.id}/products/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('store-assets').upload(objectPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPaths.push(objectPath);
        uploadedUrls.push(supabase.storage.from('store-assets').getPublicUrl(objectPath).data.publicUrl);
      }

      const input = {
        kind: 'physical' as const,
        name: name.trim(),
        description: description.trim(),
        images: [...existingImages, ...uploadedUrls],
        categoryId: categoryId || null,
        currency: activeStore.currency,
        status,
        options: editingProduct?.options ?? [],
        variants: [{
          id: editingProduct?.variants[0]?.id ?? '',
          sku: sku.trim(),
          options: editingProduct?.variants[0]?.options ?? {},
          priceMinor: Math.round(numericPrice * 100),
          inventoryQuantity: numericQuantity,
        }],
      };

      if (editingProduct) {
        const updated = await productRepository.update(activeStore.id, editingProduct.id, input);
        setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
        setSuccess('تم تحديث المنتج والمخزون بنجاح.');
      } else {
        const created = await productRepository.create(activeStore.id, input);
        setProducts((current) => [created, ...current]);
        setSuccess('تم حفظ المنتج بنجاح.');
      }

      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المنتج. تحقق من الاتصال والصلاحيات.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(product: Product) {
    if (!activeStore) return;
    const archiving = product.status !== 'archived';
    const confirmed = window.confirm(
      archiving
        ? `أرشفة المنتج «${product.name}»؟ سيختفي من واجهة المتجر، وستظل بياناته محفوظة في الطلبات السابقة.`
        : `إعادة المنتج «${product.name}» كمسودة؟`,
    );
    if (!confirmed) return;

    setActingProductId(product.id);
    setError('');
    setSuccess('');
    try {
      const nextStatus: Product['status'] = archiving ? 'archived' : 'draft';
      await productRepository.updateStatus(activeStore.id, product.id, nextStatus);
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, status: nextStatus } : item));
      setSuccess(archiving ? 'تمت أرشفة المنتج. بياناته وطلباته السابقة محفوظة.' : 'تمت إعادة المنتج كمسودة.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة المنتج.');
    } finally {
      setActingProductId('');
    }
  }

  return (
    <>
      <PageHeader
        title="المنتجات"
        description="أضف منتجاتك وعدّل بياناتها وأسعارها ومخزونها، أو أرشف ما لم تعد تبيعه."
        action={activeStore ? <button className="btn-primary" onClick={showForm ? closeForm : openCreateForm}>{showForm ? 'إغلاق النموذج' : 'إضافة منتج'}</button> : undefined}
      />

      {stores.length > 1 && (
        <div className="mb-5 max-w-sm">
          <label htmlFor="product-store" className="mb-2 block text-sm font-medium">المتجر</label>
          <select id="product-store" className="w-full rounded-xl border bg-white p-3" value={storeId}
            onChange={(event) => { closeForm(); setStoreId(event.target.value); void loadProducts(event.target.value); }}>
            <option value="">اختر متجرًا</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </div>
      )}

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      {!loading && !stores.length && (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <b>لا يوجد متجر مرتبط بحسابك</b>
          <p className="mt-2 text-sm text-slate-500">أنشئ متجرًا أولًا، ثم ارجع لإضافة منتجاتك.</p>
          <a className="btn-primary mt-5" href="/create-store">إنشاء متجر</a>
        </div>
      )}

      {showForm && activeStore && (
        <form onSubmit={handleSave} className="mb-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="font-bold">{editingProduct ? 'تعديل المنتج' : 'منتج جديد'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {editingProduct ? 'سيتم حفظ السعر والمخزون وتسجيل أي تغيير في حركة المخزون.' : 'سيتم حفظ المنتج في المتجر المحدد.'}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-name">اسم المنتج</label>
            <input id="product-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border p-3" placeholder="مثال: قميص قطني" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-price">السعر ({activeStore.currency})</label>
            <input id="product-price" required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)}
              className="w-full rounded-xl border p-3" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-quantity">الكمية المتاحة</label>
            <input id="product-quantity" required min="0" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)}
              className="w-full rounded-xl border p-3" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-sku">رمز المنتج SKU (اختياري)</label>
            <input id="product-sku" maxLength={80} value={sku} onChange={(event) => setSku(event.target.value)}
              className="w-full rounded-xl border p-3" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-category">التصنيف</label>
            <select id="product-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-xl border bg-white p-3">
              <option value="">بدون تصنيف</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="product-status">حالة المنتج</label>
            <select id="product-status" value={status} onChange={(event) => setStatus(event.target.value as Product['status'])}
              className="w-full rounded-xl border bg-white p-3">
              <option value="draft">مسودة</option>
              <option value="active">نشط</option>
              {editingProduct?.status === 'archived' && <option value="archived">مؤرشف</option>}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium">صور المنتج (حتى 5 صور)</label>
            <div className="mb-3 flex flex-wrap gap-3">
              {existingImages.map((image, index) => (
                <div key={image} className="relative">
                  <img src={image} alt={`صورة المنتج ${index + 1}`} className="h-24 w-24 rounded-xl border object-cover" />
                  <button type="button" onClick={() => setExistingImages((current) => current.filter((url) => url !== image))}
                    aria-label="إزالة الصورة" className="absolute -left-2 -top-2 rounded-full bg-red-600 px-2 py-1 text-xs text-white">×</button>
                </div>
              ))}
              {newImagePreviews.map((image, index) => (
                <div key={image} className="relative">
                  <img src={image} alt={`معاينة الصورة الجديدة ${index + 1}`} className="h-24 w-24 rounded-xl border object-cover" />
                  <button type="button" onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    aria-label="إزالة الصورة الجديدة" className="absolute -left-2 -top-2 rounded-full bg-red-600 px-2 py-1 text-xs text-white">×</button>
                </div>
              ))}
            </div>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple
              disabled={existingImages.length + selectedFiles.length >= 5}
              onChange={(event) => {
                const incoming = Array.from(event.target.files ?? []);
                const remaining = Math.max(0, 5 - existingImages.length - selectedFiles.length);
                setSelectedFiles((current) => [...current, ...incoming.slice(0, remaining)]);
                if (incoming.length > remaining) setError('يمكن إضافة خمس صور كحد أقصى للمنتج.');
                event.target.value = '';
              }}
              className="w-full rounded-xl border p-3 text-sm disabled:bg-slate-100" />
            <p className="mt-1 text-xs text-slate-500">JPEG وPNG وWebP وAVIF، بحد أقصى 10 ميجابايت لكل صورة. يتم رفعها إلى مساحة ملفات متجرك.</p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium" htmlFor="product-description">الوصف</label>
            <textarea id="product-description" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-xl border p-3" placeholder="اكتب وصف المنتج..." />
          </div>
          <div className="flex gap-3 md:col-span-2">
            <button disabled={saving} className="btn-primary disabled:opacity-60" type="submit">
              {saving ? 'جارٍ الحفظ...' : editingProduct ? 'حفظ التعديلات' : 'حفظ المنتج'}
            </button>
            <button type="button" className="btn-secondary" onClick={closeForm}>إلغاء</button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <h2 className="font-bold">قائمة المنتجات</h2>
          <div className="flex items-center gap-3">
            <input aria-label="البحث في المنتجات" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن منتج..." className="w-48 rounded-xl border p-2.5 text-sm" />
            <span className="whitespace-nowrap text-sm text-slate-500">{visibleProducts.length} من {products.length}</span>
          </div>
        </div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل المنتجات...</p>
          : visibleProducts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="p-4">المنتج</th><th className="p-4">السعر</th><th className="p-4">المخزون</th><th className="p-4">الحالة</th><th className="p-4">الإجراءات</th></tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="border-t">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {product.images[0] ? <img src={product.images[0]} alt="" className="h-12 w-12 rounded-lg object-cover" /> : null}
                          <div><b>{product.name}</b>
                          <p className="mt-1 max-w-sm truncate text-xs text-slate-500">{product.description}</p>
                          {product.categoryId && <p className="mt-1 text-xs text-slate-400">{categories.find((item) => item.id === product.categoryId)?.name ?? 'تصنيف'}</p>}</div>
                        </div>
                        {product.variants[0]?.sku && <p className="mt-1 text-xs text-slate-400">SKU: {product.variants[0].sku}</p>}
                      </td>
                      <td className="p-4">{formatPrice(product.variants[0]?.priceMinor ?? 0, product.currency)}</td>
                      <td className="p-4">{product.variants.reduce((total, variant) => total + variant.inventoryQuantity, 0)}</td>
                      <td className="p-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{statusLabels[product.status]}</span></td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openEditForm(product)}
                            disabled={product.variants.length !== 1 || actingProductId === product.id}
                            title={product.variants.length !== 1 ? 'تعديل المتغيرات المتعددة غير متاح بعد' : 'تعديل المنتج'}
                            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                            تعديل
                          </button>
                          <button type="button" onClick={() => void toggleArchive(product)}
                            disabled={actingProductId === product.id}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">
                            {actingProductId === product.id ? 'جارٍ التحديث...' : product.status === 'archived' ? 'استعادة كمسودة' : 'أرشفة'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <b>{products.length ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد منتجات بعد'}</b>
              <p className="mt-2 text-sm text-slate-500">{products.length ? 'جرّب اسمًا آخر أو امسح كلمة البحث.' : 'ابدأ بإضافة أول منتج إلى متجرك.'}</p>
              {!products.length && activeStore && <button onClick={openCreateForm} className="btn-primary mt-5">إضافة أول منتج</button>}
            </div>
          )}
      </div>
    </>
  );
}
