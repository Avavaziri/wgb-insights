// Overview header. With a press-floor photograph present it becomes the
// brand's caption-box motif — a yellow block with black type overlapping the
// image, flush to a corner. Without one it falls back to the plain page head,
// so the page is never waiting on an asset.
//
// Drop the photograph at:
//
//     frontend/public/brand/press-floor.jpg
//
// 2400x800 landscape, ~85% quality. Machinery, paper or ink detail rather
// than faces — the repo is public and faces would need consent. Used in this
// one place only: a photograph behind live figures is decoration, but a
// photograph behind the page title is the brand.

import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { Eyebrow, PageHeader } from "@/components/ui";

const FILE = "brand/press-floor.jpg";

function photoExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", FILE));
  } catch {
    return false;
  }
}

export default function HeroBand({
  eyebrow,
  title,
  lede,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
}) {
  if (!photoExists()) {
    return <PageHeader eyebrow={eyebrow} title={title} lede={lede} meta={meta} />;
  }

  return (
    <header className="space-y-4">
      <div className="relative">
        <div
          className="h-[168px] w-full bg-ink bg-cover bg-center sm:h-[196px]"
          style={{ backgroundImage: `url(/${FILE})` }}
          role="img"
          aria-label="W&G Baird press floor"
        />
        {/* Caption box: overlaps the image, flush left, black on yellow. */}
        <div className="relative -mt-px sm:absolute sm:bottom-0 sm:left-0 sm:max-w-[46rem]">
          <div className="bg-yellow px-5 py-4">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-1 text-[24px] text-ink sm:text-[28px]">{title}</h1>
          </div>
        </div>
      </div>
      {lede && (
        <p className="measure text-[15px] leading-relaxed">{lede}</p>
      )}
      {meta && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-[12px] text-muted">
          {meta}
        </div>
      )}
    </header>
  );
}
