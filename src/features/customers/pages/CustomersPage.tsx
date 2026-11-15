import { useEffect, useState } from 'react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Customer, Store } from '../../../domain/types';
import { customerRepository, storeRepository } from '../../../services/repositories/supabaseRepositories';

export function CustomersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const available = await storeRepository.listForCurrentUser();
        if (!active) return;
        setStores(available);
        if (!available.length) { setLoading(false); return; }
        setStoreId(available[0].id);
        const result = await customerRepository.list(available[0].id, 1);
        if (active) setCustomers(result.items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل العملاء.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function changeStore(id: string) {
    setStoreId(id); setLoading(true); setError('');
    try { const result = await customerRepository.list(id, 1); setCustomers(result.items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل العملاء.'); }
    finally { setLoading(false); }
  }

  const filtered = customers.filter(c => [c.name, c.email ?? '', c.phone ?? ''].some(value => value.toLocaleLowerCase('ar').includes(query.toLocaleLowerCase('ar'))));

  return <>
    <PageHeader title="العملاء" description="استعرض بيانات العملاء المسجلين في متاجرك." />
    {stores.length > 1 && <div className="mb-5 max-w-sm"><label htmlFor="customers-store" className="mb-2 block text-sm font-medium">المتجر</label><select id="customers-store" className="w-full rounded-xl border bg-white p-3" value={storeId} onChange={e => void changeStore(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك. أنشئ متجرًا أولًا.</div>}
    <section className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><h2 className="font-bold">قائمة العملاء</h2><input aria-label="البحث عن عميل" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بالاسم أو البريد أو الهاتف" className="w-full max-w-xs rounded-xl border p-2.5 text-sm" /></div>
    {loading ? <p className="p-8 text-center text-slate-500">جارٍ تحميل العملاء...</p> : filtered.length ? <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">الاسم</th><th className="p-4">البريد الإلكتروني</th><th className="p-4">الهاتف</th></tr></thead><tbody>{filtered.map(c => <tr key={c.id} className="border-t"><td className="p-4 font-semibold">{c.name}</td><td className="p-4">{c.email || '—'}</td><td className="p-4">{c.phone || '—'}</td></tr>)}</tbody></table></div> : <p className="p-10 text-center text-sm text-slate-500">{customers.length ? 'لا توجد نتائج تطابق بحثك.' : 'لا يوجد عملاء مسجلون في هذا المتجر حتى الآن.'}</p>}</section>
  </>;
}