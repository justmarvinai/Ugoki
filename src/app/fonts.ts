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

/**
 * 動き — the quiet signature (docs/03-design-system.md §2): M PLUS 1 by the M+ FONTS Project
 * (SIL OFL 1.1), subset to its two glyphs at weight 500 (~1 KB); built by scripts/fonts.py.
 * Use `ugokiJp.className` on the 動き text only; other characters fall back to Ugoki Sans.
 */
export const ugokiJp = localFont({
  src: '../fonts/ugoki-jp.woff2',
  variable: '--font-ugoki-jp',
  weight: '500',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['var(--font-ugoki-sans)', 'system-ui', 'sans-serif'],
  declarations: [{ prop: 'unicode-range', value: 'U+52D5, U+304D' }],
});
