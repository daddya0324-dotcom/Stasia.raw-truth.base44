// @polsia:user-owned — shared response contract for the personal trial API.

import { z } from 'zod';

export const TrialSchema = z.object({
  status: z.enum(['active', 'expired']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  daysRemaining: z.number().int().nonnegative(),
});

export const TrialResponseSchema = z.object({ trial: TrialSchema });

export type Trial = z.infer<typeof TrialSchema>;
export type TrialResponse = z.infer<typeof TrialResponseSchema>;
