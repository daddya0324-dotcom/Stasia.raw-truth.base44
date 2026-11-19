// @polsia:user-owned — presets and optional brand colors/fonts share one rendering contract.
import type { CSSProperties } from 'react';
import type {
  LandingColors,
  LandingFonts,
  LandingTheme,
  Palette,
  SectionComposition,
  TypographyPreset,
} from './types';

type PaletteColors = LandingColors & { muted: string; line: string };

/** Preset palettes. Starting points, not a rule: edit them or bypass them with `theme.colors`. */
export const landingPalettes: Record<Palette, PaletteColors> = {
  cobalt: {
    primary: '#2949eb',
    accent: '#edf1ff',
    background: '#ffffff',
    text: '#17213d',
    muted: '#626b80',
    line: '#e3e7f0',
  },
  forest: {
    primary: '#245647',
    accent: '#e9eee8',
    background: '#f6f5f1',
    text: '#202c25',
    muted: '#62695e',
    line: '#d9ded3',
  },
  wine: {
    primary: '#642c38',
    accent: '#f7e6c5',
    background: '#fff9ed',
    text: '#40242b',
    muted: '#7b6360',
    line: '#e7d9c4',
  },
};

// Achromatic fallback for a theme with no palette. The schema only admits that
// shape when all four colors are set, so this is reached for unvalidated input.
const neutral: PaletteColors = {
  primary: '#1a1a1a',
  accent: '#f0f0f0',
  background: '#ffffff',
  text: '#1a1a1a',
  muted: '#5f5f5f',
  line: '#e2e2e2',
};

function presetFor(theme: LandingTheme): PaletteColors {
  return theme.palette ? landingPalettes[theme.palette] : neutral;
}

export function resolveLandingColors(theme: LandingTheme): LandingColors {
  const preset = presetFor(theme);
  return {
    primary: theme.colors?.primary ?? preset.primary,
    accent: theme.colors?.accent ?? preset.accent,
    background: theme.colors?.background ?? preset.background,
    text: theme.colors?.text ?? preset.text,
  };
}

/** The preset name for the renderer's data-typography hook, or 'custom' for font-family strings. */
export function typographyPreset(theme: LandingTheme): TypographyPreset | 'custom' {
  return typeof theme.typography === 'string' ? theme.typography : 'custom';
}

/** Custom font families, when the theme supplies them instead of a preset. */
export function landingFonts(theme: LandingTheme): LandingFonts | undefined {
  return typeof theme.typography === 'string' ? undefined : theme.typography;
}

function luminance(hex: string): number {
  const value =
    hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit).join('') : hex.slice(1);
  const linear = (offset: number) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(0) + 0.7152 * linear(2) + 0.0722 * linear(4);
}

function readableForeground(background: string, preferred: string): string {
  const bg = luminance(background);
  const fg = luminance(preferred);
  if ((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5) return preferred;
  return (bg + 0.05) / 0.05 > 1.05 / (bg + 0.05) ? '#000000' : '#ffffff';
}

export function landingThemeStyle(
  theme: LandingTheme,
): CSSProperties & Record<`--land-${string}`, string> {
  const colors = resolveLandingColors(theme);
  const preset = presetFor(theme);
  const fonts = landingFonts(theme);
  const customSurface = theme.colors?.background !== undefined || theme.colors?.text !== undefined;
  return {
    '--land-accent': colors.primary,
    '--land-tint': colors.accent,
    '--land-bg': colors.background,
    '--land-ink': colors.text,
    '--land-muted': customSurface
      ? `color-mix(in srgb, ${colors.text} 70%, ${colors.background})`
      : preset.muted,
    '--land-line': customSurface
      ? `color-mix(in srgb, ${colors.text} 18%, ${colors.background})`
      : preset.line,
    '--land-on-accent': readableForeground(colors.primary, colors.background),
    '--land-accent-ink': readableForeground(colors.background, colors.primary),
    // Inline custom properties beat the preset rules in landing-page.module.css.
    ...(fonts ? { '--land-display': fonts.display, '--land-body': fonts.body } : {}),
  };
}

function mixHex(foreground: string, background: string, amount: number): string {
  const expand = (hex: string) =>
    hex.length === 4 ? [...hex.slice(1)].map((digit) => digit.repeat(2)).join('') : hex.slice(1);
  const foregroundHex = expand(foreground);
  const backgroundHex = expand(background);
  return `#${[0, 2, 4]
    .map((offset) => {
      const front = Number.parseInt(foregroundHex.slice(offset, offset + 2), 16);
      const back = Number.parseInt(backgroundHex.slice(offset, offset + 2), 16);
      return Math.round(front * amount + back * (1 - amount))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

function hasTextContrast(foreground: string, background: string): boolean {
  const front = luminance(foreground);
  const back = luminance(background);
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) >= 4.5;
}

/** Scope a selected tone to one section; omission leaves legacy markup untouched. */
export function landingSectionStyle(
  composition: SectionComposition | undefined,
  theme: LandingTheme,
): (CSSProperties & Record<`--land-${string}`, string>) | undefined {
  if (!composition?.tone) return undefined;
  const colors = resolveLandingColors(theme);
  const background =
    composition.tone === 'surface'
      ? colors.accent
      : composition.tone === 'accent'
        ? colors.primary
        : colors.text;
  const foreground = readableForeground(background, colors.text);
  const proposedTint = mixHex(foreground, background, 0.08);
  // Nested cards must not reduce the readable foreground's contrast below 4.5:1.
  const tint = hasTextContrast(foreground, proposedTint) ? proposedTint : background;
  const proposedMuted = mixHex(foreground, background, 0.75);
  const muted =
    hasTextContrast(proposedMuted, background) && hasTextContrast(proposedMuted, tint)
      ? proposedMuted
      : foreground;
  return {
    backgroundColor: background,
    color: foreground,
    '--land-bg': background,
    '--land-ink': foreground,
    '--land-muted': muted,
    '--land-line': `color-mix(in srgb, ${foreground} 22%, ${background})`,
    '--land-tint': tint,
    '--land-accent': foreground,
    '--land-on-accent': background,
    '--land-accent-ink': foreground,
  };
}
