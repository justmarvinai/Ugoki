import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';
import { categoryName } from '@/engine/host';
import { TEMPLATES } from '@/templates/registry';
import { DraftList } from '../drafts/draft-list';

/**
 * The template chooser: every template with its category, tagline and formats, each opening
 * the editor. Server-rendered; live previews come with the gallery (docs/02-experience.md §5).
 */
export function TemplateChooser() {
  return (
    <div data-theme="cinema" className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex h-14 max-w-[2560px] items-center border-line border-b px-4 md:px-6">
        <Link href="/" aria-label="Ugoki home" className="rounded-sm">
          <Wordmark className="text-[20px]" />
        </Link>
      </header>
      <main className="mx-auto max-w-[2560px] px-4 py-10 md:px-6 md:py-14">
        <DraftList />
        <h1 className="text-[32px] font-[700] leading-tight tracking-[-0.02em] md:text-[44px]">
          Templates
        </h1>
        <p className="mt-3 max-w-[40rem] text-[15px] text-fg-2 leading-relaxed">
          Pick one and make it yours — your words, colors and timing. Everything renders on your
          device.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-4">
          {TEMPLATES.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/editor/${entry.id}`}
                className="group flex h-full min-h-44 flex-col rounded-[20px] bg-bg-2 p-6 ring-1 ring-line transition-[box-shadow,background-color] duration-(--duration-small) ease-swift hover:bg-bg-3 hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="text-[12px] text-fg-3">{categoryName(entry.category)}</span>
                <span className="mt-auto pt-10 text-[28px] font-[700] leading-none tracking-[-0.02em]">
                  {entry.name}
                </span>
                <span className="mt-2 text-[14px] text-fg-2">{entry.tagline}</span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {entry.formats.map((format) => (
                    <span
                      key={format}
                      className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-fg-3 tabular-nums"
                    >
                      {format}
                    </span>
                  ))}
                  {entry.alpha !== 'none' && (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-3">
                      Transparent
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
