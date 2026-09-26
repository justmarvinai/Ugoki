/**
 * Ugoki icons (docs/03-design-system.md §7): 24 px grid, 1.75 px stroke, round caps and joins.
 * Decorative by default — the control that holds an icon carries the accessible name.
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

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7Z"
      fill="currentColor"
    />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const LoopIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M17 3.5 20 6.5l-3 3" />
    <path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20" />
    <path d="M7 20.5 4 17.5l3-3" />
    <path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4" />
  </Icon>
);

export const StepBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14" />
    <path d="m18 6-8 6 8 6V6Z" fill="currentColor" />
  </Icon>
);

export const StepForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 5v14" />
    <path d="m6 6 8 6-8 6V6Z" fill="currentColor" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M5 19.5h14" />
  </Icon>
);

export const ShuffleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M17 4l3 3-3 3" />
    <path d="M4 7h3.5c2 0 3.2 1 4.2 2.6l.6 1" />
    <path d="M20 7h-3.5c-2 0-3.2 1-4.2 2.6l-2.6 4.8C8.7 16 7.5 17 5.5 17H4" />
    <path d="M17 14l3 3-3 3" />
    <path d="M20 17h-3.5c-1.4 0-2.4-.5-3.2-1.4" />
  </Icon>
);

export const GuidesIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M7 8.5h10v7H7z" strokeDasharray="2 2" />
  </Icon>
);
