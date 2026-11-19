// @polsia:user-owned — brand identity. Edit freely. `site.ts` re-exports
// siteName/siteDescription; `manifest.ts` + `opengraph-image.tsx` read `brandVisual`.

export const siteName = 'Dayweft';
export const siteDescription = 'A more helpful AI assistant for everyday life.';

// PWA + social-share colors. HEX only (CSS variables aren't readable here) — set
// them to match the theme you define in src/app/brand-theme.css. The starter
// values are achromatic placeholders, not a palette.
export const brandVisual = {
  /** PWA browser-UI / status-bar color — usually your background or primary. */
  themeColor: '#ffffff',
  /** PWA splash + install background. */
  backgroundColor: '#ffffff',
  /** Social-share (OG/Twitter) image. */
  og: {
    background: '#ffffff',
    foreground: '#17243A',
    /** Second line under the site name; '' hides it. */
    tagline: 'A more helpful AI assistant for everyday life.',
    /** Optional https PNG/JPEG background photo; '' keeps the plain-color card. */
    image: '',
  },
} as const;
