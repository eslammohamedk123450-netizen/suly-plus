import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Store } from '../../../domain/types';
import {
  checkoutAdminRepository,
  storeRepository,
  type CheckoutPricingSettings,
  type StoreCoupon,
} from '../../../services/repositories/supabaseRepositories';

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value);

const emptyPricing: CheckoutPricingSettings = {
  shipping_fee: 0,
  free_shipping_threshold: 0,
  tax_rate: 0,
};

export function SettingsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [pricing, setPricing] = useState<CheckoutPricingSettings>(emptyPricing);
  const [coupons, setCoupons] = useState<StoreCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyCoupon, setBusyCoupon] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [minimumSubtotal, setMinimumSubtotal] = useState('0');
  const [maxUses, setMaxUses] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  async function loadStoreData(id: string) {
    const [nextPricing, nextCoupons] = await Promise.all([
      checkoutAdminRepository.getPricingSettings(id),
      checkoutAdminRepository.listCoupons(id),
    ]);
    setPricing(nextPricing);
    setCoupons(nextCoupons);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const availableStores = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(availableStores);
        if (availableStores.length) {
          setStoreId(availableStores[0].id);
          const [nextPricing, nextCoupons] = await Promise.all([
            checkoutAdminRepository.getPricingSettings(availableStores[0].id),
            checkoutAdminRepository.listCoupons(availableStores[0].id),
          ]);
          if (active) {
            setPricing(nextPricing);
            setCoupons(nextCoupons);
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل إعدادات المتجر.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id);
    setLoading(true);
    setError('');
    setNotice('');
    try { await loadStoreData(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات المتجر.'); }
    finally { setLoading(false); }
  }

  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await checkoutAdminRepository.savePricingSettings(storeId, pricing);
      setNotice('تم حفظ إعدادات التسعير. ستُستخدم تلقائيًا في عروض الأسعار والطلبات الجديدة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ إعدادات التسعير.');
    } finally { setSaving(false); }
  }

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const limit = maxUses.trim() ? Number(maxUses) : null;
      if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error('حد الاستخدام يجب أن يكون عددًا صحيحًا موجبًا.');
      await checkoutAdminRepository.createCoupon(storeId, {
        code,
        discount_type: discountType,
        discount_value: Number(discountValue),
        minimum_subtotal: Number(minimumSubtotal),
        max_uses: limit,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setCode('');
      setNotice('تم إنشاء الكوبون بنجاح.');
      await loadStoreData(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء الكوبون.');
    } finally { setSaving(false); }
  }

  async function toggleCoupon(coupon: StoreCoupon) {
    setBusyCoupon(coupon.id);
    setError('');
    setNotice('');
    try {
      await checkoutAdminRepository.setCouponActive(storeId, coupon.id, !coupon.is_active);
      await loadStoreData(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث الكوبون.');
    } finally { setBusyCoupon(null); }
  }

  async function deleteCoupon(coupon: StoreCoupon) {
    if (!window.confirm(`حذف الكوبون ${coupon.code} نهائيًا؟`)) return;
    setBusyCoupon(coupon.id);
    setError('');
    setNotice('');
    try {
      await checkoutAdminRepository.deleteCoupon(storeId, coupon.id);
      setNotice(`تم حذف الكوبون ${coupon.code}.`);
      await loadStoreData(storeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف الكوبون.');
    } finally { setBusyCoupon(null); }
  }

  return <>
    <PageHeader title="إعدادات المتجر" description="ضبط الشحن والضريبة وأكواد الخصم. تُحسب الأسعار النهائية داخل الخادم عند كل طلب." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="settings-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="settings-store" value={storeId} onChange={event => void changeStore(event.target.value)} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ تحميل الإعدادات...</div>
      : !stores.length ? <div className="rounded-2xl border bg-white p-10 text-center">لا يوجد متجر مرتبط بحسابك. أنشئ متجرًا أولًا.</div>
      : <>
        <form onSubmit={savePricing} className="mb-7 rounded-2xl border bg-white p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">الشحن والضرائب</h2>
            <p className="mt-1 text-sm text-slate-500">القيم بعملة المتجر. معدل الضريبة نسبة مئوية، ويبدأ من صفر حتى تحدده بنفسك.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">رسوم الشحن
              <input type="number" min="0" step="0.01" value={pricing.shipping_fee}
                onChange={event => setPricing(current => ({ ...current, shipping_fee: Number(event.target.value) }))}
                className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">الشحن المجاني عند حد أدنى
              <input type="number" min="0" step="0.01" value={pricing.free_shipping_threshold}
                onChange={event => setPricing(current => ({ ...current, free_shipping_threshold: Number(event.target.value) }))}
                className="mt-2 w-full rounded-xl border p-3" />
              <span className="mt-1 block text-xs text-slate-500">اكتب صفرًا لتعطيل الشحن المجاني.</span>
            </label>
            <label className="text-sm font-medium">معدل الضريبة (%)
              <input type="number" min="0" max="100" step="0.01" value={pricing.tax_rate}
                onChange={event => setPricing(current => ({ ...current, tax_rate: Number(event.target.value) }))}
                className="mt-2 w-full rounded-xl border p-3" />
            </label>
          </div>
          <button disabled={saving} className="btn-primary mt-5 disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات الشحن والضريبة'}</button>
        </form>

        <section className="mb-7 rounded-2xl border bg-white p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">إنشاء كوبون خصم</h2>
            <p className="mt-1 text-sm text-slate-500">كل كوبون مرتبط بهذا المتجر فقط. الخصم لا يتجاوز قيمة المنتجات، ويُعاد التحقق من صلاحيته عند إنشاء الطلب.</p>
          </div>
          <form onSubmit={createCoupon} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">كود الخصم
              <input required minLength={3} maxLength={40} value={code} onChange={event => setCode(event.target.value.toUpperCase())}
                pattern="[A-Z0-9_-]{3,40}" placeholder="WELCOME10" className="mt-2 w-full rounded-xl border p-3 uppercase" />
            </label>
            <label className="text-sm font-medium">نوع الخصم
              <select value={discountType} onChange={event => setDiscountType(event.target.value as 'percentage' | 'fixed')} className="mt-2 w-full rounded-xl border bg-white p-3">
                <option value="percentage">نسبة مئوية</option>
                <option value="fixed">قيمة ثابتة</option>
              </select>
            </label>
            <label className="text-sm font-medium">{discountType === 'percentage' ? 'نسبة الخصم (%)' : 'قيمة الخصم'}
              <input required type="number" min="0.01" max={discountType === 'percentage' ? 100 : undefined} step="0.01"
                value={discountValue} onChange={event => setDiscountValue(event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">الحد الأدنى لقيمة المنتجات
              <input type="number" min="0" step="0.01" value={minimumSubtotal} onChange={event => setMinimumSubtotal(event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">عدد مرات الاستخدام (اتركه فارغًا بلا حد)
              <input type="number" min="1" step="1" value={maxUses} onChange={event => setMaxUses(event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">يبدأ من (اختياري)
              <input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <label className="text-sm font-medium">ينتهي في (اختياري)
              <input type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="mt-2 w-full rounded-xl border p-3" />
            </label>
            <div className="md:col-span-2">
              <button disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'جارٍ الإنشاء...' : 'إنشاء الكوبون'}</button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <h2 className="font-bold">كوبونات المتجر</h2>
            <span className="text-sm text-slate-500">{coupons.length} كوبون</span>
          </div>
          {!coupons.length ? <p className="p-8 text-center text-sm text-slate-500">لم تنشئ كوبونات حتى الآن.</p> : <div className="divide-y">
            {coupons.map(coupon => {
              const usedUp = coupon.max_uses !== null && coupon.used_count >= coupon.max_uses;
              const expired = Boolean(coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now());
              const discount = coupon.discount_type === 'percentage'
                ? `${coupon.discount_value}%`
                : money(coupon.discount_value, stores.find(store => store.id === storeId)?.currency ?? 'EGP');
              return <article key={coupon.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="font-mono text-lg tracking-wide">{coupon.code}</b>
                    <span className={`rounded-full px-2 py-1 text-xs ${coupon.is_active && !usedUp && !expired ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {expired ? 'منتهي' : usedUp ? 'اكتمل الاستخدام' : coupon.is_active ? 'نشط' : 'متوقف'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">خصم {discount} · الحد الأدنى {money(coupon.minimum_subtotal, stores.find(store => store.id === storeId)?.currency ?? 'EGP')}</p>
                  <p className="mt-1 text-xs text-slate-500">الاستخدام: {coupon.used_count.toLocaleString('ar-EG')}{coupon.max_uses ? ` / ${coupon.max_uses.toLocaleString('ar-EG')}` : ' · غير محدود'}{coupon.expires_at ? ` · ينتهي ${new Date(coupon.expires_at).toLocaleDateString('ar-EG')}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busyCoupon === coupon.id} onClick={() => void toggleCoupon(coupon)}
                    className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">
                    {coupon.is_active ? 'إيقاف' : 'تفعيل'}
                  </button>
                  <button type="button" disabled={busyCoupon === coupon.id} onClick={() => void deleteCoupon(coupon)}
                    className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">حذف</button>
                </div>
              </article>;
            })}
          </div>}
        </section>
      </>}
  </>;
}
