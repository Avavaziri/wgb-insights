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

/** Where margin lives: contribution stacked by source. */
export function IconLayers({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <path d="M3 13.5h14M3 9.5h10M3 5.5h6" />
      <path d="M3 17.5h14" opacity="0.4" />
    </svg>
  );
}

/** Pricing & overrides: a price tag. */
export function IconTag({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <path d="M10.5 2.5H17v6.5l-8 8-6.5-6.5 8-8Z" />
      <circle cx="13.75" cy="6.25" r="1.15" />
    </svg>
  );
}

/** Size & the constraint: a press cylinder. */
export function IconPress({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <ellipse cx="10" cy="5.5" rx="6.5" ry="2.5" />
      <path d="M3.5 5.5v6a6.5 2.5 0 0 0 13 0v-6" />
      <path d="M3.5 11.5v3a6.5 2.5 0 0 0 13 0v-3" opacity="0.4" />
    </svg>
  );
}

/** Retention risk: days since the last order. */
export function IconClock({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4.25l3 1.75" />
    </svg>
  );
}

/** Method & data: the audit trail. */
export function IconChecklist({ className }: IconProps) {
  return (
    <svg {...S} className={className}>
      <path d="M4.5 2.5h11v15h-11z" />
      <path d="M7.25 7.25l1.5 1.5 3-3" />
      <path d="M7.5 12.5h5" />
    </svg>
  );
}
