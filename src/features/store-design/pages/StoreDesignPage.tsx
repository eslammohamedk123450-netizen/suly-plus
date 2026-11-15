import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Store } from '../../../domain/types';
import { storeRepository } from '../../../services/repositories/supabaseRepositories';
import { storeAppearanceRepository, type StoreAppearance } from '../storeAppearanceRepository';

const emptyAppearance: StoreAppearance = {
  id: '', name: '', slug: '', currency: 'EGP', description: '', logoUrl: '',
  announcement: '', supportEmail: '', supportPhone: '',
};

export function StoreDesignPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [appearance, setAppearance] = useState<StoreAppearance>(emptyAppearance);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(id: string) {
    setAppearance(await storeAppearanceRepository.getForManager(id));
  }

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (available.length) {
          setStoreId(available[0].id);
          const result = await storeAppearanceRepository.getForManager(available[0].id);
          if (active) setAppearance(result);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات التصميم.');
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id); setLoading(true); setError(''); setNotice('');
    try { await load(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل المتجر.'); }
    finally { setLoading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await storeAppearanceRepository.save(storeId, appearance);
      setNotice('تم حفظ هوية المتجر وبيانات التواصل.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التغييرات.');
    } finally { setSaving(false); }
  }

  function update<K extends keyof StoreAppearance>(key: K, value: StoreAppearance[K]) {
    setAppearance(current => ({ ...current, [key]: value }));
  }

  return <>
    <PageHeader title="تصميم وهوية المتجر" description="تحكم في اسم المتجر ووصفه وشعاره ورسالة الترحيب وبيانات التواصل." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="design-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="design-store" value={storeId} onChange={event => void changeStore(event.target.value)} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center">جارٍ تحميل بيانات المتجر...</div>
      : !stores.length ? <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك. <Link className="text-brand-600" to="/create-store">أنشئ متجرًا</Link></div>
      : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={save} className="space-y-6 rounded-2xl border bg-white p-6">
          <section>
            <h2 className="font-bold">الهوية الأساسية</h2>
            <div className="mt-4 grid gap-4">
              <label className="text-sm font-medium">اسم المتجر
                <input required minLength={2} maxLength={100} value={appearance.name} onChange={event => update('name', event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
              </label>
              <label className="text-sm font-medium">وصف المتجر
                <textarea maxLength={1000} rows={4} value={appearance.description} onChange={event => update('description', event.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="عرّف الزوار بمتجرك وما تقدمه." />
              </label>
              <label className="text-sm font-medium">رابط شعار المتجر (HTTPS)
                <input type="url" value={appearance.logoUrl} onChange={event => update('logoUrl', event.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="https://example.com/logo.png" />
              </label>
              <label className="text-sm font-medium">رسالة أعلى المتجر
                <input maxLength={240} value={appearance.announcement} onChange={event => update('announcement', event.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="شحن مجاني للطلبات فوق..." />
                <span className="mt-1 block text-xs text-slate-500">تُحفظ في إعدادات المتجر، ولم أفتح قراءتها للعامة قبل تجهيز نقطة قراءة محدودة وآمنة.</span>
              </label>
            </div>
          </section>
          <section className="border-t pt-5">
            <h2 className="font-bold">بيانات التواصل</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">بريد الدعم
                <input type="email" maxLength={254} value={appearance.supportEmail} onChange={event => update('supportEmail', event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
              </label>
              <label className="text-sm font-medium">هاتف الدعم
                <input type="tel" maxLength={30} value={appearance.supportPhone} onChange={event => update('supportPhone', event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
              </label>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="text-xs text-slate-500">رابط المتجر: /store/{appearance.slug}</p>
            <button disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button>
          </div>
        </form>
        <aside className="h-fit rounded-2xl border bg-white p-5">
          <h2 className="font-bold">معاينة الهوية</h2>
          <div className="mt-4 rounded-xl border p-4 text-center">
            {appearance.logoUrl ? <img src={appearance.logoUrl} alt="شعار المتجر" className="mx-auto mb-3 h-20 w-20 rounded-xl object-contain" /> : <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-xl bg-slate-100 text-2xl font-bold text-slate-500">{appearance.name.slice(0,1) || 'S'}</div>}
            <p className="font-bold">{appearance.name || 'اسم متجرك'}</p>
            <p className="mt-2 text-sm text-slate-500">{appearance.description || 'سيظهر وصف متجرك هنا.'}</p>
          </div>
          <Link to={`/store/${appearance.slug}`} target="_blank" rel="noreferrer" className="mt-4 block rounded-xl border p-3 text-center text-sm font-semibold hover:bg-slate-50">فتح المتجر العام</Link>
        </aside>
      </div>}
  </>;
}
