// @polsia:user-owned
'use client';

// Surface awareness. The kit derives every text color from the theme tokens
// (--foreground, --muted-foreground, --card…). That is right on the page background,
// but a section band painted with a utility class (`bg-[#16363a] text-white`) keeps the
// page tokens: dark-on-dark text. Two fixes, both here:
//
// - `<Surface>`: a band that sets the whole token set for its own background (CSS only,
//   so the server HTML is already right). Use it for every band whose colors differ from
//   the page.
// - `useSurface(ref)`: every kit component measures the background actually painted
//   behind it (ancestor backgrounds composited with alpha, gradients by every stop,
//   `::before`/`::after` backdrops, positioned backdrops that cover it, a GradientField
//   by its declared darkest/brightest colors, photos and video frames by their sampled
//   dark and light ends when their pixels are readable) before
//   the first client paint. The worst candidate decides: a light gradient with one dark
//   stop is not "dark". If the inherited tokens don't read on it (text or kit muted text
//   under 4.5:1), it sets surface-derived tokens on its own root, so every kit text below
//   re-derives from them; a raw `--muted-foreground` under 4.5:1 is pulled toward the
//   foreground. It re-checks on resize, theme changes and media loads. Nothing happens
//   when the tokens already fit.

import type { CSSProperties, ElementType, ReactNode, RefObject } from 'react';
import { useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { solidFill, textOnFill } from './contrast';

/* ---------------------------------------------------------------------------------- */
/* Color math (sRGB 0–255)                                                              */
/* ---------------------------------------------------------------------------------- */

type Rgba = [number, number, number, number];
type Rgb = [number, number, number];

let probeCtx: CanvasRenderingContext2D | null = null;

/** Any CSS color string the browser understands → RGBA (alpha 0–1). */
function parseColor(css: string): Rgba | null {
  if (!css || css === 'transparent') return [0, 0, 0, 0];
  if (!probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probeCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  const ctx = probeCtx;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#010203';
  ctx.fillStyle = css;
  // An unparsable value leaves the sentinel in place.
  if (ctx.fillStyle === '#010203' && !/^#010203$/i.test(css)) return null;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/** WCAG relative luminance (0–1) of an sRGB (0–255) color. */
export const relativeLuminance = luminance;
function contrast(a: Rgb, b: Rgb) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `a` with `t` of `b` mixed in. */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Paint `top` (with alpha) over an opaque `bottom`. */
const over = (top: Rgba, bottom: Rgb): Rgb => mix(bottom, [top[0], top[1], top[2]], top[3]);
const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const COLOR_IN_IMAGE = /(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^()]*\)/g;

/* ---------------------------------------------------------------------------------- */
/* Measuring the painted background                                                    */
/* ---------------------------------------------------------------------------------- */

/** One painted layer: its possible colors (one for a flat color, the stops of a gradient). */
type Layer = { colors: Rgba[]; opaque: boolean };

/* Media pixels (photos, video frames, background images) ------------------------------ */

/** Sampled colors of a media source: its darkest, median and lightest tones. */
const samples = new Map<string, Rgb[] | 'pending' | 'blocked'>();

function sampleSource(source: CanvasImageSource): Rgb[] | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    const px: Rgb[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) > 200) px.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }
    if (px.length === 0) return null;
    px.sort((a, b) => luminance(a) - luminance(b));
    // Worst cases for text: the dark and light ends (outliers dropped), plus the middle.
    const at = (q: number) => px[Math.min(px.length - 1, Math.floor(px.length * q))] as Rgb;
    return [at(0.06), at(0.5), at(0.94)];
  } catch {
    // Cross-origin pixels without CORS: unreadable (tainted canvas).
    return null;
  }
}

/**
 * Colors of a photo / video frame, or null when its pixels can't be read (cross-origin,
 * not decoded yet: a re-measure is scheduled when it loads).
 */
function mediaColors(media: HTMLImageElement | HTMLVideoElement): Rgb[] | null {
  if (media instanceof HTMLVideoElement) {
    // A playing video changes frame: sample the current one, re-checked on resize.
    if (media.readyState < 2) {
      media.addEventListener('loadeddata', schedule, { once: true });
      return null;
    }
    return sampleSource(media);
  }
  const key = media.currentSrc || media.src;
  if (!key) return null;
  const known = samples.get(key);
  if (Array.isArray(known)) return known;
  if (known === 'blocked') return null;
  if (!media.complete || media.naturalWidth === 0) {
    media.addEventListener('load', schedule, { once: true });
    return null;
  }
  const colors = sampleSource(media);
  samples.set(key, colors ?? 'blocked');
  return colors;
}

/** Colors of a `background-image: url(…)`, loaded once (same origin or CORS-enabled). */
function urlColors(url: string): Rgb[] | null {
  const known = samples.get(url);
  if (Array.isArray(known)) return known;
  if (known) return null;
  samples.set(url, 'pending');
  const img = new Image();
  if (new URL(url, location.href).origin !== location.origin) img.crossOrigin = 'anonymous';
  img.onload = () => {
    samples.set(url, sampleSource(img) ?? 'blocked');
    schedule();
  };
  img.onerror = () => samples.set(url, 'blocked');
  img.src = url;
  return null;
}

/** A photo whose pixels can't be read: the opposite of the inherited text color. */
function guessPhoto(fallbackInk: Rgb | null): Layer {
  const ink = fallbackInk ?? BLACK;
  const guess: Rgb = luminance(ink) > 0.4 ? [24, 24, 24] : [250, 250, 250];
  return { colors: [[...guess, 1]], opaque: true };
}

const opaqueLayer = (colors: Rgb[]): Layer => ({
  colors: colors.map((c) => [...c, 1] as Rgba),
  opaque: true,
});

/* Layers --------------------------------------------------------------------------- */

function layerOfStyle(style: CSSStyleDeclaration, fallbackInk: Rgb | null): Layer | null {
  const colors: Rgba[] = [];
  const base = parseColor(style.backgroundColor);
  const image = style.backgroundImage;
  if (image && image !== 'none') {
    const stops = (image.match(COLOR_IN_IMAGE) ?? [])
      .map(parseColor)
      .filter((c): c is Rgba => c !== null);
    const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(image)?.[1];
    if (url) {
      // A photo (possibly under a gradient scrim, listed first so painted on top): its
      // sampled tones when readable, else a guess from the inherited text color.
      const photo = urlColors(url);
      const under = photo ? opaqueLayer(photo) : guessPhoto(fallbackInk);
      if (stops.length === 0) return under;
      const out: Rgba[] = [];
      for (const bottom of under.colors) {
        for (const stop of stops) out.push([...over(stop, [bottom[0], bottom[1], bottom[2]]), 1]);
      }
      return { colors: prune(out), opaque: true };
    }
    // Each gradient stop sits over the base color.
    for (const stop of stops) {
      if (base && base[3] > 0) {
        const merged = over(stop, [base[0], base[1], base[2]]);
        const alpha = stop[3] + base[3] * (1 - stop[3]);
        colors.push([...merged, alpha]);
      } else colors.push(stop);
    }
  }
  if (colors.length === 0 && base && base[3] > 0.01) colors.push(base);
  if (colors.length === 0) return null;
  return { colors, opaque: colors.every((c) => c[3] >= 0.99) };
}

function layerOf(node: Element, fallbackInk: Rgb | null): Layer | null {
  if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement) {
    const colors = mediaColors(node);
    return colors ? opaqueLayer(colors) : guessPhoto(fallbackInk);
  }
  return layerOfStyle(getComputedStyle(node), fallbackInk);
}

/**
 * Absolutely positioned `::before` / `::after` backdrops of `node` (a gradient or scrim
 * drawn by a pseudo-element) that cover most of it, top-most first.
 */
function pseudoLayers(node: Element, fallbackInk: Rgb | null): Layer[] {
  const out: Layer[] = [];
  const box = node.getBoundingClientRect();
  for (const which of ['::after', '::before'] as const) {
    const style = getComputedStyle(node, which);
    if (style.content === 'none' || style.content === 'normal' || style.display === 'none') {
      continue;
    }
    if (style.position !== 'absolute' && style.position !== 'fixed') continue;
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    if (!(width >= box.width * 0.5 && height >= box.height * 0.5)) continue;
    const layer = layerOfStyle(style, fallbackInk);
    if (layer) out.push(layer);
  }
  return out;
}

const covers = (r: DOMRect, x: number, y: number) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/**
 * Layers of a positioned backdrop element (a `<div class="absolute inset-0">` holding a
 * photo and a scrim, an absolute `<img>`), top-most first: its own background and its
 * descendants that cover the point, photos and video frames included.
 */
function backdropLayers(sib: Element, x: number, y: number, fallbackInk: Rgb | null): Layer[] {
  const found: Layer[] = [];
  const visit = (node: Element, depth: number) => {
    const own = layerOf(node, fallbackInk);
    if (own) found.push(own);
    found.push(...pseudoLayers(node, fallbackInk).reverse());
    if (depth >= 3) return;
    for (const child of Array.from(node.children).slice(0, 8)) {
      if (getComputedStyle(child).visibility === 'hidden') continue;
      if (!covers(child.getBoundingClientRect(), x, y)) continue;
      visit(child, depth + 1);
    }
  };
  visit(sib, 0);
  // `found` is in paint order (bottom first); callers want top-most first.
  return found.reverse();
}

/**
 * A GradientField backdrop: the field declares the darkest and brightest colors it can
 * ever paint (`data-mk-field-min` / `data-mk-field-max`, every blob, overlap and overlay
 * included), so text over it is judged by its worst frame, not by its dark base color
 * or by whichever frame happens to be on screen.
 */
function fieldLayer(node: Element): Layer | null {
  const max = parseColor(node.getAttribute('data-mk-field-max') ?? '');
  const min = parseColor(node.getAttribute('data-mk-field-min') ?? '');
  if (!max || !min || max[3] < 0.99 || min[3] < 0.99) return null;
  return opaqueLayer([
    [min[0], min[1], min[2]],
    [max[0], max[1], max[2]],
  ]);
}

/** At most 12 candidate colors, keeping the darkest and the lightest (the worst cases). */
function prune<T extends Rgb | Rgba>(list: T[]): T[] {
  if (list.length <= 12) return list;
  const sorted = [...list].sort(
    (a, b) => luminance([a[0], a[1], a[2]]) - luminance([b[0], b[1], b[2]]),
  );
  return Array.from(
    { length: 12 },
    (_, i) => sorted[Math.round((i * (sorted.length - 1)) / 11)] as T,
  );
}

/**
 * The colors actually painted under `el` (worst cases of a gradient or photo included),
 * from its own background down to the page canvas.
 */
function paintedBackground(el: Element): Rgb[] {
  const ink = parseColor(getComputedStyle(el).color);
  const inkRgb: Rgb | null = ink && ink[3] > 0.5 ? [ink[0], ink[1], ink[2]] : null;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + Math.min(rect.height / 2, 200);
  const layers: Layer[] = [];
  let child: Element | null = null;
  const push = (list: Layer[]) => {
    for (const layer of list) {
      layers.push(layer);
      if (layer.opaque) return true;
    }
    return false;
  };
  for (let node: Element | null = el; node; child = node, node = node.parentElement) {
    // Inside a GradientField: its declared range is the whole backdrop.
    const field = fieldLayer(node);
    if (field) {
      layers.push(field);
      break;
    }
    // Positioned backdrops painted before the path (an absolute <div class="bg-…"> or
    // <img> behind the content) that cover this element.
    if (child) {
      let done = false;
      for (let sib = child.previousElementSibling; sib; sib = sib.previousElementSibling) {
        const style = getComputedStyle(sib);
        if (style.position !== 'absolute' && style.position !== 'fixed') continue;
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (!covers(sib.getBoundingClientRect(), cx, cy)) continue;
        if (push(backdropLayers(sib, cx, cy, inkRgb))) {
          done = true;
          break;
        }
      }
      if (done) break;
    }
    // `::before` / `::after` backdrops paint over the node's own background.
    if (push(pseudoLayers(node, inkRgb))) break;
    const layer = layerOf(node, inkRgb);
    if (layer && push([layer])) break;
  }
  // Composite bottom-up, over white (the canvas default) when nothing is opaque.
  let result: Rgb[] = [WHITE];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer) continue;
    const next: Rgb[] = [];
    for (const under of result) for (const color of layer.colors) next.push(over(color, under));
    result = prune(next);
  }
  return result;
}

/* ---------------------------------------------------------------------------------- */
/* Tokens for a measured surface                                                       */
/* ---------------------------------------------------------------------------------- */

const minContrast = (fg: Rgb, bgs: readonly Rgb[]) =>
  Math.min(...bgs.map((bg) => contrast(fg, bg)));

/** sRGB (0–255) → OKLab, and back: the kit's CSS mixes are `color-mix(in oklab, …)`. */
function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [channel(r), channel(g), channel(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  };
  return [enc(lin[0] ?? 0), enc(lin[1] ?? 0), enc(lin[2] ?? 0)];
}
/** `color-mix(in oklab, a p, b)` with p in 0–1. */
const mixOklab = (a: Rgb, b: Rgb, p: number): Rgb => fromOklab(mix(toOklab(b), toOklab(a), p));

/** Token values (CSS strings) that read on `bgs` (every candidate color of the surface). */
function tokensFor(bgs: readonly Rgb[], inherited: Rgb | null) {
  // Polarity: the author's own text color when it reads with some headroom (a
  // `text-white` band keeps light text), else whichever of white / black holds more
  // contrast on the WORST candidate (every stop of a gradient, both ends of a photo): a
  // light gradient is never called dark because one of its stops is.
  const authored = inherited && minContrast(inherited, bgs) >= 5.5 ? inherited : null;
  const dark = authored
    ? bgs.every((c) => luminance(authored) > luminance(c))
    : minContrast(WHITE, bgs) >= minContrast(BLACK, bgs);
  const extreme = dark ? WHITE : BLACK;
  // Representative surface: the candidate the text contrasts least with (the hardest).
  const bg = [...bgs].sort((a, b) => contrast(extreme, a) - contrast(extreme, b))[0] as Rgb;
  // Foreground: the author's color when it clearly reads, else a near white/black faintly
  // tinted by the surface, else pure white/black.
  const tinted = mix(dark ? [247, 247, 245] : [22, 22, 24], bg, 0.06);
  let fg: Rgb = extreme;
  if (authored && minContrast(authored, bgs) >= 7) fg = authored;
  else if (minContrast(tinted, bgs) >= 7) fg = tinted;
  // Cards: a step toward the text on dark surfaces (away from it when contrast is
  // tight), toward white on light ones.
  const tight = minContrast(fg, bgs) < 7;
  const card = dark ? (tight ? mix(bg, BLACK, 0.12) : mix(bg, fg, 0.07)) : mix(bg, WHITE, 0.55);
  const surfaces = [...bgs, card];
  // Muted: as far toward the surface as it can go while keeping 4.5:1 (with margin) on
  // the surface and on cards; the foreground itself when there is no room.
  let muted = fg;
  for (let t = 0.4; t >= 0; t -= 0.02) {
    const candidate = mix(fg, bg, t);
    if (minContrast(candidate, surfaces) >= 5.2) {
      muted = candidate;
      break;
    }
  }
  const tone = dark ? 'dark' : 'light';
  return {
    tone,
    fg,
    card,
    vars: {
      color: css(fg),
      '--background': css(bg),
      '--foreground': css(fg),
      '--card': css(card),
      '--card-foreground': css(fg),
      '--popover': css(card),
      '--popover-foreground': css(fg),
      '--muted': css(mix(bg, fg, 0.07)),
      '--muted-foreground': css(muted),
      '--secondary': css(mix(bg, fg, 0.08)),
      '--secondary-foreground': css(fg),
      '--accent': css(mix(bg, fg, 0.1)),
      '--accent-foreground': css(fg),
      '--border': css(mix(bg, fg, dark ? 0.18 : 0.14)),
      '--input': css(mix(bg, fg, dark ? 0.22 : 0.18)),
      '--mk-surface-bg': css(bg),
      '--mk-surface-fg': css(fg),
      '--mk-surface-muted': css(muted),
    } as Record<string, string>,
  };
}

/**
 * Largest share (≤ `max`) of a tone color that `readableText` can keep when mixing it
 * toward `fg`, so the result still reaches `need` on every surface, for every tone.
 */
function toneShare(
  tones: readonly Rgb[],
  fg: Rgb,
  surfaces: readonly Rgb[],
  max: number,
  need: number,
) {
  for (let p = max; p > 0; p -= 5) {
    if (tones.every((tone) => minContrast(mixOklab(tone, fg, p / 100), surfaces) >= need)) return p;
  }
  return 0;
}

/* ---------------------------------------------------------------------------------- */
/* Scheduler: every kit root, measured ancestors first, before paint                   */
/* ---------------------------------------------------------------------------------- */

const OWN = 'data-mk-surface-own';
const roots = new Set<HTMLElement>();
/** Contrast the raw `--muted-foreground` must reach on a root (`useSurface` option). */
const mutedTarget = new WeakMap<HTMLElement, number>();
const applied = new WeakMap<HTMLElement, string[]>();
let queued = false;
let listening = false;

function clear(el: HTMLElement) {
  for (const name of applied.get(el) ?? []) el.style.removeProperty(name);
  applied.delete(el);
  el.removeAttribute(OWN);
}

const TONE_PROBES = [
  'var(--mk-accent, var(--primary))',
  'var(--mk-ok, oklch(0.62 0.14 158))',
  'var(--mk-alert, var(--destructive))',
  'var(--muted-foreground)',
];

/** Resolved colors at `el`: [0] foreground, [1] kit muted text, [2] card, then the tones. */
function resolveColors(el: HTMLElement, extra: readonly string[]): (Rgb | null)[] {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  el.appendChild(probe);
  const out = [
    'var(--foreground)',
    'color-mix(in oklab, var(--muted-foreground) 75%, var(--foreground))',
    'var(--card)',
    ...extra,
  ].map((value) => {
    probe.style.color = value;
    const c = parseColor(getComputedStyle(probe).color);
    return c && c[3] > 0.5 ? ([c[0], c[1], c[2]] as Rgb) : null;
  });
  probe.remove();
  return out;
}

function measure(el: HTMLElement) {
  if (!el.isConnected) return;
  const bgs = paintedBackground(el);
  const [fg, muted, card, ...tones] = resolveColors(el, TONE_PROBES);
  const ok = fg && muted && minContrast(fg, bgs) >= 4.5 && minContrast(muted, bgs) >= 4.5;
  const vars: Record<string, string> = {};
  let ink = fg;
  let cardColor = card;
  let tone: string;
  if (ok && fg) {
    // Dark only when the text is lighter than every painted candidate.
    tone = bgs.every((bg) => luminance(fg) > luminance(bg)) ? 'dark' : 'light';
    // Page code inside the component (agent-authored labels on a stage) uses the raw
    // `--muted-foreground`: when it misses 4.5:1 on this surface or its cards, pull it
    // toward the foreground until it passes (the rest of the tokens already fit).
    const raw = tones[TONE_PROBES.length - 1];
    const surfaces = card ? [...bgs, card] : bgs;
    const need = mutedTarget.get(el) ?? 4.5;
    if (raw && minContrast(raw, surfaces) < need) {
      let fixed: Rgb = fg;
      for (let t = 0.05; t < 1; t += 0.05) {
        const candidate = mix(raw, fg, t);
        if (minContrast(candidate, surfaces) >= need + 0.2) {
          fixed = candidate;
          break;
        }
      }
      vars['--muted-foreground'] = css(fixed);
    }
  } else {
    const inherited = parseColor(getComputedStyle(el).color);
    const tokens = tokensFor(
      bgs,
      inherited && inherited[3] > 0.99 ? [inherited[0], inherited[1], inherited[2]] : null,
    );
    Object.assign(vars, tokens.vars);
    ink = tokens.fg;
    cardColor = tokens.card;
    tone = tokens.tone;
    // A readable foreground for text on the brand color, from the brand color itself.
    const primary = parseColor(getComputedStyle(el).getPropertyValue('--primary').trim());
    if (primary && primary[3] > 0.5) {
      const p: Rgb = [primary[0], primary[1], primary[2]];
      vars['--primary-foreground'] = css(
        contrast(WHITE, p) >= contrast(BLACK, p) ? WHITE : [17, 17, 17],
      );
    }
  }
  // Tone text (`readableText`, pills, flags): keep less of the tone where the surface
  // leaves little room (mid-lightness bands), so it still reaches AA.
  if (ink) {
    const known = tones.filter((t): t is Rgb => t !== null);
    const base = cardColor ? [...bgs, cardColor] : bgs;
    // Tone text also sits on light tints of its tone (pills: 14% of the tone on the card).
    const surfaces = [
      ...base,
      ...known.map((t) => mixOklab(t, cardColor ?? base[0] ?? WHITE, 0.14)),
    ];
    const small = toneShare(known, ink, surfaces, 40, 4.7);
    const large = toneShare(known, ink, surfaces, 50, 3.2);
    if (small < 40) vars['--mk-tone-mix'] = `${small}%`;
    if (large < 50) vars['--mk-tone-mix-large'] = `${large}%`;
  }
  const names = Object.keys(vars);
  for (const name of names) el.style.setProperty(name, vars[name] ?? null);
  if (names.length) {
    applied.set(el, names);
    el.setAttribute(OWN, '');
  }
  el.setAttribute('data-mk-surface', tone);
}

function flush() {
  queued = false;
  const list = [...roots].filter((el) => el.isConnected);
  // Ancestors first: a nested kit component sees the tokens its parent settled on.
  list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const el of list) clear(el);
  for (const el of list) measure(el);
}

/** Re-measures every surface-aware root (e.g. after a backdrop declared new colors). */
export function scheduleSurfaceCheck() {
  schedule();
}

function schedule() {
  if (queued) return;
  queued = true;
  // Microtask: after React's layout effects, before the browser paints.
  queueMicrotask(flush);
}

let resizeTimer = 0;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(schedule, 150);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  const observer = new MutationObserver(schedule);
  const options = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
  observer.observe(document.documentElement, options);
  if (document.body) observer.observe(document.body, options);
}

/**
 * Makes the kit text inside `ref` readable on the background actually painted behind it
 * (see the file header). Call it once per kit component root.
 */
export function useSurface(
  ref: RefObject<HTMLElement | null> | HTMLElement | null,
  {
    mutedContrast,
  }: {
    /**
     * Contrast the raw `--muted-foreground` must reach on this root (default 4.5). Small
     * labels on cards ask for more headroom (StageCard: 8), since antialiased 11–13px
     * glyphs read lighter than their CSS color.
     */
    mutedContrast?: number;
  } = {},
) {
  useLayoutEffect(() => {
    const el = ref && 'current' in ref ? ref.current : ref;
    if (!el) return;
    if (mutedContrast) mutedTarget.set(el, mutedContrast);
    roots.add(el);
    listen();
    schedule();
    return () => {
      roots.delete(el);
      mutedTarget.delete(el);
      clear(el);
    };
    // A state-held element (passed directly) re-runs this when it mounts.
  }, [ref, mutedContrast]);
}

/* ---------------------------------------------------------------------------------- */
/* <Surface>                                                                            */
/* ---------------------------------------------------------------------------------- */

/**
 * Token set for a band painted `background` (any CSS color). Pure CSS (relative color
 * syntax), so the server HTML is already readable. Mid-lightness colors are darkened to a
 * fill that can carry text (see `solidFill`); the text flips to near-white / near-black
 * from the fill itself, and the muted text keeps ≥ 4.5:1 on the band and on its cards.
 */
export function surfaceTokens(background: string): Record<`--${string}`, string> {
  const bg = 'var(--mk-surface-bg)';
  // Dark surface (oklch L < 0.56) → s = 1.
  const s = 'clamp(0, (0.56 - l) * 1000, 1)';
  const fg = textOnFill(bg);
  const muted = `oklch(from ${bg} calc(${s} * clamp(0.66, l + 0.46, 0.99) + (1 - ${s}) * clamp(0.16, l - 0.46, 0.46)) min(c, 0.03) h)`;
  const card = `oklch(from ${bg} calc(l + ${s} * 0.035 + (1 - ${s}) * min(0.03, 1 - l)) c h)`;
  const step = (percent: number) => `color-mix(in oklab, ${bg} ${100 - percent}%, ${fg})`;
  return {
    '--mk-surface-bg': solidFill(background),
    '--mk-surface-fg': fg,
    '--mk-surface-muted': muted,
    '--background': bg,
    '--foreground': fg,
    '--card': card,
    '--card-foreground': fg,
    '--popover': card,
    '--popover-foreground': fg,
    '--muted': step(7),
    '--muted-foreground': muted,
    '--secondary': step(8),
    '--secondary-foreground': fg,
    '--accent': step(10),
    '--accent-foreground': fg,
    '--border': step(16),
    '--input': step(20),
    '--primary-foreground': textOnFill(solidFill('var(--primary)')),
  };
}

/** Default band colors from the brand hue: a deep tone and a near-white. */
const TONE_BACKGROUND = {
  dark: 'oklch(from var(--primary) 0.24 min(c, 0.05) h)',
  light: 'oklch(from var(--primary) 0.975 min(c, 0.012) h)',
} as const;

export type SurfaceProps = {
  /** `dark` or `light` band from the brand hue. Ignored when `background` is set. */
  tone?: 'dark' | 'light';
  /**
   * The band's color (any CSS color: `#16363a`, `var(--brand-900)`). Tokens and text
   * colors are derived from it. Default: from `tone`.
   */
  background?: string;
  /** Element. Default `section`. */
  as?: ElementType;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * A section band with its own colors. It paints `background` and re-scopes the theme
 * tokens (`--background`, `--foreground`, `--muted-foreground`, `--card`, `--border`,
 * `--primary-foreground`…) for it, so `text-foreground`, `text-muted-foreground`,
 * `bg-card` and every kit component inside read correctly, in the server HTML too.
 * `tone="dark"` also adds the `dark` class, so `dark:` utilities inside apply.
 */
export function Surface({
  tone = 'dark',
  background,
  as: Tag = 'section',
  id,
  className,
  style,
  children,
}: SurfaceProps) {
  const color = background ?? TONE_BACKGROUND[tone];
  const vars = surfaceTokens(color);
  const isDark = background ? undefined : tone === 'dark';
  return (
    <Tag
      id={id}
      data-mk-surface={background ? 'custom' : tone}
      className={cn(isDark && 'dark', 'bg-background text-foreground', className)}
      style={{ ...vars, ...style } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
