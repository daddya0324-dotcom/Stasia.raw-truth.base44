// @polsia:user-owned
'use client';

// SpotlightGrid + SpotlightCard — a bento grid whose cards catch a soft light that
// follows the cursor (on the hairline border and faintly on the surface), and enter
// with a short staggered rise when the grid scrolls into view.
// When to use: 3–7 benefit/capability cards told with the business's own objects
// (a visual slot per card: an icon, a small schematic, a primitive). When not to: a
// pricing table, long text cards, or more than one spotlight grid per page.
// The light is pointer-follow only on fine pointers (mouse/trackpad); on touch it is
// off. Everything moves by transform/opacity (the light is a translated blob inside
// a static border mask), so nothing repaints the layout. SSR/no-JS/reduced motion:
// cards are visible and static.

import {
  Children,
  createContext,
  type ElementType,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from 'react';
import { cn } from '@/lib/utils';
import { MUTED_TEXT } from './contrast';
import { clamp, cssEase, EASE_OUT_EXPO } from './easing';
import { type RevealState, type StyleWithVars, useIsCoarsePointer, useRevealState } from './hooks';
import { useSurface } from './surface';

type GridContextValue = { state: RevealState; stagger: number };
const GridContext = createContext<GridContextValue>({ state: 'idle', stagger: 0.06 });
const IndexContext = createContext(0);

export type SpotlightGridProps = {
  /** SpotlightCard elements (direct children; each one is a grid item). */
  children: ReactNode;
  /** Columns from `md` up. Default 6 (cards then span 2, 3, 4 or 6). Phones: 1 column. */
  columns?: number;
  /** Seconds between card entrances. Default 0.07, capped at 0.08. */
  stagger?: number;
  /** Light radius in px. Default 340. */
  radius?: number;
  /** Light color. Default `var(--primary)`. */
  color?: string;
  as?: 'div' | 'ul';
  className?: string;
};

export function SpotlightGrid({
  children,
  columns = 6,
  stagger = 0.07,
  radius = 340,
  color = 'var(--primary)',
  as = 'div',
  className,
}: SpotlightGridProps) {
  const { ref, state } = useRevealState({ once: true, amount: 0.15 });
  const coarse = useIsCoarsePointer();
  const gridRef = useRef<HTMLElement | null>(null);
  const frame = useRef(0);
  const rects = useRef<{ node: HTMLElement; rect: DOMRect }[]>([]);
  useSurface(gridRef);

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      gridRef.current = node;
      ref(node);
    },
    [ref],
  );

  const measure = () => {
    const grid = gridRef.current;
    if (!grid) return;
    rects.current = Array.from(grid.querySelectorAll<HTMLElement>('[data-spotlight-card]')).map(
      (node) => ({ node, rect: node.getBoundingClientRect() }),
    );
  };

  const onPointerEnter = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    measure();
    gridRef.current?.setAttribute('data-lit', 'true');
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      // Rects go stale when the page scrolls under a still pointer: re-measure cheaply.
      const first = rects.current[0];
      if (!first || first.node.getBoundingClientRect().top !== first.rect.top) measure();
      for (const { node, rect } of rects.current) {
        node.style.setProperty('--mk-sx', `${(clientX - rect.left).toFixed(1)}px`);
        node.style.setProperty('--mk-sy', `${(clientY - rect.top).toFixed(1)}px`);
      }
    });
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    gridRef.current?.removeAttribute('data-lit');
  };

  const style: StyleWithVars = {
    '--mk-cols': `repeat(${Math.max(1, Math.round(columns))}, minmax(0, 1fr))`,
    '--mk-spot-r': `${radius}px`,
    '--mk-spot-color': color,
  };
  const Tag: ElementType = as;
  const context: GridContextValue = { state, stagger: clamp(stagger, 0, 0.08) };

  return (
    <GridContext.Provider value={context}>
      <Tag
        ref={setRefs}
        style={style}
        className={cn('group/spot grid grid-cols-1 gap-4 md:grid-cols-(--mk-cols)', className)}
        onPointerEnter={coarse ? undefined : onPointerEnter}
        onPointerMove={coarse ? undefined : onPointerMove}
        onPointerLeave={coarse ? undefined : onPointerLeave}
      >
        {Children.map(children, (child, index) => (
          <IndexContext.Provider value={index}>{child}</IndexContext.Provider>
        ))}
      </Tag>
    </GridContext.Provider>
  );
}

export type SpotlightCardProps = {
  /** Columns spanned from `md` up (of SpotlightGrid `columns`). Default 2. */
  span?: number;
  /** Rows spanned from `md` up. Default 1. */
  rows?: number;
  /** Small icon/glyph shown above the title. */
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Visual slot (schematic, primitive, illustration). */
  visual?: ReactNode;
  /** Where the visual sits. Default `top`. */
  visualPosition?: 'top' | 'bottom';
  /** Extra content after the description. */
  children?: ReactNode;
  as?: 'div' | 'article' | 'li';
  className?: string;
  /** Classes for the visual slot box (height, padding). */
  visualClassName?: string;
};

export function SpotlightCard({
  span = 2,
  rows = 1,
  icon,
  title,
  description,
  visual,
  visualPosition = 'top',
  children,
  as = 'article',
  className,
  visualClassName,
}: SpotlightCardProps) {
  const { state, stagger } = useContext(GridContext);
  const index = useContext(IndexContext);
  const Tag: ElementType = as;
  const style: StyleWithVars = {
    '--mk-span': Math.max(1, Math.round(span)),
    '--mk-rows': Math.max(1, Math.round(rows)),
    '--mk-delay': `${index * stagger}s`,
    '--mk-ease': cssEase(EASE_OUT_EXPO),
  };
  const light = (size: string, strength: number) => ({
    width: size,
    height: size,
    transform: `translate3d(calc(var(--mk-sx, -9999px) - ${size} / 2), calc(var(--mk-sy, -9999px) - ${size} / 2), 0)`,
    background: `radial-gradient(closest-side, color-mix(in oklab, var(--mk-spot-color) ${strength}%, transparent), transparent)`,
  });

  const visualNode = visual ? (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-background/60',
        visualPosition === 'top' ? 'mb-6' : 'mt-6',
        visualClassName,
      )}
    >
      {visual}
    </div>
  ) : null;

  return (
    <Tag
      data-spotlight-card=""
      data-state={state}
      style={style}
      className={cn(
        'group/card relative isolate flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 text-card-foreground md:p-7',
        'shadow-[0_1px_0_0_color-mix(in_oklab,var(--foreground)_4%,transparent),0_20px_40px_-28px_color-mix(in_oklab,var(--foreground)_28%,transparent)]',
        'md:col-span-(--mk-span) md:row-span-(--mk-rows)',
        'motion-safe:data-[state=hidden]:translate-y-5 motion-safe:data-[state=hidden]:opacity-0',
        'motion-safe:data-[state=shown]:transition-[opacity,translate,scale] motion-safe:data-[state=shown]:duration-700',
        'motion-safe:data-[state=shown]:[transition-delay:var(--mk-delay)] motion-safe:data-[state=shown]:[transition-timing-function:var(--mk-ease)]',
        className,
      )}
    >
      {/* Surface wash: a wide, faint light. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-data-[lit=true]/spot:opacity-100"
      >
        <div
          className="absolute top-0 left-0 rounded-full"
          style={light('calc(var(--mk-spot-r) * 1.6)', 12)}
        />
      </div>
      {/* Border light: the same blob, seen only through a 1px ring mask. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] p-px opacity-0 transition-opacity duration-500 group-data-[lit=true]/spot:opacity-100"
        style={{
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          maskComposite: 'exclude',
        }}
      >
        <div
          className="absolute top-0 left-0 rounded-full"
          style={light('var(--mk-spot-r)', 100)}
        />
      </div>
      {visualPosition === 'top' ? visualNode : null}
      {icon ? (
        <div className="mb-4 inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-primary shadow-xs [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      {title ? (
        <h3 className="font-display font-semibold text-[1.0625rem] leading-snug tracking-[-0.01em]">
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className="mt-2 text-small leading-relaxed" style={{ color: MUTED_TEXT }}>
          {description}
        </p>
      ) : null}
      {children}
      {visualPosition === 'bottom' ? <div className="mt-auto">{visualNode}</div> : null}
    </Tag>
  );
}
