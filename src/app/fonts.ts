import localFont from 'next/font/local';

/**
 * Interface fonts, self-hosted via next/font (no third-party requests — ADR-017).
 * "Ugoki Sans" / "Ugoki Mono" are renamed subsets of Mona Sans / Mona Sans Mono by GitHub
 * (SIL OFL 1.1, Reserved Font Name "Mona"); built by scripts/fonts.py.
 */
export const ugokiSans = localFont({
  src: '../fonts/ugoki-sans.woff2',
  variable: '--font-ugoki-sans',
  weight: '350 850',
  style: 'normal',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '100% 125%' }],
});

export const ugokiMono = localFont({
  src: '../fonts/ugoki-mono.woff2',
  variable: '--font-ugoki-mono',
  weight: '350 700',
  style: 'normal',
  display: 'swap',
  preload: false,
});
