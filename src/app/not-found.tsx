import type { Metadata } from 'next';
import Link from 'next/link';
import { NotFoundStage } from '@/features/legal/not-found-stage';
import { SiteFooter } from '@/features/site/footer';
import { SiteNav } from '@/features/site/nav';

/**
 * 404 (docs/02-experience.md §2): Daylight; the "404" is animated by the engine — a live stage
 * loaded after first paint — while the heading below says it in plain HTML. (Next.js marks the
 * page `noindex` itself.)
 */
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main data-theme="daylight" className="flex flex-1 flex-col justify-center bg-bg text-fg">
        <div className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-20 md:px-6 md:pt-10 md:pb-24">
          {/* The stage fits the viewport's height on wide screens (caption and CTAs stay above the fold). */}
          <div className="mx-auto w-full max-w-[min(100%,max(28rem,calc((100svh_-_23rem)*16/9)))]">
            <NotFoundStage />
            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-title font-stretch-112%">404</h1>
                <p className="mt-2 text-body-l text-fg-2">
                  This page doesn’t exist — the templates do.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/templates"
                  className="inline-flex h-14 items-center rounded-full bg-fg px-7 font-[550] text-[17px] text-bg transition-[background-color,transform] duration-(--duration-micro) ease-swift hover:bg-fg/88 active:scale-[0.97]"
                >
                  See the templates
                </Link>
                <Link
                  href="/"
                  className="inline-flex h-14 items-center rounded-full border border-line-strong px-7 font-[550] text-[17px] text-fg transition-[background-color,transform] duration-(--duration-micro) ease-swift hover:bg-bg-2 active:scale-[0.97]"
                >
                  Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter theme="daylight" />
    </div>
  );
}
