/**
 * Lazy HarfBuzz loader. harfbuzzjs instantiates its WebAssembly module with a top-level await
 * and locates `harfbuzz.wasm` via `new URL(…, import.meta.url)`, which bundlers (Turbopack,
 * Vite) emit as a static asset. Importing it dynamically keeps the ~174 KB (gz) WASM off every
 * page that doesn't render text.
 */

export type HarfBuzz = typeof import('harfbuzzjs');

let modulePromise: Promise<HarfBuzz> | null = null;

export function loadHarfBuzz(): Promise<HarfBuzz> {
  modulePromise ??= import('harfbuzzjs');
  return modulePromise;
}
