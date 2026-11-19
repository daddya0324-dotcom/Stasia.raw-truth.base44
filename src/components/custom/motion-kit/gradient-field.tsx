// @polsia:user-owned
'use client';

// GradientField — a slow, living mesh-gradient / aurora backdrop for a hero, with the
// hero content layered on top (children).
// When to use: behind ONE hero or one closing CTA band, where brand color should feel
// alive without an image. When not to: behind long text, on every section, or stacked
// with another moving background (ImageSequence, ParallaxLayers).
// How: a 2D canvas draws a handful of large soft radial blobs at a fraction of the CSS
// resolution (it is blurry by nature), at ~30 fps, only while on screen and while the tab
// is visible. The server HTML (and no-JS) paints an equivalent static CSS gradient; the
// canvas fades in over it. Reduced motion: one static frame, no loop.
// Colors: any CSS color, including `var(--token)` and `color-mix()`; re-read when the
// theme class on <html> changes.
// Copy-safe (default): the field knows its palette, so it bounds what it can ever paint.
// On a dark base every blob color is capped (pulled toward the base, hue kept) so the
// brightest pixel of any frame, overlaps and the static fallback included, stays at or below
// luminance 0.065: white text holds 14:1 and light grey copy (luminance ≥ 0.5, e.g.
// #b9bcb1) 4.5:1. On a light base, colors are lifted so the darkest pixel stays ≥ 0.48.
// A blob only dims where its own peak would cross that line; darker/lighter colors keep
// their full strength. The field declares its range (`data-mk-field-min/-max`, CSS vars
// `--mk-field-min/-max`) for surface awareness, and the content layer gets theme tokens
// clamped for that range (`--foreground`, `--muted-foreground`), in the server HTML too.

import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { clamp } from './easing';
import { type StyleWithVars, useShouldReduceMotion } from './hooks';
import { relativeLuminance, scheduleSurfaceCheck, useSurface } from './surface';

export type GradientFieldProps = {
  /** Content layered above the field (hero copy, CTAs). */
  children?: ReactNode;
  /**
   * 2–6 blob colors (any CSS color, `var(--x)` included). Default: brand primary, two
   * brand ramp steps and the accent.
   */
  colors?: readonly string[];
  /** Base color under the blobs. Default `var(--background)`. */
  background?: string;
  /** `mesh`: round blobs drifting everywhere. `aurora`: wide bands near the top. */
  variant?: 'mesh' | 'aurora';
  /** 0–1 blob strength. Default 0.55. */
  intensity?: number;
  /** Motion speed multiplier. Default 1 (a full drift cycle takes ~40 s). */
  speed?: number;
  /** Film-grain overlay: `true` (0.3) or an opacity 0–1 (blended as overlay). Hides banding. */
  grain?: boolean | number;
  /** Faint dot grid, faded toward the edges. */
  dots?: boolean;
  /** Fade the field into `background` at the bottom edge. Default true. */
  fadeBottom?: boolean;
  /**
   * Keep text over the field readable at every frame (default true): caps the field's
   * brightest (dark base) / darkest (light base) color and clamps the content tokens.
   * `false` paints the palette as given; then check copy against `data-mk-field-max`.
   */
  copySafe?: boolean;
  className?: string;
  /** Classes for the content layer (padding, grid, alignment). */
  contentClassName?: string;
};

const DEFAULT_COLORS = ['var(--primary)', 'var(--brand-300)', 'var(--accent)', 'var(--brand-500)'];

type Blob = {
  x: number;
  y: number;
  r: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  p: number;
};

// Deterministic layout: the SSR CSS fallback and the canvas' first frame agree.
const MESH: readonly Blob[] = [
  { x: 0.18, y: 0.28, r: 0.62, ax: 0.1, ay: 0.08, fx: 0.9, fy: 1.1, p: 0 },
  { x: 0.78, y: 0.2, r: 0.58, ax: 0.09, ay: 0.1, fx: 1.2, fy: 0.8, p: 1.7 },
  { x: 0.62, y: 0.78, r: 0.66, ax: 0.12, ay: 0.07, fx: 0.7, fy: 1.3, p: 3.1 },
  { x: 0.3, y: 0.82, r: 0.5, ax: 0.08, ay: 0.09, fx: 1.4, fy: 0.9, p: 4.4 },
  { x: 0.5, y: 0.45, r: 0.4, ax: 0.14, ay: 0.06, fx: 1.1, fy: 1.5, p: 5.3 },
  { x: 0.92, y: 0.62, r: 0.44, ax: 0.07, ay: 0.1, fx: 0.8, fy: 1.2, p: 2.4 },
];
const AURORA: readonly Blob[] = [
  { x: 0.2, y: 0.12, r: 0.55, ax: 0.14, ay: 0.04, fx: 0.8, fy: 1.2, p: 0 },
  { x: 0.55, y: 0.05, r: 0.6, ax: 0.16, ay: 0.05, fx: 1.1, fy: 0.9, p: 2.2 },
  { x: 0.85, y: 0.16, r: 0.5, ax: 0.12, ay: 0.05, fx: 0.9, fy: 1.4, p: 4 },
  { x: 0.4, y: 0.3, r: 0.42, ax: 0.18, ay: 0.06, fx: 1.3, fy: 0.7, p: 1.1 },
  { x: 0.7, y: 0.34, r: 0.38, ax: 0.15, ay: 0.05, fx: 0.7, fy: 1.1, p: 3.3 },
  { x: 0.08, y: 0.36, r: 0.36, ax: 0.1, ay: 0.05, fx: 1.2, fy: 1, p: 5 },
];

type Rgb = [number, number, number];

/** Brightest luminance a dark-base copy-safe field may paint (any frame, any overlap). */
const DARK_FIELD_MAX = 0.065;
/** Darkest luminance a light-base copy-safe field may paint. */
const LIGHT_FIELD_MIN = 0.48;
/** Share of each color the SSR / no-JS fallback keeps (mixed toward the base) when copy-safe. */
const SSR_SHARE = 25;

/** sRGB (0–255) mix of `a` toward `b` by `t`: what canvas / CSS compositing does. */
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgbCss = ([r, g, b]: Rgb) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

type Paint = { rgb: Rgb; alpha: number };

/**
 * Copy-safe paint for one blob color over `base`: the largest share `t` of the color
 * (mixed toward the base) that stays inside the readable range (the 1px dot grid is a
 * texture finer than a glyph stroke and is left out). Compositing in sRGB never leaves
 * the hull of its inputs' luminance (bright side), so once every color is capped no
 * overlap of blobs can exceed the cap. The alpha is raised so a lone blob keeps its
 * original peak whenever that peak was already safe.
 */
function safePaint(color: Rgb, base: Rgb, strength: number, dark: boolean): Paint {
  const baseY = relativeLuminance(base);
  const limit = dark ? Math.max(DARK_FIELD_MAX, baseY) : Math.min(LIGHT_FIELD_MIN, baseY);
  const fits = (t: number) => {
    const y = relativeLuminance(lerp(base, color, t));
    return dark ? y <= limit : y >= limit;
  };
  if (fits(1)) return { rgb: color, alpha: strength };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  if (lo <= 0.001) return { rgb: base, alpha: 0 };
  return { rgb: lerp(base, color, lo), alpha: Math.min(1, strength / lo) };
}

/**
 * Darkest and brightest colors the field can paint: blobs composited in draw order at
 * their center alpha, each kept only when it moves the result further (the worst
 * overlap).
 */
function fieldRange(paints: readonly Paint[], base: Rgb) {
  let max = base;
  let min = base;
  for (const { rgb, alpha } of paints) {
    const up = lerp(max, rgb, alpha);
    if (relativeLuminance(up) > relativeLuminance(max)) max = up;
    const down = lerp(min, rgb, alpha);
    if (relativeLuminance(down) < relativeLuminance(min)) min = down;
  }
  return { min, max };
}

/**
 * Theme tokens for the content layer, clamped to the copy-safe range of the field (pure
 * CSS, so the server HTML is already readable). In a dark theme (light foreground) the
 * foreground is kept at OKLCH L ≥ 0.9 and the muted at ≥ 0.82; in a light theme at ≤ 0.3
 * / ≤ 0.4. The muted is read through a 60/40 mix with the foreground, so a mid-grey muted
 * still takes the theme's polarity. Colors already past those values are kept.
 */
function copySafeTokens(): Record<`--${string}`, string> {
  const clampL = (source: string, lightMin: number, darkMax: number, pivot: number) => {
    const s = `clamp(0, (l - ${pivot}) * 1000, 1)`;
    return `oklch(from ${source} calc(${s} * max(l, ${lightMin}) + (1 - ${s}) * min(l, ${darkMax})) c h)`;
  };
  const fg = clampL('var(--mk-gf-fg)', 0.9, 0.3, 0.5);
  const muted = clampL(
    'color-mix(in oklab, var(--mk-gf-muted) 60%, var(--mk-gf-fg))',
    0.82,
    0.4,
    0.6,
  );
  return {
    '--foreground': fg,
    '--card-foreground': fg,
    '--muted-foreground': muted,
  };
}

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.4 -0.2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Resolves any CSS color (vars, color-mix, oklch) to RGB bytes via a 1×1 canvas. */
function resolveColors(host: HTMLElement, colors: readonly string[]): [number, number, number][] {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  const pixel = document.createElement('canvas');
  pixel.width = 1;
  pixel.height = 1;
  const ctx = pixel.getContext('2d', { willReadFrequently: true });
  const out: [number, number, number][] = [];
  for (const color of colors) {
    probe.style.color = '';
    probe.style.color = color;
    const computed = getComputedStyle(probe).color;
    if (!ctx) {
      out.push([128, 128, 128]);
      continue;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#808080';
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 128, g = 128, b = 128] = ctx.getImageData(0, 0, 1, 1).data;
    out.push([r, g, b]);
  }
  probe.remove();
  return out;
}

/**
 * The SSR / no-JS field. Copy-safe: each color mixed toward the base (opaque at its
 * center), so no overlap can paint past the mixed colors and the clamped tokens read on it
 * before any script runs. Otherwise the palette at `strength` over the base.
 */
function staticGradient(
  blobs: readonly Blob[],
  colors: readonly string[],
  strength: number,
  aurora: boolean,
  safeOver: string | null,
) {
  return blobs
    .map((blob, i) => {
      const color = colors[i % colors.length];
      const size = aurora
        ? `${blob.r * 180}% ${blob.r * 70}%`
        : `${blob.r * 110}% ${blob.r * 120}%`;
      const stop = safeOver
        ? `color-mix(in oklab, ${color} ${Math.round(SSR_SHARE * Math.min(1, strength / 0.5))}%, ${safeOver})`
        : `color-mix(in oklab, ${color} ${Math.round(strength * 100)}%, transparent)`;
      return `radial-gradient(${size} at ${blob.x * 100}% ${blob.y * 100}%, ${stop}, transparent 70%)`;
    })
    .join(', ');
}

export function GradientField({
  children,
  colors = DEFAULT_COLORS,
  background = 'var(--background)',
  variant = 'mesh',
  intensity = 0.55,
  speed = 1,
  grain = false,
  dots = false,
  fadeBottom = true,
  copySafe = true,
  className,
  contentClassName,
}: GradientFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Per-blob paint (capped when copy-safe), shared by the range and the canvas. */
  const paintRef = useRef<Paint[]>([]);
  const reduce = useShouldReduceMotion();
  const aurora = variant === 'aurora';
  const blobs = aurora ? AURORA : MESH;
  const strength = clamp(intensity, 0, 1);
  const palette = colors.length > 0 ? colors : DEFAULT_COLORS;
  const colorKey = palette.join('|');

  // Resolve the palette, cap it (copy-safe) and declare the field's range before the
  // first client paint, so surface awareness (below) measures the content against it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const [base = [0, 0, 0], ...rgb] = resolveColors(root, [background, ...colorKey.split('|')]);
      const dark = relativeLuminance(base) < 0.18;
      const paints = blobs.map((_, i) => {
        const color = rgb[i % rgb.length] ?? base;
        return copySafe ? safePaint(color, base, strength, dark) : { rgb: color, alpha: strength };
      });
      paintRef.current = paints;
      const { min, max } = fieldRange(paints, base);
      root.setAttribute('data-mk-field-min', rgbCss(min));
      root.setAttribute('data-mk-field-max', rgbCss(max));
      root.style.setProperty('--mk-field-min', rgbCss(min));
      root.style.setProperty('--mk-field-max', rgbCss(max));
      root.dispatchEvent(new Event('mk-field-change'));
      scheduleSurfaceCheck();
    };
    update();
    const themeObserver = new MutationObserver(update);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    return () => themeObserver.disconnect();
  }, [background, colorKey, copySafe, strength, blobs]);
  // Text in the content layer is judged against the declared range (worst frame).
  useSurface(contentRef);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!root || !canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let time = 0;
    let inView = false;

    // Blobs are soft: render at ~40% of CSS size (DPR capped at 1.5) and let the
    // browser upscale. Keeps fill cost tiny even on 4K screens.
    const resize = () => {
      const rect = root.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.4;
      width = Math.max(1, Math.round(rect.width * scale));
      height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      const base = Math.max(width, height);
      const t = time * 0.00016 * speed;
      blobs.forEach((blob, i) => {
        const paint = paintRef.current[i];
        if (!paint || paint.alpha <= 0) return;
        const [r, g, b] = paint.rgb;
        const alpha = paint.alpha;
        const cx = (blob.x + Math.sin(t * blob.fx * 6.283 + blob.p) * blob.ax) * width;
        const cy = (blob.y + Math.cos(t * blob.fy * 6.283 + blob.p) * blob.ay) * height;
        const radius = blob.r * base * (1 + Math.sin(t * 4 + blob.p) * 0.06);
        ctx.save();
        ctx.translate(cx, cy);
        if (aurora) ctx.scale(1.7, 0.55);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        gradient.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      });
      canvas.dataset.ready = 'true';
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      // ~30 fps budget: a slow gradient gains nothing from 60+ fps.
      if (now - last < 32) return;
      time += last === 0 ? 0 : Math.min(now - last, 64);
      last = now;
      draw();
    };
    const start = () => {
      if (reduce || frame || !inView || document.visibilityState !== 'visible') return;
      last = 0;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    const viewObserver = new IntersectionObserver(([entry]) => {
      inView = Boolean(entry?.isIntersecting);
      if (inView) start();
      else stop();
    });
    viewObserver.observe(root);
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    document.addEventListener('visibilitychange', onVisibility);
    // Theme switches re-resolve the palette (layout effect above), then redraw.
    root.addEventListener('mk-field-change', draw);
    resize();

    return () => {
      stop();
      resizeObserver.disconnect();
      viewObserver.disconnect();
      root.removeEventListener('mk-field-change', draw);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduce, speed, aurora, blobs]);

  const grainOpacity = grain === true ? 0.3 : grain === false ? 0 : clamp(grain, 0, 1);
  const rootStyle: StyleWithVars = copySafe
    ? {
        background,
        // The page's tokens, read by the clamped content tokens (no self-reference).
        '--mk-gf-fg': 'var(--foreground)',
        '--mk-gf-muted': 'var(--muted-foreground)',
      }
    : { background };
  const fallbackStyle: StyleWithVars = {
    backgroundImage: staticGradient(
      blobs,
      palette,
      strength * 0.9,
      aurora,
      copySafe ? background : null,
    ),
  };

  return (
    <div
      ref={rootRef}
      data-mk-field={copySafe ? 'copy-safe' : 'raw'}
      className={cn('relative isolate overflow-hidden', className)}
      style={rootStyle}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {/* Static equivalent for SSR / no-JS; the canvas fades in over it. */}
        <div className="absolute inset-0" style={fallbackStyle} />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100"
          style={{ background }}
        />
        {dots ? (
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'radial-gradient(color-mix(in oklab, var(--foreground) 22%, transparent) 1px, transparent 1.2px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%)',
            }}
          />
        ) : null}
        {grainOpacity > 0 ? (
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{
              backgroundImage: GRAIN_URL,
              backgroundSize: '160px 160px',
              opacity: grainOpacity,
            }}
          />
        ) : null}
        {fadeBottom ? (
          <div
            className="absolute inset-x-0 bottom-0 h-1/3"
            style={{ background: `linear-gradient(to bottom, transparent, ${background})` }}
          />
        ) : null}
      </div>
      <div
        ref={contentRef}
        className={cn('relative', contentClassName)}
        style={copySafe ? copySafeTokens() : undefined}
      >
        {children}
      </div>
    </div>
  );
}
