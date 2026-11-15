import { getSupabase } from '../../services/supabase/client';

export interface DailySalesPoint {
  day: string;
  orders_count: number;
  paid_orders_count: number;
  sales_collected: number;
}

export interface StoreSalesReport {
  from_date: string;
  to_date: string;
  timezone: string;
  orders_count: number;
  paid_orders_count: number;
  sales_collected: number;
  refunds_total: number;
  outstanding_total: number;
  average_paid_order: number;
  cancelled_orders_count: number;
  status_counts: Record<string, number>;
  payment_counts: Record<string, number>;
  daily_sales: DailySalesPoint[];
}

export const reportsRepository = {
  async getSales(storeId: string, fromDate: string, toDate: string): Promise<StoreSalesReport> {
    if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      throw new Error('حدد المتجر والفترة الزمنية بصورة صحيحة.');
    }
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new Error('الفترة يجب ألا تتجاوز 366 يومًا.');
    const { data, error } = await getSupabase().rpc('get_store_sales_report', {
      p_store_id: storeId,
      p_from_date: fromDate,
      p_to_date: toDate,
    });
    if (error) {
      if (error.message.includes('Not authorized')) throw new Error('التقارير المالية متاحة للمالك والمدير ومدير المتجر فقط.');
      throw new Error('تعذر تحميل التقرير المالي. تحقق من صلاحياتك وحاول مرة أخرى.');
    }
    if (!data) throw new Error('لم يتم إرجاع بيانات التقرير.');
    return {
      from_date: data.from_date,
      to_date: data.to_date,
      timezone: data.timezone ?? 'UTC',
      orders_count: Number(data.orders_count ?? 0),
      paid_orders_count: Number(data.paid_orders_count ?? 0),
      sales_collected: Number(data.sales_collected ?? 0),
      refunds_total: Number(data.refunds_total ?? 0),
      outstanding_total: Number(data.outstanding_total ?? 0),
      average_paid_order: Number(data.average_paid_order ?? 0),
      cancelled_orders_count: Number(data.cancelled_orders_count ?? 0),
      status_counts: data.status_counts ?? {},
      payment_counts: data.payment_counts ?? {},
      daily_sales: Array.isArray(data.daily_sales) ? data.daily_sales.map((point: any) => ({
        day: String(point.day),
        orders_count: Number(point.orders_count ?? 0),
        paid_orders_count: Number(point.paid_orders_count ?? 0),
        sales_collected: Number(point.sales_collected ?? 0),
      })) : [],
    };
  },
};
