/**
 * A gallery page's heading and intro (server-rendered: the category pages' text is for people
 * first, and for search engines).
 */
export function GalleryIntro({ heading, intro }: { heading: string; intro: string }) {
  return (
    <div className="mb-8 max-w-[46rem] scroll-mt-24 md:mb-10">
      <h1 className="text-[30px] font-[750] leading-[1.02] tracking-[-0.03em] text-balance [font-stretch:112%] md:text-[40px] 3xl:text-[48px]">
        {heading}
      </h1>
      <p className="mt-3 text-[15px] leading-[1.5] text-fg-2 text-pretty md:text-[16px]">{intro}</p>
    </div>
  );
}
