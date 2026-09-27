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

export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3" />
  </Icon>
);

export const RedoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m15 14 4.5-4.5L15 5" />
    <path d="M19.5 9.5H9a5 5 0 0 0 0 10h3" />
  </Icon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Icon>
);

export const LinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

/** Fit to the stage (zoom). */
export const FitIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Icon>
);

/** The transparency checkerboard (preview backdrop). */
export const CheckerIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
    <path d="M4 4h8v8H4zM12 12h8v8h-8z" fill="currentColor" stroke="none" opacity="0.35" />
  </Icon>
);
