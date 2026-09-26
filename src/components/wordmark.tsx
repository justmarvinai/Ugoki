type WordmarkProps = {
  className?: string;
};

/**
 * The `ugoki` wordmark (docs/03-design-system.md §2): Mona Sans Expanded 800, lowercase,
 * with the i's tittle replaced by the Dot — Ugoki's playhead. Set in live type (a dotless ı plus
 * a drawn circle) so it stays crisp at every size and inherits `color`.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      role="img"
      aria-label="Ugoki"
      className={`inline-flex items-baseline font-[800] leading-none tracking-[-0.04em] [font-stretch:125%] ${className ?? ''}`}
    >
      <span aria-hidden="true">ugok</span>
      <span aria-hidden="true" className="relative">
        ı
        <span className="absolute top-[0.02em] left-1/2 size-[0.2em] -translate-x-1/2 rounded-full bg-dot" />
      </span>
    </span>
  );
}
