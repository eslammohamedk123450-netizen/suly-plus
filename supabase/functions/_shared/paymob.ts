export function isPaymobIntegrationId(value: string): boolean {
  return /^\d+$/.test(value);
}
