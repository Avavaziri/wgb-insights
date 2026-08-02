// The Overview's opening statement, and the only full-bleed yellow on the
// site.
//
// WHY IT EXISTS. The page used to open with a file-upload row, a header,
// then six equal KPI tiles. Everything carried the same visual weight, so
// a board member's eye had nowhere to land and the page read as a
// broadsheet: uniform grey texture, no thesis. This panel is the thesis.
// One proportion, stated as a sentence a non-technical director reads in
// about three seconds, with the two rates that make it mean something.
//
// WHY YELLOW, HERE, AND NOWHERE ELSE. The house system is yellow/ink/
// white and the brand deck spends its yellow on full-bleed panels; the
// app had been rationing it to a 1.5px outline and a hover state, which
// is what made a print brand look like a spreadsheet. The whole ration is
// spent in one place. A second yellow field on the page would cancel this
// one, so there isn't one.
//
// The band is the argument, not decoration: it is the same split the
// constraint gauge draws on Dashboards, in a coarser register (no ticks,
// no CI range) because this is the glance version and that is the
// measured one. Ink on #FFE600 is 7.6:1, so the type clears AA on the
// yellow ground.
//
// NO ARITHMETIC HERE. The share arrives from the API as a proportion and
// becomes a CSS width; the remainder is taken by flex rather than by a
// subtraction, and no complement is printed. A number computed in
// TypeScript is a defect (CLAUDE.md).

import { gbp, pct } from "@/lib/format";

export default function HeadlineFinding({
  share,
  crossoverHrs,
  crossoverCi95,
  shareRange,
  benchmark,
  rateAbove,
  lithoNote,
}: {
  /** Proportion of constraint-hours in jobs above the crossover, 0 to 1. */
  share: number;
  crossoverHrs: number;
  /** Bootstrap 95% CI on the crossover, from the API. A threshold is never
      shown as a bare point (CLAUDE.md), so this rides with the figure. */
  crossoverCi95: [number, number];
  /** Share evaluated at both crossover CI bounds, from the API. */
  shareRange: [number, number];
  /** The factory's own hour-weighted mean rate, GBP per press-hour. */
  benchmark: number;
  /** Pooled rate earned by the hours above the crossover, GBP per hour. */
  rateAbove: number;
  lithoNote: string;
}) {
  // The rate curve does not always cross the benchmark. When it does not
  // there is no split to draw, so the panel states that rather than
  // inventing a band of unknown width.
  const measured = Number.isFinite(share) && Number.isFinite(crossoverHrs);

  return (
    <section className="bg-yellow text-ink" aria-labelledby="headline-finding">
      <div className="px-6 py-8 sm:px-10 sm:py-12">
        <p className="eyebrow">The margin question</p>

        {measured ? (
          <>
            <div className="mt-4 grid items-end gap-x-10 gap-y-5 lg:grid-cols-[auto_1fr]">
              <p className="text-display font-extrabold leading-[0.82] tracking-[-0.04em]">
                {pct(share, 0)}
              </p>
              <h1
                id="headline-finding"
                className="max-w-[22ch] text-lede font-semibold leading-[1.15] lg:pb-3"
              >
                of press time is sold below what the factory itself averages
              </h1>
            </div>

            {/* All litho constraint-hours, split at the crossover job size.
                Ink is the share running below the factory's own rate. */}
            <div className="mt-8 flex h-9 border-[1.5px] border-ink" aria-hidden>
              <div className="flex-1 bg-white" />
              <div className="bg-ink" style={{ width: pct(share, 0) }} />
            </div>

            {/* The three numbers that make the headline mean something.
                Both derived quantities carry their bootstrap range here,
                because the KPI strip that used to hold them was cut as
                redundant and a bare threshold is a defect (CLAUDE.md). */}
            <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3 text-body">
              <div>
                <dt className="font-semibold">Those hours earn</dt>
                <dd className="num text-emphasis font-bold">
                  {gbp(rateAbove)}/hr
                </dd>
              </div>
              <div>
                <dt className="font-semibold">The factory averages</dt>
                <dd className="num text-emphasis font-bold">
                  {gbp(benchmark)}/hr
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Crossover job size</dt>
                <dd className="num text-emphasis font-bold">
                  {crossoverHrs.toFixed(1)} h{" "}
                  <span className="text-caption font-medium">
                    likely {crossoverCi95[0].toFixed(1)}&ndash;
                    {crossoverCi95[1].toFixed(1)} h
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Across that range the share is</dt>
                <dd className="num text-emphasis font-bold">
                  {pct(shareRange[0], 0)}&ndash;{pct(shareRange[1], 0)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <h1
            id="headline-finding"
            className="mt-4 max-w-[34ch] text-lede font-semibold leading-[1.15]"
          >
            The rate curve does not cross the factory average in this extract,
            so there is no crossover size to split capacity at.
          </h1>
        )}

        <p className="measure mt-6 text-caption leading-relaxed">{lithoNote}</p>
      </div>
    </section>
  );
}
