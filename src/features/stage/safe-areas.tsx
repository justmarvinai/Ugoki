/** Safe-area guides (docs/templates/00-foundations.md), drawn over a view. */

import { createFrame, type FormatId } from '@/engine/host';

/** Title-safe (90%), action-safe (93%) and, for vertical formats, the social UI zone. */
export function SafeAreas({ format }: { format: FormatId }) {
  const frame = createFrame(format);
  const { title, action, social } = frame.safe;
  const box = (r: { x: number; y: number; w: number; h: number }) => ({
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
  });
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="rgb(47 107 255 / 0.85)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      >
        <rect {...box(action)} vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
        <rect {...box(title)} vectorEffect="non-scaling-stroke" />
        {frame.vertical && (
          <rect
            {...box(social)}
            vectorEffect="non-scaling-stroke"
            stroke="rgb(255 178 36 / 0.85)"
            strokeDasharray="8 4"
          />
        )}
        <path
          d={`M${frame.cx} ${frame.cy - 12}v24M${frame.cx - 12} ${frame.cy}h24`}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
