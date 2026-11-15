import { describe, expect, it } from 'vitest';
import { getEffectiveSubscriptionStatus } from './subscriptionStatus';

const now = Date.parse('2026-11-16T12:00:00.000Z');

describe('effective subscription status', () => {
  it('marks a recurring subscription expired when its billing period ended', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'active',
      billingInterval: 'monthly',
      currentPeriodStart: '2026-10-16T00:00:00.000Z',
      currentPeriodEnd: '2026-11-15T00:00:00.000Z',
      trialEnd: null,
    }, now)).toBe('expired');
  });

  it('marks a monthly or yearly subscription without an end date as expired', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'active',
      billingInterval: 'yearly',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: null,
      trialEnd: null,
    }, now)).toBe('expired');
  });

  it('keeps an active manual subscription without an end date active', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'active',
      billingInterval: 'manual',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: null,
      trialEnd: null,
    }, now)).toBe('active');
  });

  it('marks a trial expired when no trial end date is set', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'trialing',
      billingInterval: 'manual',
      currentPeriodStart: '2026-11-01T00:00:00.000Z',
      currentPeriodEnd: null,
      trialEnd: null,
    }, now)).toBe('expired');
  });

  it('keeps a trial active until its trial end date', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'trialing',
      billingInterval: 'monthly',
      currentPeriodStart: '2026-11-01T00:00:00.000Z',
      currentPeriodEnd: null,
      trialEnd: '2026-11-20T12:00:00.000Z',
    }, now)).toBe('trialing');
  });

  it('marks a subscription with a future start date as upcoming', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'active',
      billingInterval: 'manual',
      currentPeriodStart: '2026-11-17T00:00:00.000Z',
      currentPeriodEnd: null,
      trialEnd: null,
    }, now)).toBe('upcoming');
  });

  it('preserves non-active lifecycle states', () => {
    expect(getEffectiveSubscriptionStatus({
      status: 'past_due',
      billingInterval: 'monthly',
      currentPeriodStart: '2026-11-01T00:00:00.000Z',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      trialEnd: null,
    }, now)).toBe('past_due');
  });
});
