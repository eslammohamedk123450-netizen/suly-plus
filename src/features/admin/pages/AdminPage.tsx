import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabase } from '../../../services/supabase/client';

interface AdminStore {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

interface AdminAction {
  id: string;
  action: 'store_suspended' | 'store_reactivated';
  reason: string | null;
  store_id: string | null;
  created_at: string;
  stores: { name: string } | null;
}

interface Overview {
  metrics: { stores_count: number; users_count: number; orders_count: number };
  recent_stores: AdminStore[];
  recent_admin_actions: AdminAction[];
}

const actionLabels: Record<AdminAction['action'], string> = {
  store_suspended: 'إيقاف متجر',
  store_reactivated: 'إعادة تفعيل متجر',
};

export function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStore, setBusyStore] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async () => {
    const { data, error: invokeError } = await getSupabase().functions.invoke('platform-admin-overview', { method: 'GET' });
    if (invokeError) {
      const status = (invokeError as { context?: { status?: number } }).context?.status;
      throw new Error(status === 403 ? 'هذا الحساب ليس لديه صلاحية مدير المنصة.' : 'تعذر التحقق من صلاحيات لوحة الإدارة.');
    }
    if (!data?.ok || !data?.metrics) throw new Error('تعذر تحميل إحصائيات المنصة.');
    setOverview(data as Overview);
  }, []);

  useEffect(() => {
    let active = true;
    loadOverview()
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تحميل لوحة الإدارة.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadOverview]);

  async function changeStoreStatus(store: AdminStore) {
    const nextActive = !store.is_active;
    if (!window.confirm(nextActive
      ? `تأكيد إعادة تفعيل متجر "${store.name}"؟`
      : `تأكيد إيقاف متجر "${store.name}"؟ المتجر لن يظهر للعملاء ولن يقبل طلبات جديدة.`)) return;

    let reason = '';
    if (!nextActive) {
      const entered = window.prompt('اكتب سبب إيقاف المتجر. سيُحفظ هذا السبب في سجل التدقيق.');
      if (entered === null) return;
      reason = entered.trim();
      if (reason.length < 5 || reason.length > 500) {
        setError('سبب إيقاف المتجر يجب أن يكون بين 5 و500 حرف.');
        return;
      }
    }

    setBusyStore(store.id);
    setError('');
    setNotice('');
    try {
      const { data, error: invokeError } = await getSupabase().functions.invoke('platform-admin-manage-store', {
        method: 'POST',
        body: { store_id: store.id, is_active: nextActive, reason: reason || null },
      });
      if (invokeError || !data?.ok) {
        const status = (invokeError as { context?: { status?: number } } | null)?.context?.status;
        if (status === 403) throw new Error('ليس لديك صلاحية تنفيذ هذا الإجراء.');
        throw new Error(typeof data?.error === 'string' ? data.error : 'تعذر تنفيذ الإجراء الإداري.');
      }
      await loadOverview();
      setNotice(nextActive ? 'تمت إعادة تفعيل المتجر وتسجيل الإجراء.' : 'تم إيقاف المتجر وتسجيل السبب في سجل التدقيق.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حدث خطأ أثناء تنفيذ الإجراء.');
    } finally {
      setBusyStore(null);
    }
  }

  return <main className="container-shell py-10">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-brand-600">Suly Plus</p><h1 className="mt-1 text-3xl font-bold">الإدارة المركزية</h1><p className="mt-2 text-sm text-slate-500">إشراف المنصة وإجراءات المتاجر مع سجل تدقيق.</p></div>
      <Link to="/dashboard" className="rounded-xl border px-4 py-2 text-sm font-semibold">لوحة التاجر</Link>
    </header>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ التحقق من الصلاحيات...</div>
      : !overview ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">تعذر تحميل لوحة الإدارة.<p className="mt-2 text-sm">صلاحية الإدارة تُمنح من app_metadata في Supabase Auth فقط، ولا يمكن للمستخدم منحها لنفسه من الواجهة.</p></div>
      : <>
        <section className="grid gap-4 sm:grid-cols-3">
          {[['المتاجر', overview.metrics.stores_count], ['حسابات المستخدمين', overview.metrics.users_count], ['الطلبات', overview.metrics.orders_count]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border bg-white p-6"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{Number(value).toLocaleString('ar-EG')}</p></article>)}
        </section>
        <section className="mt-7 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">إدارة المتاجر</h2><p className="mt-1 text-xs text-slate-500">إيقاف المتجر أو تفعيله يُسجل تلقائيًا في سجل التدقيق.</p></div>
          {!overview.recent_stores.length ? <p className="p-8 text-center text-sm text-slate-500">لا توجد متاجر حتى الآن.</p> : <div className="divide-y">{overview.recent_stores.map(store => <article key={store.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div><b>{store.name}</b><p className="mt-1 text-xs text-slate-500">/store/{store.slug} · {new Date(store.created_at).toLocaleDateString('ar-EG')}</p><span className={store.is_active ? 'mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700' : 'mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500'}>{store.is_active ? 'نشط' : 'متوقف'}</span></div>
            <button type="button" disabled={busyStore !== null} onClick={() => void changeStoreStatus(store)} className={store.is_active ? 'rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50' : 'rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50'}>
              {busyStore === store.id ? 'جارٍ التنفيذ...' : store.is_active ? 'إيقاف المتجر' : 'إعادة التفعيل'}
            </button>
          </article>)}</div>}
        </section>
        <section className="mt-7 overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="font-bold">سجل التدقيق الإداري</h2><p className="mt-1 text-xs text-slate-500">آخر الإجراءات على حالة المتاجر.</p></div>
          {!overview.recent_admin_actions?.length ? <p className="p-8 text-center text-sm text-slate-500">لم تُسجل إجراءات إدارية بعد.</p> : <div className="divide-y">{overview.recent_admin_actions.map(action => <article key={action.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{actionLabels[action.action]}</b><time className="text-xs text-slate-400">{new Date(action.created_at).toLocaleString('ar-EG')}</time></div>
            <p className="mt-1 text-sm text-slate-600">{action.stores?.name ?? 'متجر محذوف'}</p>
            {action.reason && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{action.reason}</p>}
          </article>)}</div>}
        </section>
      </>}
  </main>;
}
