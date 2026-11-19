// @polsia:user-owned
'use client';

// Shared plumbing of the "product verb" primitives (NotificationStream, DocumentAssemble,
// KanbanFlow, TerminalReplay, MetricShift): one play clock, one layout frame, and the
// few DOM helpers they all draw with.
// - Play clock: plays ONCE when the stage scrolls into view (judged on its layout box by
//   `useRevealState`, so a clip-path wipe never blocks the trigger), or follows an
//   explicit `progress` / the enclosing ConceptStory. Every primitive is a pure
//   `render(p)` over p = 0 → 1 that writes transform / clip-path / stroke-dashoffset /
//   visibility straight to the DOM (no per-frame React renders). p = 1 clears every
//   inline style, so the server HTML, no-JS and reduced motion are the final state.
// - Layout frame: `layout="full" | "split" | "cards"` + optional `copy` (eyebrow, title,
//   body). The copy is static text at full color; only the stage moves.
// Text is never faded: it enters by a clip-path wipe or a roll through a clipped window,
// at full color, and is `visibility: hidden` before it starts.

import { animate, useMotionValue, useScroll } from 'motion/react';
import type { ElementType, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  type ConceptTones,
  STANDALONE_OFFSET,
  type StageProgressOptions,
  toneStyle,
  useConceptProgress,
  useDefaultStageRange,
  useSceneShown,
  useStageProgress,
} from './concept-story';
import conceptStyles from './concept-story.module.css';
import { MUTED_TEXT } from './contrast';
import { clamp } from './easing';
import { type StyleWithVars, useRevealState, useShouldReduceMotion } from './hooks';
import styles from './stage-kit.module.css';
import { useSurface } from './surface';

/** Composition of a product-verb primitive. */
export type StageLayout = 'full' | 'split' | 'cards';

/** Optional copy rendered by the layout frame (static, full color). */
export type StageCopy = {
  /** Short label above the title ("Triage"). */
  eyebrow?: string;
  title: string;
  /** About two sentences. */
  body?: ReactNode;
};

/** Driving options shared by the product-verb primitives. */
export type StagePlayOptions = StageProgressOptions & {
  /**
   * Inside a ConceptStory (and without `progress`), follow the story's scroll. Default
   * true; `false` = play once on view, as outside a story.
   */
  followStory?: boolean;
  /** Seconds before the play-once entrance starts. Default 0. */
  delay?: number;
};

/** Props every product-verb primitive takes besides its data. */
export type StageFrameProps = StagePlayOptions & {
  layout?: StageLayout;
  copy?: StageCopy;
  /** Heading tag of `copy.title`. Default `h3`. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Tone colors (`accent`, `ok`, `alert`); any CSS color, text stays AA. */
  tones?: ConceptTones;
  className?: string;
  /** Classes for the stage element (the animated visual). */
  stageClassName?: string;
};

/* ---------------------------------------------------------------------------------- */
/* Timing helpers                                                                       */
/* ---------------------------------------------------------------------------------- */

/** 0→1 progress of `t` through `[start, end]`. */
export const seg = (t: number, start: number, end: number) =>
  clamp((t - start) / (end - start || 1), 0, 1);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Ease-out with a slight overshoot (stamps, pops). */
export const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/* ---------------------------------------------------------------------------------- */
/* DOM helpers (all text at full color)                                                 */
/* ---------------------------------------------------------------------------------- */

type WipeFrom = 'left' | 'top' | 'bottom';

/**
 * Uncovers `node` as `q` goes 0→1 by a clip-path wipe (plus an optional lift in px).
 * Hidden before it starts; every inline style is cleared at 1 (the final, SSR state).
 */
export function wipe(
  node: HTMLElement | SVGElement | null | undefined,
  q: number,
  {
    from = 'left',
    lift = 0,
    shift = 0,
    bleed = '0.25em',
  }: {
    from?: WipeFrom;
    lift?: number;
    shift?: number;
    bleed?: string;
  } = {},
) {
  if (!node) return;
  const style = node.style;
  if (q >= 1) {
    style.visibility = '';
    style.clipPath = '';
    style.transform = '';
    return;
  }
  style.visibility = q > 0 ? 'visible' : 'hidden';
  const rest = pct(1 - q);
  const b = `-${bleed}`;
  style.clipPath =
    from === 'left'
      ? `inset(${b} ${rest} ${b} ${b})`
      : from === 'top'
        ? `inset(${b} ${b} ${rest} ${b})`
        : `inset(${rest} ${b} ${b} ${b})`;
  const x = (1 - q) * shift;
  const y = (1 - q) * lift;
  style.transform = x || y ? `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` : '';
}

/** Draws an SVG stroke drawn with `pathLength="1"` (DrawSVG-style dash offset). */
export function draw(node: SVGElement | null | undefined, q: number) {
  if (!node) return;
  if (q >= 1) {
    node.style.strokeDasharray = '';
    node.style.strokeDashoffset = '';
    node.style.visibility = '';
    return;
  }
  node.style.visibility = q > 0.001 ? 'visible' : 'hidden';
  // Dashes only while drawing: the resting stroke is plain (no dash artefacts).
  node.style.strokeDasharray = '1 1';
  node.style.strokeDashoffset = (1 - q).toFixed(4);
}

/** Sets a transform on `node`, or clears it at the final state. */
export function setTransform(node: HTMLElement | SVGElement | null | undefined, value: string) {
  if (node) node.style.transform = value;
}

/**
 * Rolls a `<Roll>` to `pos` (fractional cell index): cells travel through the clipped
 * window like an odometer, never faded; cells out of the window are hidden.
 */
export function setRoll(roll: Element | null | undefined, pos: number, final: boolean) {
  if (!roll) return;
  const cells = roll.querySelectorAll<HTMLElement>(':scope > [data-roll-cell]');
  cells.forEach((cell, i) => {
    const d = i - pos;
    if (final) {
      cell.style.visibility = i === Math.round(pos) ? '' : 'hidden';
      cell.style.transform = i === Math.round(pos) ? '' : `translate3d(0, ${d * 100}%, 0)`;
      return;
    }
    cell.style.visibility = Math.abs(d) < 0.999 ? 'visible' : 'hidden';
    cell.style.transform = `translate3d(0, ${(d * 100).toFixed(2)}%, 0)`;
  });
}

/**
 * Labels stacked in one clipped cell (as wide as the longest one), shown at `index` in
 * the server HTML. Animate it with `setRoll`. Decorative: pair it with sr-only text.
 */
export function Roll({
  labels,
  index,
  className,
  cellClassName,
  style,
}: {
  labels: readonly string[];
  index: number;
  className?: string;
  cellClassName?: string;
  style?: StyleWithVars;
}) {
  return (
    <span
      data-roll=""
      aria-hidden="true"
      className={cn('relative inline-grid overflow-hidden', className)}
      style={style}
    >
      {labels.map((label, i) => (
        <span
          // Labels can repeat (counters), so the position is part of the key.
          key={`${i}-${label}`}
          data-roll-cell=""
          className={cn('whitespace-nowrap [grid-area:1/1]', cellClassName)}
          style={
            i === index
              ? undefined
              : { visibility: 'hidden', transform: `translate3d(0, ${(i - index) * 100}%, 0)` }
          }
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/** A ring + check drawn as strokes (`data-draw` paths, `pathLength=1`). */
export function CheckMark({
  color = 'var(--mk-ok)',
  size = 18,
  className,
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <circle
        data-draw="ring"
        cx="10"
        cy="10"
        r="8.5"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        pathLength={1}
        transform="rotate(-90 10 10)"
      />
      <path
        data-draw="tick"
        d="M6.2 10.3l2.6 2.6 5-5.4"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
    </svg>
  );
}

/** Draws a `CheckMark` inside `scope` (ring first, then the tick). */
export function drawCheck(scope: Element | null | undefined, q: number) {
  if (!scope) return;
  draw(scope.querySelector<SVGElement>('[data-draw="ring"]'), seg(q, 0, 0.65));
  draw(scope.querySelector<SVGElement>('[data-draw="tick"]'), seg(q, 0.45, 1));
}

/* ---------------------------------------------------------------------------------- */
/* Play clock                                                                           */
/* ---------------------------------------------------------------------------------- */

/**
 * Share of its play a stage primitive has reached when it opens a ConceptStory, played
 * while the section scrolls into view. Before the story pins its progress is 0, and a
 * verb primitive at 0 is an empty card ("Incoming details 0"): the reader would scroll
 * a whole screen past a blank stage. With the lead, the first items are already there.
 */
export const STORY_ENTRY_LEAD = 0.35;

/**
 * Drives `render(p)`: once on view over `duration` seconds (time-based, play once), or
 * following `progress` / the enclosing ConceptStory. Returns the ref for the stage
 * element (the trigger box) and `redraw` (call it after measuring).
 */
export function useStagePlay(
  render: (p: number) => void,
  duration: number,
  { progress, range, followStory = true, delay = 0 }: StagePlayOptions,
) {
  const stageRef = useRef<HTMLElement | null>(null);
  const story = useConceptProgress();
  const scrubbed = Boolean(progress) || Boolean(story && followStory);
  const { ref: revealRef, state } = useRevealState({
    once: true,
    amount: 0.35,
    disabled: scrubbed,
  });
  const mapped = useStageProgress(stageRef, { progress, range });
  const followsStory = Boolean(story && followStory && !progress);
  // A primitive that opens the story (its play starts with the story) already plays
  // its first share as the section scrolls into view, so it never waits empty.
  const [rangeStart] = useDefaultStageRange(range);
  const leadIn = followsStory && rangeStart <= 0.1;
  const { scrollYProgress: entry } = useScroll({ target: stageRef, offset: STANDALONE_OFFSET });
  // A primitive in a later scene: when its scene takes the stage, it plays its first
  // share over time (the scene's own window starts a little later), so a reader who
  // stops there sees items, not an empty card.
  const shown = useSceneShown();
  const reduce = useShouldReduceMotion();
  const floor = useMotionValue(0);
  useEffect(() => {
    if (!followsStory || leadIn || shown === null || story?.mode !== 'scrub' || reduce) {
      floor.set(0);
      return;
    }
    if (!shown) {
      floor.set(0);
      return;
    }
    const controls = animate(floor, STORY_ENTRY_LEAD, { duration: 0.9, ease: 'easeOut' });
    return () => controls.stop();
  }, [followsStory, leadIn, shown, story?.mode, reduce, floor]);
  const current = useRef(1);
  const renderRef = useRef(render);
  renderRef.current = render;
  const paint = useCallback((p: number) => {
    current.current = p;
    renderRef.current(p);
  }, []);
  const redraw = useCallback(() => renderRef.current(current.current), []);

  // Re-apply the current frame after any re-render (prop change, layout switch).
  useLayoutEffect(() => {
    renderRef.current(current.current);
  });

  useEffect(() => {
    if (!scrubbed) return;
    const value = () =>
      Math.max(mapped.get(), leadIn ? clamp(entry.get(), 0, 1) * STORY_ENTRY_LEAD : 0, floor.get());
    const update = () => paint(value());
    update();
    const offMapped = mapped.on('change', update);
    const offEntry = leadIn ? entry.on('change', update) : undefined;
    const offFloor = floor.on('change', update);
    return () => {
      offMapped();
      offEntry?.();
      offFloor();
    };
  }, [scrubbed, mapped, entry, leadIn, floor, paint]);

  useEffect(() => {
    if (scrubbed) return;
    if (state === 'idle') {
      paint(1);
      return;
    }
    if (state === 'hidden') {
      paint(0);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const t = clamp((now - start) / (Math.max(duration, 0.1) * 1000), 0, 1);
      paint(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrubbed, state, duration, delay, paint]);

  const attach = useCallback(
    (node: HTMLElement | null) => {
      stageRef.current = node;
      revealRef(node);
    },
    [revealRef],
  );
  return { attach, redraw };
}

/** Re-measures on resize (ResizeObserver on `node`), then redraws. */
export function useMeasure(
  node: RefObject<HTMLElement | null>,
  measure: () => void,
  deps: readonly unknown[],
) {
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const key = deps.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the deps
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    measureRef.current();
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(el);
    return () => observer.disconnect();
  }, [node, key]);
}

/* ---------------------------------------------------------------------------------- */
/* Layout frame                                                                         */
/* ---------------------------------------------------------------------------------- */

/**
 * Root of a product-verb primitive: surface-aware (text reads on any band), tone vars,
 * the layout, the optional copy, and the stage element the play clock watches.
 */
export function StageFrame({
  layout,
  copy,
  headingAs: Heading = 'h3',
  tones,
  className,
  stageClassName,
  stageRef,
  style,
  children,
  name,
}: {
  layout: StageLayout;
  copy?: StageCopy;
  headingAs?: 'h2' | 'h3' | 'h4';
  tones?: ConceptTones;
  className?: string;
  stageClassName?: string;
  stageRef: (node: HTMLElement | null) => void;
  style?: StyleWithVars;
  children: ReactNode;
  /** Primitive name, as `data-mk-stage` (debugging, tests). */
  name: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSurface(rootRef);
  // The stage is measured on its own too: a `stageClassName` can paint it (a light
  // gradient panel inside a dark band), and the text on it must follow those pixels.
  const stageBox = useRef<HTMLDivElement | null>(null);
  useSurface(stageBox);
  const attachStage = useCallback(
    (node: HTMLDivElement | null) => {
      stageBox.current = node;
      stageRef(node);
    },
    [stageRef],
  );
  return (
    <div
      ref={rootRef}
      data-mk-stage={name}
      data-layout={layout}
      data-copy={copy ? 'true' : undefined}
      className={cn(conceptStyles.tones, styles.frame, className)}
      style={{ ...toneStyle(tones), ...style }}
    >
      {copy ? (
        <div className={styles.copy}>
          {copy.eyebrow ? (
            <p
              className="mb-3 font-semibold text-[12px] uppercase tracking-[0.08em]"
              style={{ color: MUTED_TEXT }}
            >
              {copy.eyebrow}
            </p>
          ) : null}
          <Heading className="text-balance font-display font-semibold text-[1.75rem] text-foreground leading-[1.1] tracking-[-0.02em] md:text-[2.25rem]">
            {copy.title}
          </Heading>
          {copy.body ? (
            <div
              className="mt-4 text-pretty text-[0.9375rem] leading-relaxed md:text-[1.0625rem]"
              style={{ color: MUTED_TEXT }}
            >
              {copy.body}
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={attachStage} className={cn(styles.stage, stageClassName)}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------- */
/* StageCard                                                                            */
/* ---------------------------------------------------------------------------------- */

export type StageCardProps = {
  /** Element. Default `div`. */
  as?: ElementType;
  className?: string;
  style?: StyleWithVars;
  children?: ReactNode;
};

/**
 * An opaque card for your own content on a stage (a ConceptStory scene, a
 * SchematicFrame, a stage primitive, a gradient or photo panel). It paints the surface
 * tokens (`--card` over `--background`, both re-derived for the stage it sits on), so
 * text inside never sits on the raw stage gradient or photo, and it measures itself
 * (`useSurface`), so `text-foreground` / `text-muted-foreground` / `MUTED_TEXT` inside
 * reach 4.5:1 on it. Keep it opaque (no `bg-card/90`, no opacity) and lay cards out so
 * that no two overlap at rest; in development it warns when one does.
 */
export function StageCard({ as: Tag = 'div', className, style, children }: StageCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Labels on a card are small: the muted token keeps 8:1 here (headroom for antialiasing).
  useSurface(ref, { mutedContrast: 8 });
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = ref.current;
    if (!el) return;
    // At rest (after entrances): a text-bearing card overlapped by a neighbour.
    const timer = window.setTimeout(() => {
      const a = el.getBoundingClientRect();
      const siblings = Array.from(el.parentElement?.children ?? []);
      for (const other of siblings) {
        if (other === el || getComputedStyle(other).visibility === 'hidden') continue;
        // Cards, text-bearing blocks and media (a photo laid over a label) all count.
        const media = /^(IMG|VIDEO|PICTURE|CANVAS)$/i.test(other.tagName);
        if (!other.hasAttribute('data-mk-card') && !media && !other.textContent?.trim()) continue;
        const b = other.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (w > 0 && h > 0 && smaller > 0 && (w * h) / smaller > 0.08) {
          // biome-ignore lint/suspicious/noConsole: development-only authoring warning.
          console.warn(
            '[motion-kit] StageCard overlaps a neighbour at rest; lay the cards out so text never sits under another block.',
            el,
          );
          return;
        }
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <Tag ref={ref} data-mk-card="" className={cn(styles.mkCard, className)} style={style}>
      {children}
    </Tag>
  );
}
