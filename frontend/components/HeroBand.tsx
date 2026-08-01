// A press-floor photograph as a thin band above the overview's title, and
// nothing else. Renders only when the artwork is actually present, so a
// missing file is a quietly absent band rather than a broken image on a page
// being shown to a board.
//
// Drop the photograph at:
//
//     frontend/public/brand/press-floor.jpg
//
// 2400x600 landscape, ~85% quality. Machinery, paper or ink detail rather
// than faces: the repo is public and faces would need consent.
//
// Deliberately a band and not a hero. The brand's caption-box motif (a
// yellow block with black type overlapping the image) is the obvious thing
// to do here and it is the wrong thing to do on this page: a yellow block
// that size would outweigh the constraint gauge below it, and the gauge is
// the only mark on the page that is carrying a number. The photograph gets
// to be atmosphere; the finding keeps the accent.

import fs from "node:fs";
import path from "node:path";

const FILE = "brand/press-floor.jpg";

function photoExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", FILE));
  } catch {
    return false;
  }
}

export default function HeroBand() {
  if (!photoExists()) return null;

  return (
    <div
      className="h-[104px] w-full border border-line bg-ink bg-cover bg-center sm:h-[132px]"
      style={{ backgroundImage: `url(/${FILE})` }}
      role="img"
      aria-label="W&G Baird press floor"
    />
  );
}
