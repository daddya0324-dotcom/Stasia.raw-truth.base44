// @polsia:user-owned
'use client';

// DocumentAssemble — a document or form of the business (an invoice, a KYC file, a
// contract, a claim) fills itself field by field: each value types in behind a caret
// while its underline draws, a check closes it, a hairline rail counts the fields, and
// the finished sheet is stamped ("Validated", "Signed", "Approved").
// Product verb: EXTRACT / FILL / VALIDATE (OCR, onboarding, KYC, e-signature, claims).
// When to use: the product turns a pile of inputs into one complete, checked document;
// use 4–8 fields with the domain's real labels and example values. When not to: a
// generic "form" with lorem fields, real customer data, or more than ~9 fields.
// Layouts: `split` (default: copy column + the sheet), `full` (a wide sheet: summary
// column with the stamp, fields in three columns), `cards` (one tile per field, a header
// tile and a stamp tile).
// Driving: plays once on view (≈ 3–4 s), or follows `progress` / a ConceptStory.
// SSR/no-JS/reduced motion: the filled, stamped document, static. Values are revealed by
// a stepped clip-path at full color (a typing look), never faded.

import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { MUTED_TEXT, readableText } from './contrast';
import { clamp } from './easing';
import type { StyleWithVars } from './hooks';
import {
  CheckMark,
  drawCheck,
  easeOut,
  easeOutBack,
  Roll,
  StageFrame,
  type StageFrameProps,
  seg,
  setRoll,
  useStagePlay,
  wipe,
} from './stage-frame';
import styles from './stage-kit.module.css';

export type DocumentField = {
  /** Field label: "IBAN", "Due date", "Signatory". */
  label: string;
  /** Example value: "FR76 3000 4000 …", "30 Apr 2026". */
  value: string;
  /** Span the full row (long values). */
  wide?: boolean;
};

export type DocumentAssembleProps = StageFrameProps & {
  /** Document title, e.g. "Invoice F-2041". */
  title: string;
  /** Second line, e.g. "Acme SAS · received by email". */
  subtitle?: string;
  /** Fields in fill order (4–8 reads best). */
  fields: readonly DocumentField[];
  /** Stamp text, e.g. "Validated". Short: one or two words. */
  stamp: string;
  /** Small line next to the stamp, e.g. "Checked against the PO". */
  stampCaption?: string;
  /** Stamp color (any CSS color). Default the `ok` tone. */
  color?: string;
};

// Seconds.
const LEAD = 0.2;
const FIELD_GAP = 0.4;
const CHECK = 0.35;
const STAMP = 0.55;

function typeTime(value: string) {
  return clamp(value.length * 0.035, 0.35, 0.75);
}

function timeline(fields: readonly DocumentField[]) {
  const starts = fields.map((_, i) => LEAD + i * FIELD_GAP);
  const ends = fields.map((field, i) => (starts[i] ?? 0) + typeTime(field.value));
  const lastEnd = Math.max(LEAD, ...ends);
  const stampStart = lastEnd + CHECK;
  return { starts, ends, stampStart, total: stampStart + STAMP + 0.35 };
}

function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className="shrink-0">
      <path
        d="M5.5 2.75h6l3.75 3.75v10a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75v-13a.75.75 0 0 1 .75-.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 2.75V6.5h3.75M7.5 10.5h5M7.5 13.25h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DocumentAssemble({
  title,
  subtitle,
  fields,
  stamp,
  stampCaption,
  color = 'var(--mk-ok)',
  layout = 'split',
  copy,
  headingAs,
  tones,
  className,
  stageClassName,
  ...play
}: DocumentAssembleProps) {
  const n = fields.length;
  const time = useMemo(() => timeline(fields), [fields]);
  const scopeRef = useRef<HTMLDivElement>(null);

  const render = useCallback(
    (p: number) => {
      const scope = scopeRef.current;
      if (!scope) return;
      const final = p >= 1;
      const t = p * time.total;
      let filled = 0;
      scope.querySelectorAll<HTMLElement>('[data-doc-field]').forEach((field, i) => {
        const start = time.starts[i] ?? 0;
        const end = time.ends[i] ?? start;
        const typed = final ? 1 : seg(t, start, end);
        const len = Math.max(fields[i]?.value.length ?? 1, 1);
        // Stepped by characters: a typing look, at full color.
        const shown = typed >= 1 ? 1 : Math.ceil(typed * len) / len;
        const value = field.querySelector<HTMLElement>('[data-doc-value]');
        if (value) {
          if (shown >= 1) {
            value.style.clipPath = '';
            value.style.visibility = '';
          } else {
            value.style.visibility = shown > 0 ? 'visible' : 'hidden';
            value.style.clipPath = `inset(-0.3em ${((1 - shown) * 100).toFixed(2)}% -0.3em -0.3em)`;
          }
        }
        const caret = field.querySelector<HTMLElement>('[data-doc-caret]');
        if (caret) {
          const on = !final && t >= start - 0.12 && typed < 1;
          caret.style.visibility = on ? 'visible' : 'hidden';
          caret.style.transform = `translate3d(${((shown - 1) * 100).toFixed(2)}%, 0, 0)`;
        }
        const line = field.querySelector<HTMLElement>('[data-doc-line]');
        if (line) line.style.transform = final ? '' : `scaleX(${easeOut(typed).toFixed(4)})`;
        const q = final ? 1 : easeOut(seg(t, end, end + CHECK));
        drawCheck(field.querySelector('[data-doc-check]'), q);
        filled += q >= 1 ? 1 : 0;
      });
      scope.querySelectorAll<HTMLElement>('[data-doc-rail]').forEach((rail) => {
        rail.style.transform = final ? '' : `scaleX(${(n ? filled / n : 1).toFixed(4)})`;
      });
      scope.querySelectorAll('[data-doc-count] [data-roll]').forEach((roll) => {
        setRoll(roll, final ? n : filled, final);
      });
      const q = final ? 1 : seg(t, time.stampStart, time.stampStart + STAMP);
      scope.querySelectorAll<HTMLElement>('[data-doc-stamp]').forEach((node) => {
        if (q >= 1) {
          node.style.visibility = '';
          node.style.transform = '';
          return;
        }
        // The stamp lands: a short scale-down with a slight overshoot.
        const k = easeOutBack(q);
        node.style.visibility = q > 0 ? 'visible' : 'hidden';
        node.style.transform = `scale(${(1.22 - 0.22 * k).toFixed(4)}) rotate(${((1 - k) * -5).toFixed(2)}deg)`;
      });
      scope.querySelectorAll<HTMLElement>('[data-doc-caption]').forEach((node) => {
        wipe(node, final ? 1 : easeOut(seg(t, time.stampStart + 0.25, time.total)), { shift: -6 });
      });
    },
    [fields, n, time],
  );
  const { attach } = useStagePlay(render, time.total, play);

  const counts = useMemo(() => Array.from({ length: n + 1 }, (_, i) => String(i)), [n]);
  const stampStyle: StyleWithVars = { '--mk-stamp': color, color: readableText(color) };

  const counter = (
    <span
      data-doc-count=""
      className="inline-flex items-center gap-1 font-medium text-[12px] tabular-nums"
      style={{ color: MUTED_TEXT }}
    >
      <span className="sr-only">
        {n} / {n}
      </span>
      <Roll labels={counts} index={n} />
      <span aria-hidden="true">/ {n}</span>
    </span>
  );
  const heading = (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-border"
        style={{ color: MUTED_TEXT }}
      >
        <DocIcon />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[15px] leading-tight tracking-[-0.01em]">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1 truncate text-[12.5px] leading-tight" style={{ color: MUTED_TEXT }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
  const rail = (
    <div className={styles.rail} aria-hidden="true">
      <div data-doc-rail="" className={styles.railFill} />
    </div>
  );
  const stampNode = (
    <span data-doc-stamp="" className={styles.docStamp} style={stampStyle}>
      <CheckMark size={16} color="currentColor" />
      {stamp}
    </span>
  );
  const caption = stampCaption ? (
    <p data-doc-caption="" className="text-[12.5px] leading-snug" style={{ color: MUTED_TEXT }}>
      {stampCaption}
    </p>
  ) : null;

  const field = (item: DocumentField, i: number, tile = false) => (
    <div
      key={`${i}-${item.label}`}
      data-doc-field=""
      className={cn(
        'min-w-0',
        item.wide && !tile && styles.docFieldWide,
        tile && cn(styles.card, 'p-4'),
        tile && item.wide && 'sm:col-span-2',
      )}
    >
      <p
        className="mb-1.5 font-medium text-[11px] uppercase tracking-[0.07em]"
        style={{ color: MUTED_TEXT }}
      >
        {item.label}
      </p>
      <div className={styles.docValue}>
        <span className="relative min-w-0 max-w-full">
          <span
            data-doc-value=""
            className="block truncate font-medium text-[14px] leading-tight tracking-[-0.005em]"
          >
            {item.value}
          </span>
          <span
            data-doc-caret=""
            className={styles.docCaretTrack}
            style={{ visibility: 'hidden' }}
            aria-hidden="true"
          />
        </span>
        <span data-doc-check="" className="ml-auto">
          <CheckMark size={16} />
        </span>
        <span data-doc-line="" className={styles.docUnderline} aria-hidden="true" />
      </div>
    </div>
  );

  let body: ReactNode;
  if (layout === 'cards') {
    body = (
      <div className={cn(styles.docTiles, 'grid gap-3')}>
        <div className={cn(styles.card, 'col-span-full flex flex-col gap-4 p-5')}>
          <div className="flex items-start justify-between gap-4">
            {heading}
            {counter}
          </div>
          {rail}
        </div>
        {fields.map((item, i) => field(item, i, true))}
        <div
          className={cn(
            styles.card,
            'col-span-full flex flex-wrap items-center justify-between gap-4 px-5 py-4',
          )}
        >
          {caption ?? <span />}
          {stampNode}
        </div>
      </div>
    );
  } else if (layout === 'full') {
    body = (
      <div
        className={cn(
          styles.card,
          'grid overflow-hidden md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]',
        )}
      >
        <div className="flex flex-col gap-5 border-border border-b p-5 md:border-r md:border-b-0 md:p-6">
          {heading}
          <div className="flex flex-col gap-2">
            {rail}
            {counter}
          </div>
          <div className="mt-auto flex flex-col items-start gap-3 pt-2">
            {stampNode}
            {caption}
          </div>
        </div>
        <div className={cn(styles.docFields, 'p-5 md:p-6')}>
          {fields.map((item, i) => field(item, i))}
        </div>
      </div>
    );
  } else {
    body = (
      <div className={cn(styles.card, 'overflow-hidden')}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          {heading}
          {counter}
        </div>
        <div className="px-5">{rail}</div>
        <div className={cn(styles.docFields, 'p-5')}>{fields.map((item, i) => field(item, i))}</div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-border border-t px-5 py-4">
          {caption ?? <span />}
          {stampNode}
        </div>
      </div>
    );
  }

  return (
    <StageFrame
      name="document-assemble"
      layout={layout}
      copy={copy}
      headingAs={headingAs}
      tones={tones}
      className={className}
      stageClassName={stageClassName}
      stageRef={attach}
    >
      <div ref={scopeRef}>{body}</div>
    </StageFrame>
  );
}
