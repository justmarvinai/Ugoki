import { Wordmark } from '@/components/wordmark';

/**
 * Temporary home page. The real landing page is built in Phase 6 (docs/02-experience.md §4).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col justify-between px-4 py-8 md:px-6">
      <header>
        <Wordmark className="text-[28px]" />
      </header>
      <section className="py-24">
        <h1 className="font-[750] text-[clamp(48px,9vw,168px)] leading-[0.9] tracking-[-0.04em] [font-stretch:118%]">
          Motion,
          <br />
          made yours.
        </h1>
        <p className="mt-8 max-w-[34rem] text-[17px] text-fg-2 leading-[1.5]">
          Art-directed motion templates. Customize in seconds, export in your browser. Ugoki is
          being built — the engine comes first.
        </p>
      </section>
      <footer className="text-[14px] text-fg-3">© Ugoki · 動き — movement</footer>
    </main>
  );
}
