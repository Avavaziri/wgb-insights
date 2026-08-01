// The heron mark, carried over from the Tender Assistant, where it sits in
// the bottom-right dead space and does more for the app looking finished
// than anything else on the page.
//
// Rendered only when the artwork is actually present, so a missing file is a
// quietly absent illustration rather than a broken image on a page being
// shown to a board. Drop the drawing at:
//
//     frontend/public/brand/heron.svg
//
// Single path or single-colour group, no hardcoded fill, roughly a 200x260
// viewBox. With `fill: currentColor` the same file works as a faint
// watermark and at full ink, which is why the colour is set here rather
// than in the file.

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
      <img src={`/${FILE}`} alt="" className="h-[132px] w-auto opacity-[0.14]" />
    </div>
  );
}
