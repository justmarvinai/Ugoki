/** Measures fallback-font text with a scratch canvas (the layout needs advances for emoji/CJK). */
export function createFallbackMeasure(): (text: string, font: string, size: number) => number {
  let ctx: OffscreenCanvasRenderingContext2D | null | undefined;
  return (text, font, size) => {
    ctx ??= new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) return [...text].length * size * 0.6;
    ctx.font = `${size}px ${font}`;
    return ctx.measureText(text).width;
  };
}
