import { useEffect, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Category, Store } from '../../../domain/types';
import { categoryRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';

type CategoryForm = Pick<Category, 'name' | 'description' | 'sortOrder' | 'isActive'>;

const emptyForm: CategoryForm = { name: '', description: '', sortOrder: 0, isActive: true };

export function CategoriesPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (available.length) {
          setStoreId(available[0].id);
          const result = await categoryRepository.list(available[0].id);
          if (active) setCategories(result);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل التصنيفات.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function changeStore(nextStoreId: string) {
    setStoreId(nextStoreId);
    setLoading(true);
    setError('');
    try {
      setCategories(await categoryRepository.list(nextStoreId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل تصنيفات المتجر.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function openEdit(category: Category) {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId || !form.name.trim()) {
      setError('اكتب اسم التصنيف أولًا.');
      return;
    }
    if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0) {
      setError('ترتيب التصنيف يجب أن يكون رقمًا صحيحًا غير سالب.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (editing) {
        const updated = await categoryRepository.update(storeId, editing.id, form);
        setCategories((items) => items.map((item) => item.id === updated.id ? updated : item));
        setSuccess('تم تحديث التصنيف.');
      } else {
        const created = await categoryRepository.create(storeId, form);
        setCategories((items) => [...items, created].sort((a, b) => a.sortOrder - b.sortOrder));
        setSuccess('تم إنشاء التصنيف.');
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التصنيف.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category: Category) {
    try {
      const updated = await categoryRepository.update(storeId, category.id, {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: !category.isActive,
      });
      setCategories((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSuccess(updated.isActive ? 'تم تفعيل التصنيف.' : 'تم إيقاف التصنيف.');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تغيير حالة التصنيف.');
    }
  }

  async function remove(category: Category) {
    const confirmed = window.confirm(`حذف التصنيف «${category.name}»؟ ستبقى المنتجات محفوظة ولكن دون تصنيف.`);
    if (!confirmed) return;
    try {
      await categoryRepository.delete(storeId, category.id);
      setCategories((items) => items.filter((item) => item.id !== category.id));
      setSuccess('تم حذف التصنيف، ولم يتم حذف المنتجات التابعة له.');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف التصنيف.');
    }
  }

  return <>
    <PageHeader title="التصنيفات" description="نظّم منتجات متجرك في أقسام يمكن إدارتها ونشرها بشكل مستقل."
      action={storeId ? <button className="btn-primary" onClick={showForm ? () => setShowForm(false) : openCreate}>{showForm ? 'إغلاق النموذج' : 'إضافة تصنيف'}</button> : undefined} />
    {stores.length > 1 && <div className="mb-5 max-w-sm"><label htmlFor="categories-store" className="mb-2 block text-sm font-medium">المتجر</label><select id="categories-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={(event) => void changeStore(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {success && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center"><b>لا يوجد متجر مرتبط بحسابك</b><p className="mt-2 text-sm text-slate-500">أنشئ متجرًا أولًا ثم أضف تصنيفاته.</p><a href="/create-store" className="btn-primary mt-5 inline-block">إنشاء متجر</a></div>}
    {showForm && <form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="font-bold">{editing ? 'تعديل التصنيف' : 'تصنيف جديد'}</h2></div>
      <div><label htmlFor="category-name" className="mb-2 block text-sm font-medium">اسم التصنيف</label><input id="category-name" required maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border p-3" placeholder="مثال: ملابس رجالي" /></div>
      <div><label htmlFor="category-sort" className="mb-2 block text-sm font-medium">ترتيب العرض</label><input id="category-sort" type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></div>
      <div className="md:col-span-2"><label htmlFor="category-description" className="mb-2 block text-sm font-medium">الوصف</label><textarea id="category-description" rows={2} maxLength={1000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-xl border p-3" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />تصنيف نشط</label>
      <div className="flex gap-3 md:col-span-2"><button disabled={saving} className="btn-primary disabled:opacity-60" type="submit">{saving ? 'جارٍ الحفظ...' : 'حفظ التصنيف'}</button><button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>إلغاء</button></div>
    </form>}
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b p-5"><h2 className="font-bold">تصنيفات المتجر</h2><span className="text-sm text-slate-500">{categories.length} تصنيف</span></div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل التصنيفات...</p> : categories.length ? <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">التصنيف</th><th className="p-4">الترتيب</th><th className="p-4">الحالة</th><th className="p-4">الإجراءات</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id} className="border-t"><td className="p-4"><b>{category.name}</b><p className="mt-1 text-xs text-slate-500">{category.description || 'بدون وصف'}</p></td><td className="p-4">{category.sortOrder}</td><td className="p-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{category.isActive ? 'نشط' : 'متوقف'}</span></td><td className="p-4"><div className="flex flex-wrap gap-2"><button onClick={() => openEdit(category)} className="rounded-lg border px-3 py-1.5 text-xs">تعديل</button><button onClick={() => void toggleActive(category)} className="rounded-lg border px-3 py-1.5 text-xs">{category.isActive ? 'إيقاف' : 'تفعيل'}</button><button onClick={() => void remove(category)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700">حذف</button></div></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><b>لا توجد تصنيفات حتى الآن</b><p className="mt-2 text-sm text-slate-500">أنشئ أول تصنيف ثم اربط به منتجاتك من صفحة المنتجات.</p>{storeId && <button onClick={openCreate} className="btn-primary mt-5">إضافة أول تصنيف</button>}</div>}
    </section>
  </>;
}
