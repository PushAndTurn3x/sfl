/**
 * Inline SVG icon set. Kept here to avoid adding lucide-react as a dep.
 * All icons are 24x24 viewBox, stroke-based, and inherit `currentColor`.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

export function IconCalculator(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01M8 19h6" />
    </svg>
  );
}

export function IconBell(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.21 16.96l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 4.6 1.65 1.65 0 0 0 9.92 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconCoin(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v12M9 9h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15" />
    </svg>
  );
}

export function IconFlower(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2c1.7 0 3 1.3 3 3 0 1.5-1 3-3 4.5C10 8 9 6.5 9 5c0-1.7 1.3-3 3-3z" />
      <path d="M12 22c1.7 0 3-1.3 3-3 0-1.5-1-3-3-4.5-2 1.5-3 3-3 4.5 0 1.7 1.3 3 3 3z" />
      <path d="M2 12c0-1.7 1.3-3 3-3 1.5 0 3 1 4.5 3-1.5 2-3 3-4.5 3-1.7 0-3-1.3-3-3z" />
      <path d="M22 12c0-1.7-1.3-3-3-3-1.5 0-3 1-4.5 3 1.5 2 3 3 4.5 3 1.7 0 3-1.3 3-3z" />
    </svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconLeaf(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6" />
    </svg>
  );
}

export function IconCow(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M8 14a4 4 0 1 0 8 0v-2H8z" />
      <path d="M6 7c-1.5 0-3 1-3 3 0 1 .5 2 1.5 2.5" />
      <path d="M18 7c1.5 0 3 1 3 3 0 1-.5 2-1.5 2.5" />
      <path d="M12 14v3" />
      <circle cx="10" cy="10" r=".5" fill="currentColor" />
      <circle cx="14" cy="10" r=".5" fill="currentColor" />
    </svg>
  );
}

export function IconPickaxe(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M14 4 4 14l3 3 10-10" />
      <path d="m14 4 7 3-3-7" />
      <path d="M9 19l3 3" />
    </svg>
  );
}

export function IconGift(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v9h14v-9" />
      <path d="M7.5 8a2.5 2.5 0 1 1 0-5C9 3 12 8 12 8s3-5 4.5-5a2.5 2.5 0 1 1 0 5" />
    </svg>
  );
}

export function IconSparkles(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="m12 3 1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z" />
      <path d="M19 17v4M17 19h4M5 4v3M3.5 5.5h3" />
    </svg>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconTrendingUp(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

export function IconWarning(p: IconProps) {
  return (
    <svg {...baseProps} {...p}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v5M12 18v.01" />
    </svg>
  );
}
