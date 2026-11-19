// @polsia:user-owned
'use client';

// TerminalReplay — a developer moment, replayed once: a command types itself behind a
// block caret, the response (JSON or log lines) streams in line by line with syntax
// colors, a short spinner turns into a drawn check and the run ends on a verified status
// line ("200 OK · signature verified").
// Product verb: CALL / INTEGRATE / VERIFY (APIs, SDKs, CLIs, webhooks, dev tools).
// When to use: the product IS an API or a developer tool and one real request/response
// tells it best; 1 command of ≤ 40 characters, 4–12 response lines. When not to: a
// non-technical audience, secrets or real keys, long logs, or a fake "AI typing" effect.
// Layouts: `split` (default: copy column + one terminal window), `full` (a wide window
// with request and response panes side by side and a status bar), `cards` (three tiles:
// request, response, verified).
// The window is always a dark surface (from the brand hue) with its own tokens, so its
// text is AA on any page or band. Driving: plays once on view (≈ 3–4 s), or follows
// `progress` / a ConceptStory. SSR/no-JS/reduced motion: the finished run, static. The
// caret only shows while typing (no blinking loop).

import { type CSSProperties, type ReactNode, useCallback, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { MUTED_TEXT, readableText } from './contrast';
import { clamp } from './easing';
import {
  CheckMark,
  drawCheck,
  easeInOut,
  easeOut,
  StageFrame,
  type StageFrameProps,
  seg,
  useStagePlay,
  wipe,
} from './stage-frame';
import styles from './stage-kit.module.css';
import { surfaceTokens } from './surface';

export type TerminalTone = 'muted' | 'accent' | 'ok' | 'alert';

export type TerminalLine = string | { text: string; tone?: TerminalTone };

export type TerminalReplayProps = StageFrameProps & {
  /** The command, without the prompt: `curl -X POST api.acme.dev/v1/verify`. ≤ 40 chars. */
  command: string;
  /** Response lines (JSON reads best; indentation is kept). */
  lines: readonly TerminalLine[];
  /** Final status line, e.g. "200 OK · signature verified". */
  status: string;
  /** Status color. Default `ok`. */
  statusTone?: 'ok' | 'alert';
  /** Window title, e.g. "api.acme.dev". */
  title?: string;
  /** Prompt glyph. Default `$`. */
  prompt?: string;
  /** Pane / tile headings for `full` and `cards`, e.g. `['Request', 'Response', 'Verified']`. */
  paneLabels?: readonly [string, string, string?];
  /** Color JSON keys, strings and numbers. Default true. */
  highlight?: boolean;
};

/** The window's own dark surface, from the brand hue. */
const TERMINAL_BG = 'oklch(from var(--primary) 0.2 min(c, 0.03) h)';
const TONE: Record<TerminalTone, string> = {
  muted: MUTED_TEXT,
  accent: readableText('var(--mk-accent)'),
  ok: readableText('var(--mk-ok)'),
  alert: readableText('var(--mk-alert)'),
};
const NUMBER = readableText('oklch(0.78 0.13 75)');
const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

function Highlighted({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [whole, str, colon, num, word, punct] = match;
    const color = str
      ? colon
        ? TONE.accent
        : TONE.ok
      : num || word
        ? NUMBER
        : punct
          ? MUTED_TEXT
          : undefined;
    parts.push(
      <span key={index} style={{ color }}>
        {str && colon ? str : whole}
      </span>,
    );
    if (str && colon)
      parts.push(
        <span key={`${index}:`} style={{ color: MUTED_TEXT }}>
          {colon}
        </span>,
      );
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// Seconds.
const LEAD = 0.25;
const LINE = 0.24;
const LINE_GAP = 0.07;
const SPIN = 0.55;
const CHECK = 0.45;

function timeline(command: string, lines: number) {
  const typeEnd = LEAD + clamp(command.length * 0.04, 0.6, 1.5);
  const linesStart = typeEnd + 0.3;
  const line = (i: number) => linesStart + i * LINE_GAP;
  const linesEnd = line(Math.max(lines - 1, 0)) + LINE;
  const spinEnd = linesEnd + 0.1 + SPIN;
  return { typeEnd, line, linesEnd, spinEnd, total: spinEnd + CHECK + 0.1 };
}

function Spinner() {
  return (
    <svg
      data-term-spin=""
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
      style={{ visibility: 'hidden' }}
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.6"
      />
      <path
        d="M10 2a8 8 0 0 1 8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TerminalReplay({
  command,
  lines,
  status,
  statusTone = 'ok',
  title,
  prompt = '$',
  paneLabels,
  highlight = true,
  layout = 'split',
  copy,
  headingAs,
  tones,
  className,
  stageClassName,
  ...play
}: TerminalReplayProps) {
  const time = useMemo(() => timeline(command, lines.length), [command, lines.length]);
  const scopeRef = useRef<HTMLDivElement>(null);
  const len = command.length;

  const render = useCallback(
    (p: number) => {
      const scope = scopeRef.current;
      if (!scope) return;
      const final = p >= 1;
      const t = p * time.total;
      const typed = final ? len : Math.round(seg(t, LEAD, time.typeEnd) * len);
      scope.querySelectorAll<HTMLElement>('[data-term-command]').forEach((node) => {
        node.style.visibility = typed > 0 ? '' : 'hidden';
        // Monospace: one `ch` per character, a true typing reveal at full color.
        node.style.clipPath = typed >= len ? '' : `inset(-0.3em ${len - typed}ch -0.3em -0.3em)`;
      });
      scope.querySelectorAll<HTMLElement>('[data-term-caret]').forEach((node) => {
        const on = !final && t >= LEAD - 0.15 && t < time.typeEnd + 0.25;
        node.style.visibility = on ? 'visible' : 'hidden';
        node.style.transform = `translate3d(${typed}ch, 0, 0)`;
      });
      scope.querySelectorAll<HTMLElement>('[data-term-line]').forEach((node, i) => {
        wipe(node, final ? 1 : easeOut(seg(t, time.line(i), time.line(i) + LINE)), {
          bleed: '0.1em',
        });
      });
      const spinning = !final && t >= time.linesEnd + 0.1 && t < time.spinEnd;
      scope.querySelectorAll<SVGElement>('[data-term-spin]').forEach((node) => {
        node.style.visibility = spinning ? 'visible' : 'hidden';
        node.style.transform = `rotate(${(easeInOut(seg(t, time.linesEnd + 0.1, time.spinEnd)) * 540).toFixed(1)}deg)`;
      });
      const q = final ? 1 : easeOut(seg(t, time.spinEnd, time.spinEnd + CHECK));
      scope.querySelectorAll<HTMLElement>('[data-term-status]').forEach((node) => {
        drawCheck(node, q);
        wipe(node.querySelector<HTMLElement>('[data-term-status-text]'), easeOut(seg(q, 0.15, 1)), {
          shift: -6,
        });
      });
      // Phase rails (cards / full): request → response → verified.
      const phases = [
        seg(t, LEAD, time.typeEnd),
        seg(t, time.line(0), time.linesEnd),
        seg(t, time.spinEnd - SPIN, time.spinEnd + CHECK),
      ];
      scope.querySelectorAll<HTMLElement>('[data-term-rail]').forEach((node) => {
        const k = Number(node.dataset.phase);
        node.style.transform = final ? '' : `scaleX(${easeInOut(phases[k] ?? 1).toFixed(4)})`;
      });
    },
    [len, time],
  );
  const { attach } = useStagePlay(render, time.total, play);

  // The window carries its own token set (dark, from the brand hue), so every text in it
  // derives from that surface whatever the page or band around it.
  const windowStyle = {
    ...surfaceTokens(TERMINAL_BG),
    '--mk-tone-mix': '35%',
    '--mk-tone-mix-large': '45%',
  } as CSSProperties;
  const statusColor = statusTone === 'alert' ? 'var(--mk-alert)' : 'var(--mk-ok)';

  const chrome = (label?: string, rail?: number) => (
    <div className="relative flex h-9 items-center gap-3 border-border border-b px-4">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2.5 rounded-full border border-border"
            style={{ background: 'var(--muted)' }}
          />
        ))}
      </span>
      {label ? (
        <span
          className="min-w-0 flex-1 truncate text-center text-[11.5px]"
          style={{ color: MUTED_TEXT }}
        >
          {label}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <span className="w-[2.6rem]" aria-hidden="true" />
      {rail !== undefined ? (
        <span className="absolute inset-x-0 bottom-[-1px] h-px" aria-hidden="true">
          <span
            data-term-rail=""
            data-phase={rail}
            className="absolute inset-0 origin-left"
            style={{ background: 'var(--mk-accent)' }}
          />
        </span>
      ) : null}
    </div>
  );
  const commandLine = (
    <p className={cn(styles.termLine, 'flex gap-[1ch]')}>
      <span style={{ color: TONE.ok }} aria-hidden="true">
        {prompt}
      </span>
      <span className={styles.termCommand}>
        <span data-term-command="">{command}</span>
        <span
          data-term-caret=""
          className={styles.termCaret}
          style={{ visibility: 'hidden' }}
          aria-hidden="true"
        />
      </span>
    </p>
  );
  const response = (
    <div>
      {lines.map((line, i) => {
        const text = typeof line === 'string' ? line : line.text;
        const tone = typeof line === 'string' ? undefined : line.tone;
        return (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: response lines repeat (`}`)
            key={i}
            data-term-line=""
            className={styles.termLine}
            style={tone ? { color: TONE[tone] } : undefined}
          >
            {highlight && !tone ? <Highlighted text={text} /> : text}
            {text === '' ? '\u00a0' : null}
          </p>
        );
      })}
    </div>
  );
  const statusLine = (big = false) => (
    <p
      data-term-status=""
      className={cn('flex items-center gap-2.5', big && 'flex-col items-start gap-3')}
      style={{ color: readableText(statusColor) }}
    >
      <span className="grid place-items-center [&>*]:[grid-area:1/1]">
        <Spinner />
        <CheckMark size={big ? 28 : 18} color="currentColor" />
      </span>
      <span data-term-status-text="" className={cn('font-medium', big && 'text-[15px]')}>
        {status}
      </span>
    </p>
  );
  const heading = (k: number) =>
    paneLabels?.[k] ? (
      <p
        className="mb-2.5 font-sans font-medium text-[11px] uppercase tracking-[0.08em]"
        style={{ color: MUTED_TEXT }}
      >
        <span className="tabular-nums" style={{ color: 'var(--foreground)' }}>
          {String(k + 1).padStart(2, '0')}
        </span>{' '}
        {paneLabels[k]}
      </p>
    ) : null;

  let body: ReactNode;
  if (layout === 'cards') {
    const tile = (k: number, content: ReactNode) => (
      <div className={cn(styles.term, 'flex flex-col')} style={windowStyle}>
        {chrome(k === 0 ? title : undefined, k)}
        <div className={cn(styles.termBody, 'flex-1')}>
          {heading(k)}
          {content}
        </div>
      </div>
    );
    body = (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.85fr)]">
        {tile(0, commandLine)}
        {tile(1, response)}
        {tile(2, statusLine(true))}
      </div>
    );
  } else if (layout === 'full') {
    body = (
      <div className={styles.term} style={windowStyle}>
        {chrome(title)}
        <div className="grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div
            className={cn(
              styles.termBody,
              'relative border-border border-b md:border-r md:border-b-0',
            )}
          >
            {heading(0)}
            {commandLine}
            <span className="absolute inset-x-0 bottom-[-1px] h-px md:hidden" aria-hidden="true">
              <span
                data-term-rail=""
                data-phase={0}
                className="absolute inset-0 origin-left"
                style={{ background: 'var(--mk-accent)' }}
              />
            </span>
          </div>
          <div className={styles.termBody}>
            {heading(1)}
            {response}
          </div>
        </div>
        <div className="relative border-border border-t px-4 py-3 font-mono text-[12px] sm:px-5 sm:text-[13px]">
          <span className="absolute inset-x-0 top-[-1px] h-px" aria-hidden="true">
            <span
              data-term-rail=""
              data-phase={1}
              className="absolute inset-0 origin-left"
              style={{ background: 'var(--mk-accent)' }}
            />
          </span>
          {statusLine()}
        </div>
      </div>
    );
  } else {
    body = (
      <div className={styles.term} style={windowStyle}>
        {chrome(title)}
        <div className={styles.termBody}>
          {commandLine}
          <div className="mt-3">{response}</div>
          <div className="mt-4 border-border border-t pt-3">{statusLine()}</div>
        </div>
      </div>
    );
  }

  return (
    <StageFrame
      name="terminal-replay"
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
