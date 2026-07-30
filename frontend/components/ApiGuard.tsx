// Shared error boundary for pages: shows a start-the-API hint instead of
// a stack trace when the backend isn't running. The UI holds no fallback
// numbers on purpose — if Python is down there is nothing to render.

export function ApiDown({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl border border-rule bg-surface p-8 text-center">
      <p className="text-[1.3rem] font-semibold">API not reachable</p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{message}</p>
      <p className="mt-4 text-[13px] text-ink-3">
        Python owns every number here, so nothing renders without it:
      </p>
      <pre className="mx-auto mt-3 w-fit bg-ink px-4 py-3 text-left font-mono text-[13px] leading-relaxed text-white">
        conda activate wgb-insights{"\n"}make api
      </pre>
    </div>
  );
}
