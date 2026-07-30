// Visibility for the adjudicated exclusions: the API marks them structurally
// (caution / inconclusive / not_headline); these render the markers so an
// excluded number can never appear naked on screen.
//
// House rule: there is no red. A qualifier is ink on yellow, a "read this
// before you quote the figure", not an emergency.

import { Chip, Callout, Disclosure } from "@/components/ui";

export function CautionBanner({ text }: { text: string }) {
  return <Callout label="Caution">{text}</Callout>;
}

export function NotHeadlineBanner({ text }: { text: string }) {
  return <Callout label="Not a headline">{text}</Callout>;
}

export function InSampleOnlyBadge() {
  return (
    <span className="ml-2 align-middle">
      <Chip tone="now">in-sample only</Chip>
    </span>
  );
}

export function Inconclusive({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <Disclosure title={title} hint="inconclusive, expand">
      <p className="measure text-[14px] leading-relaxed">{note}</p>
      {children}
    </Disclosure>
  );
}
