// Shared error boundary for pages: shows a start-the-API hint instead of a
// stack trace when the backend isn't running. The UI holds no fallback
// numbers on purpose: if Python is down there is nothing to render, and a
// page that invented something to show would be worse than an empty one.

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl border border-line border-l-[6px] border-l-yellow bg-white p-8">
      <p className="eyebrow">Nothing to show</p>
      <p className="mt-2 text-[19px] font-semibold">
        The analysis API is not answering
      </p>
      <p className="measure mt-2 text-[14px] leading-relaxed text-muted">
        {message}
      </p>
      <p className="mt-4 text-[13px] leading-relaxed">
        Every number on this site is computed in Python and fetched, so there is
        nothing cached here to fall back to. Start it and reload:
      </p>
      <pre className="mt-3 w-fit bg-ink px-4 py-3 font-mono text-[13px] leading-relaxed text-white">
        conda activate wgb-insights{"\n"}make api
      </pre>
    </div>
  );
}
