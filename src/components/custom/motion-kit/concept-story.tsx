// @polsia:user-owned
'use client';

// ConceptStory — a pinned, scroll-scrubbed 3-act section that tells the IDEA of a
// product before the product exists: act 1 "before" (the chaos), act 2 "mechanism"
// (the transformation), act 3 "after" (the outcome). A sticky stage shows the business's
// own domain objects (ChaosToOrder, MatchPairs, FlowPaths, or custom scenes) while the
// act captions wipe in and out beside it (never faded: text keeps full contrast).
// When to use: the page's ONE signature scroll moment for a SaaS/tool at onboarding,
// when there is no product UI to show. When not to: next to another scroll moment
// (ImageSequence, ScrollZoomHero, ScrollStory, StickyCards), or for a business whose
// value is visual (use imagery instead). Never fill the stage with a fake dashboard or
// invented metrics — use the domain's real objects (invoices, bank lines, parcels…).
//
// Server HTML / no JS / reduced motion: the three acts render as a stacked list next to
// the stage at its final state (progress = 1). The pinned, scrubbed layout switches on
// after hydration, only when motion is allowed and the story can pin (no ancestor with
// overflow hidden/auto/scroll; otherwise it keeps the stacked layout, `data-mk-pin="broken"`).

import {
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from 'motion/react';
import * as m from 'motion/react-m';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import styles from './concept-story.module.css';
import { clamp } from './easing';
import {
  pinAttr,
  type StyleWithVars,
  useMediaQuery,
  usePinSupport,
  useShouldReduceMotion,
} from './hooks';
import { useSurface } from './surface';

/* ---------------------------------------------------------------------------------- */
/* Shared types + helpers (used by ChaosToOrder, MatchPairs, FlowPaths)                */
/* ---------------------------------------------------------------------------------- */

export type ConceptAct = {
  /** Short label above the title, also used in the progress indicator ("Avant"). */
  eyebrow?: string;
  title: string;
  body?: ReactNode;
};

export type ConceptActIndex = 0 | 1 | 2;

export type ConceptProgress = {
  /** Overall progress through the story, 0 → 1. */
  progress: MotionValue<number>;
  /** The current act (re-renders only when it changes). */
  act: ConceptActIndex;
  /** Progress inside the current act, 0 → 1. */
  actProgress: MotionValue<number>;
  /** `static` = SSR / reduced motion (progress is pinned at 1); `scrub` = scroll-driven. */
  mode: 'static' | 'scrub';
};

/**
 * Tone colors of the stage primitives. Any CSS color, typically brand tokens:
 * `{ accent: 'var(--primary)', ok: 'var(--brand-500)', alert: 'var(--destructive)' }`.
 */
export type ConceptTones = {
  /** Lines, progress, hub. Default `var(--primary)`. */
  accent?: string;
  /** Matched / resolved / delivered. Default a calm green. */
  ok?: string;
  /** Gaps, errors, unmatched. Default `var(--destructive)`. */
  alert?: string;
};

/** Options shared by every stage primitive's progress source. */
export type StageProgressOptions = {
  /**
   * Explicit 0→1 progress (overrides everything). Otherwise the primitive follows the
   * enclosing ConceptStory, or — standalone — its own scroll through the viewport.
   */
  progress?: MotionValue<number>;
  /**
   * Slice of the source progress mapped to this primitive's 0→1, e.g. `[0.36, 0.64]`
   * to play during act 2 of a ConceptStory. Default: inside a ConceptScene, its `show`
   * window (see `sceneRange`); else `[0, 1]`.
   */
  range?: readonly [number, number];
};

/** CSS variables for `tones` (spread into a primitive root's style). */
export function toneStyle(tones: ConceptTones | undefined): StyleWithVars {
  const style: StyleWithVars = {};
  if (tones?.accent) style['--mk-accent'] = tones.accent;
  if (tones?.ok) style['--mk-ok'] = tones.ok;
  if (tones?.alert) style['--mk-alert'] = tones.alert;
  return style;
}

/** Hermite smoothstep of `value` between `edge0` and `edge1` (clamped to 0–1). */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Cubic ease-in-out, 0–1 → 0–1. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Cubic ease-out, 0–1 → 0–1. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function actFromProgress(value: number): ConceptActIndex {
  if (value >= 2 / 3) return 2;
  if (value >= 1 / 3) return 1;
  return 0;
}

const ConceptProgressContext = createContext<ConceptProgress | null>(null);

/** Show window `[from, to]` of the enclosing ConceptScene (null outside of one). */
const SceneWindowContext = createContext<readonly [number, number] | null>(null);

/** Whether the enclosing ConceptScene is the one on stage (null outside of one). */
const SceneShownContext = createContext<boolean | null>(null);

/**
 * Whether the enclosing ConceptScene is currently shown (true in the static layout),
 * or `null` outside of a scene. Stage primitives use it to have content ready the
 * moment their scene takes the stage.
 */
export function useSceneShown(): boolean | null {
  return useContext(SceneShownContext);
}

/**
 * Default play range of a stage primitive inside a scene shown on `[from, to]`: starts
 * just after the scene is up and finishes with the last 20% of the window left (35% for
 * the final scene, whose resolved state is what the reader leaves on). A scene on the
 * whole story (`[0, 1]`) keeps `[0, 1]`.
 */
export function sceneRange(show: readonly [number, number]): readonly [number, number] {
  const [from, to] = show;
  if (from <= 0 && to >= 1) return [0, 1];
  const span = Math.max(0.001, to - from);
  return [from + span * 0.06, to - span * (to >= 1 ? 0.35 : 0.2)];
}

/**
 * The range a stage primitive plays when no `range` is passed: the enclosing
 * ConceptScene's window (see `sceneRange`), else `[0, 1]`.
 */
export function useDefaultStageRange(range?: readonly [number, number]): readonly [number, number] {
  const scene = useContext(SceneWindowContext);
  if (range) return range;
  return scene ? sceneRange(scene) : [0, 1];
}

/** Show windows of the scenes of one story, so each scene can hand over to its neighbours. */
type SceneWindow = { id: string; from: number; to: number; fade: number };
type SceneRegistry = {
  windows: readonly SceneWindow[];
  register: (window: SceneWindow) => () => void;
};
const SceneRegistryContext = createContext<SceneRegistry | null>(null);

/** Previous / next scene of `self` by start (`from`), ignoring scenes that start together. */
function neighbours(windows: readonly SceneWindow[], self: SceneWindow) {
  let prev: SceneWindow | undefined;
  let next: SceneWindow | undefined;
  for (const w of windows) {
    if (w.id === self.id) continue;
    if (w.from < self.from && (!prev || w.from > prev.from)) prev = w;
    if (w.from > self.from && (!next || w.from < next.from)) next = w;
  }
  return { prev, next };
}

/**
 * Progress of the enclosing ConceptStory, or `null` outside of one. Use it to build a
 * custom stage (client components only): `useTransform(ctx.progress, …)`.
 */
export function useConceptProgress(): ConceptProgress | null {
  return useContext(ConceptProgressContext);
}

/** Scroll offsets of a standalone stage primitive: top at 95% → top at 55% of the viewport. */
export const STANDALONE_OFFSET: [[number, number], [number, number]] = [
  [0, 0.95],
  [0, 0.55],
];

/** True when the page is scrolled to (within 2px of) its end. */
export function atPageEnd(): boolean {
  const doc = document.documentElement;
  return window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
}

/**
 * The 0→1 progress a stage primitive plays. Priority: `progress` prop → enclosing
 * ConceptStory → the element's own scroll (0 when its top enters the lower viewport,
 * 1 when its top reaches 55% of the viewport). Always 1 on the server and under reduced motion. The
 * returned MotionValue is stable (safe to pass to useTransform).
 */
export function useStageProgress(
  ref: RefObject<HTMLElement | null>,
  { progress, range: rangeProp }: StageProgressOptions = {},
): MotionValue<number> {
  const story = useContext(ConceptProgressContext);
  const range = useDefaultStageRange(rangeProp);
  const reduce = useShouldReduceMotion();
  const output = useMotionValue(1);
  const { scrollYProgress } = useScroll({
    target: ref,
    // Standalone: plays while its top rises from the bottom edge to 55% of the viewport,
    // so it has resolved by the time it is read (about 40% of a viewport of scroll).
    offset: STANDALONE_OFFSET,
  });
  const [start, end] = range;

  useEffect(() => {
    const source = reduce ? null : (progress ?? story?.progress ?? scrollYProgress);
    if (!source) {
      output.set(1);
      return;
    }
    const own = source === scrollYProgress;
    const span = end - start || 1;
    // Own scroll: also resolved at the end of the page (an element near the bottom may
    // never reach the end offset).
    const map = (value: number) => (own && atPageEnd() ? 1 : clamp((value - start) / span, 0, 1));
    output.set(map(source.get()));
    return source.on('change', (value) => output.set(map(value)));
  }, [reduce, progress, story?.progress, scrollYProgress, start, end, output]);

  return output;
}

/* ---------------------------------------------------------------------------------- */
/* ConceptScene                                                                         */
/* ---------------------------------------------------------------------------------- */

export type ConceptSceneProps = {
  children: ReactNode;
  /**
   * Story progress window `[from, to]` where this scene is fully visible. It fades in
   * just before `from`. A scene whose window reaches 1 is the final scene (the one shown
   * in the static / reduced-motion layout). Default `[0, 1]`.
   * Contiguous windows read best: `[0, 0.34]`, `[0.34, 0.67]`, `[0.67, 1]`.
   */
  show?: readonly [number, number];
  /** Hand-over length in story progress units (the wipe uses 60% of it). Default 0.05. */
  fade?: number;
  /**
   * Hand over without a blank stage (default true): the scene stays visible across a gap
   * until the next scene starts and hands over to it by one shared wipe (cut away as the
   * next one is uncovered, ending at the hand-over point); the first scene is visible from
   * 0 and the last one until 1. `false` = strict windows (wiped out just after `to`, blank
   * in gaps).
   */
  hold?: boolean;
  className?: string;
};

type SceneTiming = {
  /** Fade-in `[start, end]`, or null = visible from the start. */
  fadeIn: readonly [number, number] | null;
  /** Fade-out `[start, end]`, or null = visible until the end. */
  fadeOut: readonly [number, number] | null;
};

/** Share of a scene's `fade` used by its hand-over wipe (0.05 → 0.03 of the story). */
const WIPE_SHARE = 0.6;
/** Vertical travel (px) of a scene during its wipe; the two scenes part, never overlap. */
const WIPE_TRAVEL = 10;
/**
 * Hand-overs (scenes and captions) play over time once scroll crosses the hand-over
 * point, instead of being scrubbed by scroll: a reader who stops scrolling mid-wipe
 * would otherwise be left with two scenes cut in half on screen.
 */
const HANDOVER = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };
/**
 * Clip insets of a settled layer. Negative so card shadows and descenders are not cut;
 * every state keeps the same four tokens so the inset interpolates.
 */
const REST_INSET = 'inset(-12% -12% -12% -12%)';
/** Covered from the top edge down to the bottom: not yet shown (enters from below). */
const BELOW_INSET = 'inset(100% -12% -12% -12%)';
/** Cut away from the bottom edge up to the top: already handed over (left above). */
const ABOVE_INSET = 'inset(-12% -12% 100% -12%)';

type LayerState = 'below' | 'shown' | 'above';

/**
 * Discrete state of a scene at story progress `p`: shown between the middle of its
 * fade-in and the middle of its fade-out, otherwise waiting below or gone above.
 */
export function sceneState(timing: SceneTiming, p: number): LayerState {
  const enterAt = timing.fadeIn ? (timing.fadeIn[0] + timing.fadeIn[1]) / 2 : -Infinity;
  const exitAt = timing.fadeOut ? (timing.fadeOut[0] + timing.fadeOut[1]) / 2 : Infinity;
  if (p < enterAt) return 'below';
  if (p >= exitAt) return 'above';
  return 'shown';
}

const LAYER_TARGET: Record<LayerState, { clipPath: string; y: number }> = {
  below: { clipPath: BELOW_INSET, y: WIPE_TRAVEL },
  shown: { clipPath: REST_INSET, y: 0 },
  above: { clipPath: ABOVE_INSET, y: -WIPE_TRAVEL },
};

function sceneTiming(
  self: SceneWindow,
  windows: readonly SceneWindow[],
  hold: boolean,
): SceneTiming {
  const { from, to, fade } = self;
  if (!hold) {
    return {
      fadeIn: from > 0 ? [from - fade, from] : null,
      fadeOut: to < 1 ? [to, to + fade] : null,
    };
  }
  const { prev, next } = neighbours(windows, self);
  // No registry yet (first render): fall back to the strict windows.
  const known = windows.some((w) => w.id === self.id);
  // Hand-over point with a neighbour: the middle of a gap (on the default act thirds,
  // where the captions change), or the next scene's `from` when windows touch.
  const handover = (a: SceneWindow, b: SceneWindow) =>
    b.from > a.to ? (a.to + b.from) / 2 : b.from;
  // Hand-over: one short wipe shared by both scenes (the incoming one uncovers from the
  // bottom exactly as the outgoing one is cut away), so two scenes never show at once and
  // no layer ever sits half-transparent over another. It ends at the hand-over point.
  const wipe = (w: SceneWindow) => w.fade * WIPE_SHARE;
  let fadeIn: SceneTiming['fadeIn'] = null;
  if (known ? prev : from > 0) {
    const at = prev ? handover(prev, self) : from;
    fadeIn = [at - wipe(self), at];
  }
  let fadeOut: SceneTiming['fadeOut'] = null;
  if (!known) {
    fadeOut = to < 1 ? [to, to + fade] : null;
  } else if (next) {
    // Overlapping windows (the next scene starts before this one ends): keep `to`.
    if (next.from >= to - 1e-6) {
      const at = handover(self, next);
      fadeOut = [Math.max(from, at - wipe(next)), at];
    } else if (to < 1) {
      fadeOut = [to, to + fade];
    }
  }
  return { fadeIn, fadeOut };
}

/**
 * One layer of a ConceptStory stage. Put several in `stage` (directly, or inside one
 * wrapper element); they share one grid cell and hand over by a wipe on story progress, handing
 * over without a blank stage. Outside a ConceptStory it renders its children.
 */
export function ConceptScene({
  children,
  show = [0, 1],
  fade = 0.05,
  hold = true,
  className,
}: ConceptSceneProps) {
  const story = useContext(ConceptProgressContext);
  const registry = useContext(SceneRegistryContext);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [from, to] = show;
  const f = Math.max(0.001, fade);
  const register = registry?.register;
  useEffect(() => register?.({ id, from, to, fade: f }), [register, id, from, to, f]);

  const self = useMemo<SceneWindow>(() => ({ id, from, to, fade: f }), [id, from, to, f]);
  const sceneWindow = useMemo(() => [from, to] as const, [from, to]);
  const windows = registry?.windows;
  const timing = useMemo(() => sceneTiming(self, windows ?? [], hold), [self, windows, hold]);

  const source = story?.progress;
  const scrub = story?.mode === 'scrub';
  // No opacity: a scene is either fully shown, cut by the hand-over wipe (its text stays
  // at full contrast) or `visibility: hidden`. Scroll only decides WHICH scene is shown;
  // the wipe between two scenes then plays over time to its end, so stopping mid-scroll
  // never leaves two half-cut scenes on screen.
  const [state, setState] = useState<LayerState>('shown');
  useEffect(() => {
    if (!source) return;
    const apply = (p: number) => setState(sceneState(timing, p));
    apply(source.get());
    return source.on('change', apply);
  }, [source, timing]);
  const visible = state === 'shown';
  // The first state after the scrubbed layout switches on (or the scenes become known)
  // is applied instantly: no wipe plays on page load.
  const known = windows?.some((w) => w.id === id) ?? false;
  const settled = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `known` re-arms the instant first state when the scenes register
  useEffect(() => {
    settled.current = false;
    if (!scrub) return;
    const frame = requestAnimationFrame(() => {
      settled.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrub, known]);
  // A scene skipped over by a fast scroll (below → above) jumps while hidden: playing
  // that wipe would flash a band of it through the middle of the stage.
  const previous = useRef<LayerState>(state);
  const jump = previous.current !== 'shown' && !visible;
  useEffect(() => {
    previous.current = state;
  }, [state]);
  const layerTransition = {
    ...(settled.current && !jump ? HANDOVER : { duration: 0 }),
    visibility: { duration: 0 },
  };
  // Fit: a scene taller than its cell (a long timeline on a phone) is scaled down to fit,
  // so nothing is cut at the stage edge. Transform only, measured on resize.
  const fit = useMotionValue(1);
  useEffect(() => {
    const node = ref.current;
    if (!scrub || !node) return;
    const measure = () => {
      const room = node.clientHeight;
      const content = node.scrollHeight;
      fit.set(room > 0 && content > room + 1 ? room / content : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      observer.disconnect();
      fit.set(1);
    };
  }, [scrub, fit]);

  // Scenes stack in one grid cell. When the author wrapped them in an element of their
  // own (a <div> around the scenes), make that wrapper the stacking grid too.
  const inStory = story !== null;
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!inStory || !parent) return;
    const display = getComputedStyle(parent).display;
    if (display.includes('grid') || display === 'contents') return;
    const previous = parent.style.display;
    parent.style.display = 'grid';
    return () => {
      parent.style.display = previous;
    };
  }, [inStory]);

  // Static layout: only the final scene. Before the scenes are known (server HTML), the
  // one whose window reaches 1; after, the last scene when `hold` is on.
  const isLast = known && windows ? !neighbours(windows, self).next : to >= 1;
  const staticHidden = story?.mode === 'static' && !(hold ? isLast || to >= 1 : to >= 1);
  return (
    <m.div
      ref={ref}
      className={cn(styles.scene, className)}
      data-static-hidden={staticHidden || undefined}
      data-scene-state={scrub ? state : undefined}
      aria-hidden={scrub && !visible ? true : undefined}
      initial={false}
      animate={
        scrub
          ? {
              ...LAYER_TARGET[state],
              visibility: jump ? 'hidden' : 'visible',
              transitionEnd: visible ? undefined : { visibility: 'hidden' },
            }
          : undefined
      }
      transition={layerTransition}
      style={scrub ? { scale: fit } : undefined}
    >
      <SceneWindowContext.Provider value={inStory ? sceneWindow : null}>
        <SceneShownContext.Provider value={inStory ? !scrub || visible : null}>
          {children}
        </SceneShownContext.Provider>
      </SceneWindowContext.Provider>
    </m.div>
  );
}

/* ---------------------------------------------------------------------------------- */
/* ConceptStory                                                                         */
/* ---------------------------------------------------------------------------------- */

export type ConceptStoryProps = {
  /** Exactly three acts: before (chaos) → mechanism → after (outcome). */
  acts: readonly [ConceptAct, ConceptAct, ConceptAct];
  /**
   * The pinned visual. Stage primitives inside read the story progress automatically;
   * use `range` on them (or ConceptScene layers) to play them during specific acts.
   */
  stage: ReactNode;
  /** Scroll distance of the pinned section on desktop (CSS length). Default `420vh`. */
  scrollLength?: string;
  /** Scroll distance below 768px or on touch devices. Default `300vh`. */
  mobileScrollLength?: string;
  /** Space kept free above the pinned content (sticky navbar). Default `4rem`. */
  topOffset?: string;
  /** Heading tag of act titles. Default `h3`. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /**
   * Screen-reader description of the stage. The stage itself is decorative and hidden
   * from assistive tech; the act captions carry the meaning.
   */
  stageLabel?: string;
  id?: string;
  className?: string;
  /**
   * Inline gutter of the story (CSS length). It only applies where the story's box
   * reaches the screen edge: a story inside a container that already pads it (by at
   * least this much) gets none, a full-bleed story gets the whole gutter. `0` = none.
   * Default `clamp(1.25rem, 5vw, 3rem)`.
   */
  gutter?: string;
  /**
   * Max width of the two-column layout, centered (CSS length, `none` = full width).
   * Default `80rem`.
   */
  maxWidth?: string;
  /**
   * `split` (default): captions beside the stage from 768px. `full`: captions centered
   * above a full-width stage (wide stages: a board, a two-pane terminal, a wide chart).
   */
  layout?: 'split' | 'full';
  /** Classes for the stage column (e.g. a max width, a background panel). */
  stageClassName?: string;
  /** Classes for each act caption. */
  captionClassName?: string;
};

const COMPACT_QUERY = '(max-width: 767px), (pointer: coarse)';

/** Clip insets of a caption (same four tokens in every state, so they interpolate). */
const CAPTION_TARGET: Record<LayerState, { clipPath: string; y: number }> = {
  // Upcoming: revealed from its top edge down as it rises into place.
  below: { clipPath: 'inset(-10% -6% 100% -6%)', y: 22 },
  shown: { clipPath: 'inset(-10% -6% -10% -6%)', y: 0 },
  // Done: cut away from its top edge as it lifts out.
  above: { clipPath: 'inset(100% -6% -10% -6%)', y: -22 },
};

function ActCaption({
  act,
  index,
  current,
  scrub,
  Heading,
  className,
}: {
  act: ConceptAct;
  index: number;
  /** The act currently shown (decided by scroll position). */
  current: ConceptActIndex;
  scrub: boolean;
  Heading: 'h2' | 'h3' | 'h4';
  className?: string;
}) {
  // Captions never fade (a half-transparent title fails contrast): the outgoing one
  // lifts into a mask above, the incoming one rises from a mask below, each cut by a
  // clip-path while its text stays at full color, and hidden outside its act. Scroll
  // picks the act; the hand-over then plays over time, never frozen half-way.
  const state: LayerState = index === current ? 'shown' : index > current ? 'below' : 'above';
  const active = state === 'shown';
  const settled = useRef(false);
  useEffect(() => {
    settled.current = false;
    if (!scrub) return;
    const frame = requestAnimationFrame(() => {
      settled.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrub]);
  const previous = useRef<LayerState>(state);
  const jump = previous.current !== 'shown' && !active;
  useEffect(() => {
    previous.current = state;
  }, [state]);
  return (
    <m.li
      className={cn(styles.caption, className)}
      data-caption-state={scrub ? state : undefined}
      aria-hidden={scrub && !active ? true : undefined}
      initial={false}
      animate={
        scrub
          ? {
              ...CAPTION_TARGET[state],
              visibility: jump ? 'hidden' : 'visible',
              transitionEnd: active ? undefined : { visibility: 'hidden' },
            }
          : undefined
      }
      transition={{
        ...(settled.current && !jump ? HANDOVER : { duration: 0 }),
        visibility: { duration: 0 },
      }}
    >
      <p
        className={cn(
          styles.captionEyebrow,
          'mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-(--mk-muted)',
        )}
      >
        <span className="tabular-nums text-foreground">{String(index + 1).padStart(2, '0')}</span>
        {act.eyebrow && <span>{act.eyebrow}</span>}
      </p>
      <Heading className="text-balance text-[1.625rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-[2.5rem] md:leading-[1.06] lg:text-[2.875rem]">
        {act.title}
      </Heading>
      {act.body && (
        <div className="mt-3 max-w-[34rem] text-pretty text-[0.9375rem] leading-relaxed text-(--mk-muted) md:mt-5 md:text-lg">
          {act.body}
        </div>
      )}
    </m.li>
  );
}

function ActSegment({
  label,
  index,
  progress,
  active,
}: {
  label: string;
  index: number;
  progress: MotionValue<number>;
  active: boolean;
}) {
  const scaleX = useTransform(progress, (p) => clamp(p * 3 - index, 0, 1));
  return (
    <div className={styles.segment} data-active={active}>
      <span className={styles.segmentLabel}>{label}</span>
      <div className={styles.segmentTrack}>
        <m.div className={styles.segmentFill} style={{ scaleX }} />
      </div>
    </div>
  );
}

export function ConceptStory({
  acts,
  stage,
  scrollLength = '420vh',
  mobileScrollLength = '300vh',
  topOffset = '4rem',
  headingAs = 'h3',
  stageLabel,
  id,
  className,
  gutter,
  maxWidth,
  layout = 'split',
  stageClassName,
  captionClassName,
}: ConceptStoryProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  useSurface(rootRef);
  // The stage column is measured on its own: `stageClassName` can paint it (a light
  // gradient panel in a dark band), and scene text must follow those pixels.
  const stageRef = useRef<HTMLDivElement>(null);
  useSurface(stageRef);
  const reduce = useShouldReduceMotion();
  const compact = useMediaQuery(COMPACT_QUERY);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // An ancestor that breaks sticky (overflow hidden/auto/scroll) would leave a tall,
  // empty track scrolling past: keep the stacked static layout instead.
  const pinnable = usePinSupport(rootRef, 'ConceptStory');
  const scrub = mounted && !reduce && pinnable;

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  // One stable MotionValue for the whole story: pinned at 1 (final state) until the
  // scrubbed layout is live, then mirrors the track's scroll progress.
  const progress = useMotionValue(1);
  useEffect(() => {
    if (!scrub) {
      progress.set(1);
      return;
    }
    progress.set(scrollYProgress.get());
    return scrollYProgress.on('change', (value) => progress.set(value));
  }, [scrub, progress, scrollYProgress]);

  const actProgress = useTransform(progress, (p) => {
    const scaled = clamp(p, 0, 1) * 3;
    return scaled >= 3 ? 1 : scaled - Math.floor(scaled);
  });
  const [act, setAct] = useState<ConceptActIndex>(2);
  useMotionValueEvent(progress, 'change', (value) => setAct(actFromProgress(value)));

  const [sceneWindows, setSceneWindows] = useState<readonly SceneWindow[]>([]);
  const registerScene = useCallback((window: SceneWindow) => {
    setSceneWindows((list) => [...list.filter((w) => w.id !== window.id), window]);
    return () => setSceneWindows((list) => list.filter((w) => w.id !== window.id));
  }, []);
  const registry = useMemo<SceneRegistry>(
    () => ({ windows: sceneWindows, register: registerScene }),
    [sceneWindows, registerScene],
  );

  const context = useMemo<ConceptProgress>(
    () => ({ progress, act, actProgress, mode: scrub ? 'scrub' : 'static' }),
    [progress, act, actProgress, scrub],
  );

  const style: StyleWithVars = {
    '--mk-scroll-length': compact ? mobileScrollLength : scrollLength,
    '--mk-top': topOffset,
  };
  if (gutter) style['--mk-story-gutter'] = gutter;
  if (maxWidth) style['--mk-story-max'] = maxWidth;

  return (
    <section
      ref={rootRef}
      id={id}
      className={cn(styles.concept, styles.tones, className)}
      data-mode={scrub ? 'scrub' : 'static'}
      data-mk-pin={pinAttr(pinnable)}
      data-layout={layout}
      style={style}
    >
      <ConceptProgressContext.Provider value={context}>
        <SceneRegistryContext.Provider value={registry}>
          {stageLabel && <p className="sr-only">{stageLabel}</p>}
          <div ref={trackRef} className={styles.track}>
            <div className={styles.viewport}>
              <div className={styles.captionCol}>
                <div className={styles.indicator} aria-hidden="true">
                  {acts.map((item, index) => (
                    <ActSegment
                      key={`${index}-${item.title}`}
                      label={item.eyebrow ?? String(index + 1).padStart(2, '0')}
                      index={index}
                      progress={progress}
                      active={scrub && act === index}
                    />
                  ))}
                </div>
                <ol className={styles.captions}>
                  {acts.map((item, index) => (
                    <ActCaption
                      key={`${index}-${item.title}`}
                      act={item}
                      index={index}
                      current={act}
                      scrub={scrub}
                      Heading={headingAs}
                      className={captionClassName}
                    />
                  ))}
                </ol>
              </div>
              <div ref={stageRef} className={cn(styles.stage, stageClassName)} aria-hidden="true">
                {stage}
              </div>
            </div>
          </div>
        </SceneRegistryContext.Provider>
      </ConceptProgressContext.Provider>
    </section>
  );
}
