/** Quotas journaliers — même payload que /api/auth/me et /api/auth/google. */

export interface UsageQuota {
  period_date: string;
  messages_used: number;
  messages_limit: number;
  messages_remaining: number;
  live_minutes_used: number;
  live_minutes_limit: number;
  live_minutes_remaining: number;
  investigations_used: number;
  investigations_limit: number;
  investigations_remaining: number;
}

export function formatQuotaLine(
  used: number,
  limit: number,
  unit: string,
): string {
  if (limit <= 0) return `${used} ${unit}`;
  return `${used}/${limit} ${unit}`;
}
