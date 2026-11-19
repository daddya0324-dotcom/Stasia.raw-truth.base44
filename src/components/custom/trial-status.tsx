// @polsia:user-owned — client island that displays the caller's persisted trial.

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { type Trial, TrialResponseSchema } from '@/lib/contracts/trial';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function TrialStatus() {
  const [trial, setTrial] = useState<Trial | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let mounted = true;
    apiFetch('/api/trial', { credentials: 'include', schema: TrialResponseSchema })
      .then((response) => {
        if (!mounted) return;
        setTrial(response.trial);
        setState('ready');
      })
      .catch(() => {
        if (mounted) setState('unavailable');
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (state === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading your trial…</p>;
  }

  if (state === 'unavailable' || !trial) {
    return (
      <output className="text-sm text-muted-foreground">
        Your trial details are temporarily unavailable.
      </output>
    );
  }

  const active = trial.status === 'active';
  return (
    <div className="grid gap-3" data-testid="trial-status">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">Status</span>
        <span
          className={active ? 'font-semibold text-[var(--dayweft-evergreen)]' : 'font-semibold'}
        >
          {active ? 'Active' : 'Expired'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">Five-day free trial</span>
        <span className="font-medium">
          {active ? `${trial.daysRemaining} days remaining` : 'Ended'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">Ends</span>
        <span className="font-medium">{formatDate(trial.endsAt)}</span>
      </div>
    </div>
  );
}
