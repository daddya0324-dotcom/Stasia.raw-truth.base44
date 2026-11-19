// @polsia:user-owned
'use client';

// NotificationStream — the business's own events (alerts, tickets, messages, leads)
// arrive one by one into a stack, newest on top, pushing the others down (an "animated
// list"); then the stack sorts itself (FLIP: alerts that need a human first, then
// routed, then auto-closed) and each event is resolved: a ring + check draws around its
// dot and its outcome pill wipes in ("Escalated", "Routed to Billing"). The header
// counter rolls up as events arrive and the resolution label wipes in at the end.
// Product verb: TRIAGE / ROUTE / RESOLVE (alerting, support, inbox, lead routing).
// When to use: a product whose value is "the incoming flood gets handled", with 4–7
// real event types of the domain. When not to: a feed of invented users or numbers,
// more than ~8 items, or a product that transforms one document (DocumentAssemble).
// Layouts: `split` (default: copy column + floating notification stack), `full` (a wide
// inbox table, copy centered above), `cards` (tiles that fill a grid, then regroup).
// Driving: plays once on view (≈ 3–4 s), or follows `progress` / a ConceptStory.
// SSR/no-JS/reduced motion: the sorted, resolved stack, static. Only transform,
// clip-path, stroke-dashoffset and visibility move; the list's size never changes.

import { useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { MUTED_TEXT, readableText } from './contrast';
import { clamp } from './easing';
import {
  CheckMark,
  drawCheck,
  easeInOut,
  easeOut,
  lerp,
  Roll,
  StageFrame,
  type StageFrameProps,
  seg,
  setRoll,
  useMeasure,
  useStagePlay,
  wipe,
} from './stage-frame';
import styles from './stage-kit.module.css';

export type NotificationTone = 'neutral' | 'alert' | 'ok';

export type NotificationItem = {
  id?: string;
  /** Main line: "Payment failed · Acme", "New lead · Lyon". */
  title: string;
  /** Second line: source, time, reference. */
  meta?: string;
  /** `alert` (needs a human) sorts first, `ok` (auto-resolved) last. Default `neutral`. */
  tone?: NotificationTone;
  /** Outcome pill shown once resolved: "Escalated", "Routed to Billing". */
  status?: string;
};

export type NotificationStreamProps = StageFrameProps & {
  /** Events in arrival order (4–7 reads best). */
  items: readonly NotificationItem[];
  /** Header text above the stack, e.g. "Incoming". */
  title?: string;
  /** Wiped in at the end next to the header, e.g. "All triaged". */
  resolutionLabel?: string;
  /** Regroup by tone after arrival (alert → neutral → ok). Default true. */
  sort?: boolean;
};

const RANK: Record<NotificationTone, number> = { alert: 0, neutral: 1, ok: 2 };
const TONE: Record<NotificationTone, string> = {
  alert: 'var(--mk-alert)',
  neutral: 'var(--mk-accent)',
  ok: 'var(--mk-ok)',
};

// Seconds.
const ARRIVE = 0.34;
const ENTER = 0.5;
const PUSH = 0.36;
const PUSH_LEAD = 0.16;
const HOLD = 0.3;
const SORT = 0.7;
const RESOLVE_GAP = 0.08;
const RESOLVE = 0.5;
const LABEL = 0.5;

function timeline(count: number, sort: boolean) {
  const start = (a: number) => a * ARRIVE;
  const arrived = start(Math.max(count - 1, 0)) + PUSH_LEAD + ENTER;
  const sortStart = arrived + HOLD;
  const sortEnd = sortStart + (sort ? SORT : 0);
  const resolveStart = (d: number) => sortEnd - (sort ? 0.15 : 0) + d * RESOLVE_GAP;
  const resolveEnd = resolveStart(Math.max(count - 1, 0)) + RESOLVE;
  const labelStart = resolveEnd - 0.2;
  return { start, sortStart, resolveStart, labelStart, total: labelStart + LABEL };
}

export function NotificationStream({
  items,
  title,
  resolutionLabel,
  sort = true,
  layout = 'split',
  copy,
  headingAs,
  tones,
  className,
  stageClassName,
  ...play
}: NotificationStreamProps) {
  const n = items.length;
  const stack = layout !== 'cards';
  // Display (DOM) order = the final order. Arrival order is `items` order.
  const order = useMemo(() => {
    const arrival = items.map((item, a) => ({ item, a }));
    // Stack: newest on top. Cards: reading order.
    const resting = stack ? [...arrival].reverse() : arrival;
    if (!sort) return resting;
    return [...resting].sort(
      (x, y) => RANK[x.item.tone ?? 'neutral'] - RANK[y.item.tone ?? 'neutral'],
    );
  }, [items, sort, stack]);
  const listRef = useRef<HTMLUListElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const pos = useRef<{ x: number; y: number }[]>([]);
  const time = useMemo(() => timeline(n, sort), [n, sort]);

  const render = useCallback(
    (p: number) => {
      const list = listRef.current;
      if (!list) return;
      const final = p >= 1;
      const t = p * time.total;
      const slots = pos.current;
      const at = (slot: number) => {
        const lo = slots[clamp(Math.floor(slot), 0, n - 1)] ?? { x: 0, y: 0 };
        const hi = slots[clamp(Math.ceil(slot), 0, n - 1)] ?? lo;
        const f = slot - Math.floor(slot);
        return { x: lerp(lo.x, hi.x, f), y: lerp(lo.y, hi.y, f) };
      };
      const rows = list.querySelectorAll<HTMLElement>('[data-ns-row]');
      rows.forEach((row) => {
        const a = Number(row.dataset.a);
        const d = Number(row.dataset.d);
        const status = row.querySelector<HTMLElement>('[data-ns-status]');
        const check = row.querySelector<HTMLElement>('[data-ns-check]');
        const dot = row.querySelector<HTMLElement>('[data-ns-dot]');
        if (final) {
          wipe(row, 1);
          wipe(status, 1);
          drawCheck(check, 1);
          if (dot) dot.style.transform = 'scale(0)';
          row.style.zIndex = '';
          return;
        }
        // The stack makes room first, then the new row drops into the freed slot.
        const enter = easeOut(seg(t, time.start(a) + PUSH_LEAD, time.start(a) + PUSH_LEAD + ENTER));
        // Stack: each newer arrival pushes this row one slot down.
        let slot = a;
        if (stack) {
          slot = 0;
          for (let b = a + 1; b < n; b++) {
            slot += easeInOut(seg(t, time.start(b), time.start(b) + PUSH));
          }
        }
        const from = at(slot);
        const to = slots[d] ?? from;
        const s = sort
          ? easeInOut(seg(t, time.sortStart + d * 0.03, time.sortStart + d * 0.03 + SORT))
          : 1;
        const x = lerp(from.x, to.x, s) - to.x;
        const y = lerp(from.y, to.y, s) - to.y + (1 - enter) * -14;
        row.style.visibility = enter > 0 ? 'visible' : 'hidden';
        row.style.clipPath =
          enter < 1 ? `inset(-1px -1px ${((1 - enter) * 100).toFixed(2)}% -1px round 14px)` : '';
        row.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(0.97 + 0.03 * enter).toFixed(4)})`;
        // Rows travelling up during the sort pass over the ones going down.
        row.style.zIndex = s > 0 && s < 1 ? String(n - d + 1) : '';
        const q = easeOut(seg(t, time.resolveStart(d), time.resolveStart(d) + RESOLVE));
        drawCheck(check, q);
        // The waiting dot shrinks away as the check ring closes around it.
        if (dot) dot.style.transform = `scale(${(1 - easeOut(seg(q, 0, 0.5))).toFixed(3)})`;
        wipe(status, easeOut(seg(q, 0.3, 1)), { shift: -6 });
      });
      const header = headerRef.current;
      if (header) {
        let count = 0;
        for (let a = 0; a < n; a++) count += easeInOut(seg(t, time.start(a), time.start(a) + 0.3));
        setRoll(header.querySelector('[data-roll]'), final ? n : clamp(count, 0, n), final);
        wipe(
          header.querySelector<HTMLElement>('[data-ns-label]'),
          final ? 1 : easeOut(seg(t, time.labelStart, time.total)),
          { shift: -6 },
        );
        drawCheck(
          header.querySelector('[data-ns-label]'),
          final ? 1 : easeOut(seg(t, time.labelStart, time.total)),
        );
      }
    },
    [n, sort, stack, time],
  );

  const { attach, redraw } = useStagePlay(render, time.total, play);
  useMeasure(listRef, () => {
    const list = listRef.current;
    if (!list) return;
    pos.current = Array.from(list.querySelectorAll<HTMLElement>('[data-ns-row]'), (row) => ({
      x: row.offsetLeft,
      y: row.offsetTop,
    }));
    redraw();
  }, [layout, n, sort]);

  const counts = useMemo(() => Array.from({ length: n + 1 }, (_, i) => String(i)), [n]);
  const header =
    title || resolutionLabel ? (
      <div
        ref={headerRef}
        className={cn(
          // Wraps on a narrow stage: the resolution label drops under the title instead
          // of running past the frame edge.
          'mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5',
          layout === 'full' && 'mb-0 border-border border-b px-5 py-3.5',
        )}
      >
        <p className="flex items-center gap-2 font-medium text-[13px] tracking-[-0.005em]">
          {title}
          {n ? (
            <span
              className="inline-flex min-w-6 justify-center rounded-full border border-border px-1.5 py-0.5 font-medium text-[11px] tabular-nums leading-none"
              style={{ color: MUTED_TEXT }}
            >
              <span className="sr-only">{n}</span>
              <Roll labels={counts} index={n} className="py-px" />
            </span>
          ) : null}
        </p>
        {resolutionLabel ? (
          <p
            data-ns-label=""
            className="flex items-center gap-1.5 font-medium text-[12px]"
            style={{ color: readableText('var(--mk-ok)') }}
          >
            <CheckMark size={14} />
            {resolutionLabel}
          </p>
        ) : null}
      </div>
    ) : null;

  const list = (
    <ul ref={listRef} className={styles.nsList}>
      {order.map(({ item, a }, d) => {
        const tone = TONE[item.tone ?? 'neutral'];
        const glyph = (
          <span
            className={styles.nsGlyph}
            style={{ background: `color-mix(in oklab, ${tone} 13%, var(--card))` }}
            aria-hidden="true"
          >
            <span
              data-ns-dot=""
              className="size-2 rounded-full"
              style={{ background: tone, transform: 'scale(0)' }}
            />
            <span data-ns-check="" className="grid place-items-center">
              <CheckMark size={32} color={tone} />
            </span>
          </span>
        );
        const pill = item.status ? (
          <span
            data-ns-status=""
            className="shrink-0 self-center whitespace-nowrap rounded-full border px-2.5 py-1 font-medium text-[12px] leading-none"
            style={{
              color: readableText(tone),
              background: `color-mix(in oklab, ${tone} 12%, var(--card))`,
              borderColor: `color-mix(in oklab, ${tone} 36%, transparent)`,
            }}
          >
            {item.status}
          </span>
        ) : null;
        const text = (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-[14px] leading-tight tracking-[-0.005em]">
              {item.title}
            </span>
            {item.meta ? (
              <span
                className="mt-1 block truncate text-[12px] leading-tight"
                style={{ color: MUTED_TEXT }}
              >
                {item.meta}
              </span>
            ) : null}
          </span>
        );
        return (
          <li
            key={item.id ?? item.title}
            data-ns-row=""
            data-a={a}
            data-d={d}
            className={styles.nsRow}
          >
            {layout === 'cards' ? (
              <>
                <span className="flex items-center justify-between gap-3">
                  {glyph}
                  {pill}
                </span>
                {text}
              </>
            ) : (
              <>
                {glyph}
                {text}
                {pill}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <StageFrame
      name="notification-stream"
      layout={layout}
      copy={copy}
      headingAs={headingAs}
      tones={tones}
      className={className}
      stageClassName={stageClassName}
      stageRef={attach}
    >
      {layout === 'full' ? (
        <div className={cn(styles.card, 'overflow-hidden')}>
          {header}
          {list}
        </div>
      ) : (
        <>
          {header}
          {list}
        </>
      )}
    </StageFrame>
  );
}
