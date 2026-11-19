// @polsia:user-owned

import { describe, expect, it } from 'vitest';
import {
  getDaysRemaining,
  getTrialStatus,
  TRIAL_DURATION_DAYS,
  TRIAL_DURATION_MS,
} from '@/lib/business/trial';

describe('personal free-trial rules', () => {
  it('keeps a newly created entitlement active for five days', () => {
    const startsAt = new Date('2026-01-01T12:00:00.000Z');
    const endsAt = new Date(startsAt.getTime() + TRIAL_DURATION_MS);

    expect(TRIAL_DURATION_DAYS).toBe(5);
    expect(endsAt.getTime() - startsAt.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
    expect(getTrialStatus(endsAt, new Date('2026-01-04T12:00:00.000Z'))).toBe('active');
    expect(getDaysRemaining(endsAt, new Date('2026-01-04T12:00:00.000Z'))).toBe(2);
  });

  it('marks the entitlement expired at and after its recorded end', () => {
    const endsAt = new Date('2026-01-06T12:00:00.000Z');

    expect(getTrialStatus(endsAt, endsAt)).toBe('expired');
    expect(getDaysRemaining(endsAt, new Date('2026-01-09T12:00:00.000Z'))).toBe(0);
  });
});
