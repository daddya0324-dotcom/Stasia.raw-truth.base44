// @polsia:user-owned — authenticated read of the caller's personal trial.

import 'server-only';

import { getDaysRemaining, getTrialStatus } from '@/lib/business/trial';
import { TrialResponseSchema } from '@/lib/contracts/trial';
import { prisma } from '@/lib/db';
import { requireAuth, type SessionUser } from '@/lib/require-auth';

export async function GET(request: Request) {
  let user: SessionUser;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as Response;
  }

  const trial = await prisma.freeTrial.findUnique({ where: { userId: user.id } });
  if (!trial) {
    return Response.json({ error: 'Trial entitlement not found' }, { status: 404 });
  }

  return Response.json(
    TrialResponseSchema.parse({
      trial: {
        status: getTrialStatus(trial.endsAt),
        startsAt: trial.startsAt.toISOString(),
        endsAt: trial.endsAt.toISOString(),
        daysRemaining: getDaysRemaining(trial.endsAt),
      },
    }),
  );
}
