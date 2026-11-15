import { getSupabase } from '../../services/supabase/client';

export interface StorePlanOverview {
  assigned: boolean;
  status: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  planName: string | null;
  currency: string | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  maxProducts: number | null;
  maxTeamMembers: number | null;
  maxMonthlyOrders: number | null;
  productCount: number;
}

export const subscriptionRepository = {
  async getStorePlanOverview(storeId: string): Promise<StorePlanOverview> {
    const supabase = getSupabase();
    const [{ data: subscription, error: subscriptionError }, { count, error: productError }] = await Promise.all([
      supabase.from('store_subscriptions')
        .select('status,billing_interval,current_period_end,subscription_plans(name,currency,monthly_price,yearly_price,max_products,max_team_members,max_monthly_orders)')
        .eq('store_id', storeId).maybeSingle(),
      supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('store_id', storeId).neq('status', 'archived'),
    ]);
    if (subscriptionError) throw new Error('تعذر تحميل بيانات الاشتراك.');
    if (productError) throw new Error('تعذر تحميل استخدام المنتجات.');
    const plan = Array.isArray(subscription?.subscription_plans)
      ? subscription.subscription_plans[0] : subscription?.subscription_plans;
    return {
      assigned: Boolean(subscription),
      status: subscription?.status ?? null,
      billingInterval: subscription?.billing_interval ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      planName: plan?.name ?? null,
      currency: plan?.currency ?? null,
      monthlyPrice: plan ? Number(plan.monthly_price) : null,
      yearlyPrice: plan ? Number(plan.yearly_price) : null,
      maxProducts: plan?.max_products === null || plan?.max_products === undefined ? null : Number(plan.max_products),
      maxTeamMembers: plan?.max_team_members === null || plan?.max_team_members === undefined ? null : Number(plan.max_team_members),
      maxMonthlyOrders: plan?.max_monthly_orders === null || plan?.max_monthly_orders === undefined ? null : Number(plan.max_monthly_orders),
      productCount: count ?? 0,
    };
  },
};
