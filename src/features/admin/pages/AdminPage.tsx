import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabase } from '../../services/supabase/client';

interface Overview {
  metrics: { stores_count: number; users_count: number; orders_count: number };
  recent_stores: Array<{ id: string; name: string; slug: string; is_active: boolean; created_at: string }>;
}

export function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error: invokeError } = await getSupabase().functions.invoke('platform-admin-overview', { method: 'GET' });
        if (invokeError) {
          const status = (invokeError as { context?: { status?: number } }).context?.status;
          throw new Error(status === 403 ? 'هذا الحساب ليس لديه صلاحية مدير المنصة.' : 'تعذر التحقق من صلاحيات لوحة الإدارة.');
        }
        if (!data?.ok || !data?.metrics) throw new Error('تعذر تحميل إحصائيات المنصة.');
        if (active) setOverview(data as Overview);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تحميل لوحة الإدارة.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  return <main className="container-shell py-10">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-brand-600">Suly Plus</p><h1 className="mt-1 text-3xl font-bold">الإدارة المركزية</h1><p className="mt-2 text-sm text-slate-500">لوحة إشراف أولية محمية بصلاحية منصة موثوقة.</p></div>
      <Link to="/dashboard" className="rounded-xl border px-4 py-2 text-sm font-semibold">لوحة التاجر</Link>
    </header>
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ التحقق من الصلاحيات...</div>
      : error ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{error}<p className="mt-2 text-sm">صلاحية الإدارة تُمنح من app_metadata في Supabase Auth فقط، ولا يمكن للمستخدم منحها لنفسه من الواجهة.</p></div>
      : overview && <>
        <section className="grid gap-4 sm:grid-cols-3">
          {[['المتاجر', overview.metrics.stores_count], ['حسابات المستخدمين', overview.metrics.users_count], ['الطلبات', overview.metrics.orders_count]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border bg-white p-6"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{Number(value).toLocaleString('ar-EG')}</p></article>)}
        </section>
        <section className="mt-7 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">أحدث المتاجر</h2></div>
          {!overview.recent_stores.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد متاجر حتى الآن.</p> : <div className="divide-y">{overview.recent_stores.map(store => <article key={store.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><b>{store.name}</b><p className="mt-1 text-xs text-slate-500">/store/{store.slug}</p></div><span className={store.is_active ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700' : 'rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500'}>{store.is_active ? 'نشط' : 'متوقف'}</span></article>)}</div>}
        </section>
      </>}
  </main>;
}
