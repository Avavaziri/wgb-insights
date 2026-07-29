// Visibility for §1 exclusions: the API marks them structurally
// (caution / inconclusive / not_headline); these render the markers so
// an excluded number can never appear naked on screen.

export function CautionBanner({ text }: { text: string }) {
  return (
    <div className="border-2 border-black bg-[#FFE600] p-4 font-medium">
      <span className="mr-2 font-black uppercase tracking-wide">Caution</span>
      {text}
    </div>
  );
}

export function NotHeadlineBanner({ text }: { text: string }) {
  return (
    <div className="border-2 border-black bg-neutral-100 p-4">
      <span className="mr-2 bg-black px-2 py-0.5 font-black uppercase tracking-wide text-[#FFE600]">
        Not a headline
      </span>
      {text}
    </div>
  );
}

export function InSampleOnlyBadge() {
  return (
    <span className="ml-2 bg-[#FFE600] px-1.5 py-0.5 text-xs font-black uppercase">
      in-sample only
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
    <details className="border border-neutral-300">
      <summary className="cursor-pointer bg-neutral-100 p-3 font-bold">
        {title} <span className="font-normal text-neutral-500">(inconclusive — expand)</span>
      </summary>
      <div className="space-y-3 p-4">
        <p className="text-sm text-neutral-700">{note}</p>
        {children}
      </div>
    </details>
  );
}

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-2 border-black p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      {detail && <div className="mt-1 text-sm text-neutral-600">{detail}</div>}
    </div>
  );
}
