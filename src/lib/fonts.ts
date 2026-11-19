// @polsia:user-owned — self-hosted product fonts with metric-adjusted fallbacks.
import localFont from 'next/font/local';

export const display = localFont({
  src: '../../public/fonts/sora/sora-400-700-normal-latin.woff2',
  display: 'swap',
  variable: '--font-sora',
  weight: '400 700',
});

export const body = localFont({
  src: '../../public/fonts/albert-sans/albert-sans-400-700-normal-latin.woff2',
  display: 'swap',
  variable: '--font-albert-sans',
  weight: '400 700',
});
