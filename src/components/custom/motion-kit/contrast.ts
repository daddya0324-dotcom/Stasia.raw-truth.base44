// @polsia:user-owned
// Contrast-safe color derivations for text. Pure CSS strings (color-mix + relative
// color syntax): they resolve in the browser against the live theme tokens, so the
// server HTML already carries the final, readable colors. No JS color math, no
// opacity on text.
//
// Why mixing toward --foreground works for any accent: a theme's foreground already
// contrasts strongly with its surfaces (background, card, light tints), in light and
// dark themes alike. Pulling a color most of the way toward it lands far enough from
// the surface for WCAG AA even when the accent itself is a pastel on cream or a dark
// green on a dark green page, while keeping the accent's hue.

/**
 * Secondary text (meta, captions, eyebrows) of the kit: the theme's muted-foreground,
 * pulled a quarter of the way toward the foreground. Same hierarchy, but it keeps
 * ≥ 4.5:1 on tinted chips and cards even when the theme's muted color is borderline.
 */
export const MUTED_TEXT = 'color-mix(in oklab, var(--muted-foreground) 75%, var(--foreground))';

/**
 * A readable text color derived from any CSS color (brand token, tone, caller color),
 * for text on the page background, a card or a light tint of that color.
 * `small` (default) targets 4.5:1 (body text, labels, pills); `large` targets 3:1
 * (≥ 24px, or ≥ 18.66px bold: headline numbers, rotating headline words) and stays
 * closer to the original color.
 */
export function readableText(color: string, size: 'small' | 'large' = 'small'): string {
  // The share of `color` is 40% / 50%, lowered on the root of a kit component that sits
  // on a mid-lightness surface (`--mk-tone-mix*`, set by surface awareness) so it still
  // reaches AA there.
  const share = size === 'large' ? 'var(--mk-tone-mix-large, 50%)' : 'var(--mk-tone-mix, 40%)';
  return `color-mix(in oklab, ${color} ${share}, var(--foreground))`;
}

/**
 * A solid fill derived from `color` that can carry text: mid-lightness colors
 * (OKLCH L between 0.5 and 0.62, where neither light nor dark text reaches 4.5:1) are
 * darkened to L 0.5; every other color is returned unchanged.
 */
export function solidFill(color: string): string {
  return `oklch(from ${color} calc(l - clamp(0, l - 0.5, 0.12) * clamp(0, (0.62 - l) * 1000, 1)) c h)`;
}

/**
 * Text color for a solid `fill` (use with `solidFill`): near-white on dark fills,
 * near-black on light ones, faintly tinted with the fill's hue. ≥ 4.5:1 on any
 * `solidFill` output, whatever the theme's `--primary-foreground` says.
 */
export function textOnFill(fill: string): string {
  return `oklch(from ${fill} clamp(0.18, (0.56 - l) * 1000, 0.985) min(c, 0.03) h)`;
}
