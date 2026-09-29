/**
 * Gallery icons, drawn like the core set in `src/design/icons.tsx` (24 px grid, 1.75 px stroke,
 * round caps and joins). Decorative: the control holding an icon carries the accessible name.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const MoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="6" cy="12" r="1.1" fill="currentColor" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    <circle cx="18" cy="12" r="1.1" fill="currentColor" />
  </Icon>
);

/** Text (a capital T with a baseline caret) — the personalization field. */
export const TypeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 6.5V5h11v1.5M10.5 5v14M8 19h5" />
    <path d="M19 13v7" />
  </Icon>
);

export const ClearIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m7.5 7.5 9 9M16.5 7.5l-9 9" />
  </Icon>
);
