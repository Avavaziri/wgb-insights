// Nav glyphs: a placeholder set so the app reads as software today.
//
// Spec, so a hand-drawn replacement drops straight in: 20x20 viewBox, 1.5px
// stroke, `stroke="currentColor"`, `fill="none"`, aligned to the 20px grid.
// Consistent stroke weight across the set matters more than the drawing; a
// mismatched set looks worse than none. Replace the paths below and nothing
// else needs to change.

type IconProps = { className?: string };

const S = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Overview: the summary grid. */
export function IconGrid({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <rect x="2.5" y="2.5" width="6" height="6" />
      <rect x="11.5" y="2.5" width="6" height="6" />
      <rect x="2.5" y="11.5" width="6" height="6" />
      <rect x="11.5" y="11.5" width="6" height="6" />
    </svg>
  );
}

/** Dashboards: bars of decreasing length. */
export function IconLayers({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <path d="M3 13.5h14M3 9.5h10M3 5.5h6" />
      <path d="M3 17.5h14" opacity="0.4" />
    </svg>
  );
}

/** Customers & actions: a price tag. */
export function IconTag({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <path d="M10.5 2.5H17v6.5l-8 8-6.5-6.5 8-8Z" />
      <circle cx="13.75" cy="6.25" r="1.15" />
    </svg>
  );
}

