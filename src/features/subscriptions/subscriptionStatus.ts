export type StoredSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
export type EffectiveSubscriptionStatus = StoredSubscriptionStatus | 'expired' | 'upcoming' | 'plan_inactive';

export interface SubscriptionPeriodInput {
  status: StoredSubscriptionStatus;
  billingInterval: 'monthly' | 'yearly' | 'manual';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  planActive?: boolean;
}

export function getEffectiveSubscriptionStatus(
  subscription: SubscriptionPeriodInput,
  now = Date.now(),
): EffectiveSubscriptionStatus {
  if (subscription.planActive === false) return 'plan_inactive';

  const start = subscription.currentPeriodStart ? Date.parse(subscription.currentPeriodStart) : null;
  const end = subscription.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : null;
  const trialEnd = subscription.trialEnd ? Date.parse(subscription.trialEnd) : null;

  if (start !== null && Number.isFinite(start) && start > now) return 'upcoming';
  if (end !== null && Number.isFinite(end) && end <= now) return 'expired';
  if (subscription.status === 'trialing' && (trialEnd === null || !Number.isFinite(trialEnd) || trialEnd <= now)) {
    return 'expired';
  }
  if (subscription.status === 'active'
      && (subscription.billingInterval === 'monthly' || subscription.billingInterval === 'yearly')
      && end === null) {
    return 'expired';
  }
  return subscription.status;
}
