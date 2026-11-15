import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../shared/components/PageHeader';
import type { Store } from '../../../domain/types';
import { storeRepository } from '../../../services/repositories/supabaseRepositories';
import { reportsRepository, type StoreSalesReport } from '../reportsRepository';

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار', confirmed: 'تم التأكيد', processing: 'قيد التجهيز',
  shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', refunded: 'مسترد',
};

export function ReportsPage() {
  const today = useMemo(() => isoDate(new Date()), []);
  const monthAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return isoDate(date);
  }, []);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [report, setReport] = useState<StoreSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadReport(id: string, from = fromDate, to = toDate) {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const result = await reportsRepository.getSales(id, from, to);
      setReport(result);
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التقرير.');
    } finally { setLoading(false); }
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
          const result = await reportsRepository.getSales(available[0].id, monthAgo, today);
          if (active) setReport(result);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل التقارير.');
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, [monthAgo, today]);

  const currentStore = stores.find(store => store.id === storeId);
  const currency = currentStore?.currency ?? 'EGP';
  const maxDailySales = Math.max(1, ...(report?.daily_sales.map(point => point.sales_collected) ?? [0]));

  function exportCsv() {
    if (!report) return;
    const rows: Array<Array<string | number>> = [
      ['تقرير المبيعات', currentStore?.name ?? ''],
      ['من', report.from_date],
      ['إلى', report.to_date],
      ['المنطقة الزمنية', report.timezone],
      [],
      ['التاريخ', 'عدد الطلبات', 'الطلبات المدفوعة', 'المبيعات المحصلة'],
      ...report.daily_sales.map(point => [point.day, point.orders_count, point.paid_orders_count, point.sales_collected]),
      [],
      ['المؤشر', 'القيمة'],
      ['إجمالي الطلبات', report.orders_count],
      ['الطلبات المدفوعة', report.paid_orders_count],
      ['المبيعات المحصلة', report.sales_collected],
      ['المبالغ المستردة', report.refunds_total],
      ['مبالغ بانتظار التحصيل', report.outstanding_total],
      ['متوسط الطلب المدفوع', report.average_paid_order],
      ['الطلبات الملغاة', report.cancelled_orders_count],
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `suly-sales-${report.from_date}-${report.to_date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const statusRows = Object.entries(report?.status_counts ?? {}).sort((a, b) => b[1] - a[1]);

  return <>
    <PageHeader title="التقارير المالية" description="ملخص المبيعات والتحصيل والاستردادات وحركة الطلبات حسب المنطقة الزمنية للمتجر." />
    {stores.length > 1 && <div className="mb-5 max-w-sm">
      <label htmlFor="reports-store" className="mb-2 block text-sm font-medium">المتجر</label>
      <select id="reports-store" value={storeId} onChange={event => { setStoreId(event.target.value); void loadReport(event.target.value); }} className="w-full rounded-xl border bg-white p-3">
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!loading && !stores.length && <div className="rounded-2xl border bg-white p-8 text-center">لا يوجد متجر مرتبط بحسابك.</div>}
    {stores.length > 0 && <>
      <form onSubmit={event => { event.preventDefault(); void loadReport(storeId, fromDate, toDate); }} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5">
        <label className="text-sm font-medium">من تاريخ<input type="date" required value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} className="mt-2 block rounded-xl border p-3" /></label>
        <label className="text-sm font-medium">إلى تاريخ<input type="date" required value={toDate} min={fromDate} max={today} onChange={event => setToDate(event.target.value)} className="mt-2 block rounded-xl border p-3" /></label>
        <button disabled={loading} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw size={16}/>{loading ? 'جارٍ التحميل...' : 'تحديث التقرير'}</button>
        <button type="button" disabled={!report || loading} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"><Download size={16}/>تصدير CSV</button>
        <span className="text-xs text-slate-500">الحد الأقصى للفترة 366 يومًا</span>
      </form>
      {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">جارٍ حساب التقرير...</div>
        : report && <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['المبيعات المحصلة', formatMoney(report.sales_collected, currency), 'من الطلبات المدفوعة فقط'],
              ['إجمالي الطلبات', report.orders_count.toLocaleString('ar-EG'), `${report.paid_orders_count.toLocaleString('ar-EG')} طلب مدفوع`],
              ['متوسط الطلب المدفوع', formatMoney(report.average_paid_order, currency), 'متوسط قيمة الطلبات المدفوعة'],
              ['مبالغ بانتظار التحصيل', formatMoney(report.outstanding_total, currency), 'طلبات غير مدفوعة أو قيد الدفع'],
              ['المبالغ المستردة', formatMoney(report.refunds_total, currency), 'طلبات حالتها المالية مستردة'],
              ['الطلبات الملغاة', report.cancelled_orders_count.toLocaleString('ar-EG'), 'حسب حالة تنفيذ الطلب'],
            ].map(([label, value, caption]) => <article key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className="mt-2 text-xs text-slate-400">{caption}</p></article>)}
          </section>
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <div className="mb-5"><h2 className="font-bold">المبيعات اليومية</h2><p className="mt-1 text-xs text-slate-500">الأيام المعروضة بتوقيت {report.timezone}</p></div>
            {!report.daily_sales.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد طلبات في الفترة المحددة.</p> : <div className="space-y-3">
              {report.daily_sales.map(point => <div key={point.day} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-500">{new Date(`${point.day}T00:00:00`).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, point.sales_collected / maxDailySales * 100)}%` }}/></div>
                <span className="min-w-24 text-left font-semibold tabular-nums">{formatMoney(point.sales_collected, currency)}</span>
              </div>)}
            </div>}
          </section>
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="mb-4 font-bold">حالات الطلبات</h2>
            {!statusRows.length ? <p className="text-sm text-slate-500">لا توجد بيانات.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statusRows.map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><span className="text-sm">{statusLabels[status] ?? status}</span><b className="tabular-nums">{count.toLocaleString('ar-EG')}</b></div>)}</div>}
          </section>
          <p className="mt-4 text-xs text-slate-400">الأرقام المالية محسوبة من حالة الدفع المسجلة في النظام؛ التقرير لا يغني عن مطابقة كشف حساب بوابة الدفع والبنك.</p>
        </>}
    </>}
  </>;
}
