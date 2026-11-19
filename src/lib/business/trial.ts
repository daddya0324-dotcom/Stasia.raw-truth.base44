// @polsia:user-owned — app-specific free-trial rules for personal accounts.

export const TRIAL_DURATION_DAYS = 5;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type TrialStatus = 'active' | 'expired';

export function getTrialStatus(endsAt: Date, now = new Date()): TrialStatus {
  return now.getTime() < endsAt.getTime() ? 'active' : 'expired';
}

export function getDaysRemaining(endsAt: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}
