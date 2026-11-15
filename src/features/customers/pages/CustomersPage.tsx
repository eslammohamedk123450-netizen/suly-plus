import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Customer, Store } from '../../../domain/types';
import { customerRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';

export function CustomersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (available.length) {
          setStoreId(available[0].id);
          const result = await customerRepository.list(available[0].id, 1);
          if (active) { setCustomers(result.items); setTotal(result.total); }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل العملاء.');
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, []);

  async function loadPage(id: string, nextPage: number) {
    setLoading(true); setError('');
    try {
      const result = await customerRepository.list(id, nextPage);
      setCustomers(result.items);
      setTotal(result.total);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل العملاء.');
    } finally { setLoading(false); }
  }

  async function changeStore(id: string) {
    setStoreId(id); setQuery('');
    await loadPage(id, 1);
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar');
    if (!normalized) return customers;
    return customers.filter(customer =>
      [customer.name, customer.email ?? '', customer.phone ?? '']
        .some(value => value.toLocaleLowerCase('ar').includes(normalized)),
    );
  }, [customers, query]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <>
    <PageHeader title="العملاء" description="استعرض بيانات العملاء المسجلين في متاجرك، مع التنقل بين جميع صفحات السجل." />
    {stores.length > 1 && <div className="mb-5 max-w-sm"><label htmlFor="customers-store" className="mb-2 block text-sm font-medium">المتجر</label><select id="customers-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={event => void changeStore(event.target.value)}>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>}
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك. أنشئ متجرًا أولًا.</div>}
    {stores.length > 0 && <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><h2 className="font-bold">قائمة العملاء</h2><p className="mt-1 text-xs text-slate-500">إجمالي العملاء: {total.toLocaleString('ar-EG')} · 20 عميلًا في الصفحة</p></div>
        <input aria-label="البحث عن عميل في الصفحة الحالية" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في الصفحة الحالية..." className="w-full max-w-xs rounded-xl border p-2.5 text-sm" />
      </div>
      {loading ? <p className="p-8 text-center text-slate-500">جارٍ تحميل العملاء...</p>
        : filtered.length ? <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">الاسم</th><th className="p-4">البريد الإلكتروني</th><th className="p-4">الهاتف</th></tr></thead><tbody>{filtered.map(customer => <tr key={customer.id} className="border-t"><td className="p-4 font-semibold">{customer.name}</td><td className="p-4">{customer.email || '—'}</td><td className="p-4">{customer.phone || '—'}</td></tr>)}</tbody></table></div>
        : <p className="p-10 text-center text-sm text-slate-500">{customers.length ? 'لا توجد نتائج في الصفحة الحالية تطابق بحثك.' : 'لا يوجد عملاء مسجلون في هذا المتجر حتى الآن.'}</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <span className="text-sm text-slate-500">الصفحة {page.toLocaleString('ar-EG')} من {pageCount.toLocaleString('ar-EG')}</span>
        <div className="flex gap-2">
          <button type="button" disabled={loading || page <= 1} onClick={() => void loadPage(storeId, page - 1)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">السابق</button>
          <button type="button" disabled={loading || page >= pageCount} onClick={() => void loadPage(storeId, page + 1)} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">التالي</button>
        </div>
      </footer>
    </section>}
  </>;
}
