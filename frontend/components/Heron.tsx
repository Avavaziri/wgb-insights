// The heron mark, carried over from the Tender Assistant.
//
// Rendered only when the artwork is actually present, so a missing file is a
// quietly absent illustration rather than a broken image on a page being
// shown to a board. Drop the drawing at:
//
//     frontend/public/brand/heron.svg
//
// Single path or single-colour group, no hardcoded fill — with `fill:
// currentColor` the same file works as a faint watermark and as a full-ink
// empty state, which is why the colour is set here rather than in the file.

import fs from "node:fs";
import path from "node:path";

const FILE = "brand/heron.svg";

function heronExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", FILE));
  } catch {
    return false;
  }
}

/** Faint mark in the page's bottom-right dead space. Decorative only. */
export function HeronWatermark() {
  if (!heronExists()) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-0 right-4 z-0 hidden lg:block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/${FILE}`} alt="" className="h-[132px] w-auto opacity-[0.16]" />
    </div>
  );
}

/**
 * Empty state: the illustration plus a line saying what would fill the space.
 * Every list in the app says what it means when it is empty and what would
 * change that — "no data" is never the message.
 */
export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-6 border border-line bg-white p-6">
      {heronExists() && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/${FILE}`}
          alt=""
          aria-hidden
          className="h-[96px] w-auto opacity-40"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="measure mt-1 text-[13.5px] leading-relaxed text-muted">
          {detail}
        </p>
      </div>
    </div>
  );
}
