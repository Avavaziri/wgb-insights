// The constraint gauge: the one drawn figure that is not a Plotly chart,
// and the Dashboards tab's lead panel.
//
// WHY THIS EXISTS. Press hours are the capacity-constrained resource, so
// the quantity a board should recognise on sight is not revenue or margin
// percentage, it is how the factory's press hours divide. The band is all
// litho constraint-hours. It splits at the crossover job size, and the
// ink segment past that split is the finding: the hours running below the
// factory's own average rate.
//
// The segment wears exactly what every chart bar wears: charcoal fill,
// the uniform yellow brand outline. Fills carry the data, yellow carries
// the brand — the same contract the Plotly figures are pytest-tested
// against, applied by hand here because this is the one drawn figure the
// test cannot see. (A yellow FILL was tried and reviewed out: it made the
// headline quantity the one data area on the site encoded in the colour
// the system reserves for chrome.) It is ruled like a gauge, ticked every
// ten percent, because a bare two-tone bar reads as a progress meter and
// invites the eye to treat 65% as "nearly finished" rather than as a
// proportion of capacity.
//
// NO ARITHMETIC HAPPENS HERE. The share arrives as a proportion and becomes
// a CSS width; the segment on the left takes the remainder through flex
// rather than through a subtraction, and no complement is printed, because
// a number worked out in TypeScript is a defect (CLAUDE.md). Every figure
// on screen is one the API computed.
//
// It does not animate in. It used to; see the note in globals.css for why
// a stalled animation clock made that a bar of zero width and why the
// static version is the one that ships.

import { gbp, pct } from "@/lib/format";
import { TileFooter } from "@/components/ui";

export default function ConstraintGauge({
  share,
  crossoverHrs,
  benchmark,
  rateAbove,
  shareRange,
  lithoNote,
}: {
  /** Proportion of constraint-hours in jobs above the crossover, 0 to 1. */
  share: number;
  crossoverHrs: number;
  /** The factory's own hour-weighted mean rate, GBP per press-hour. */
  benchmark: number;
  /** Pooled rate earned by the hours above the crossover, GBP per hour. */
  rateAbove: number;
  /** Share evaluated at the crossover CI bounds (low, high), from the API. */
  shareRange?: [number, number];
  lithoNote: string;
}) {
  // The curve does not always cross the benchmark. When it does not, the
  // share is NaN by design rather than a convenient zero, so the gauge says
  // so instead of drawing a band of unknown width.
  if (!Number.isFinite(share) || !Number.isFinite(crossoverHrs)) {
    return (
      <div className="border border-line bg-white px-4 py-3">
        <p className="eyebrow">Constraint-hours</p>
        <p className="measure mt-1.5 text-[13.5px] leading-relaxed">
          The rate curve does not cross the benchmark in this extract, so
          there is no crossover size to split capacity at. {lithoNote}
        </p>
      </div>
    );
  }

  const width = pct(share, 0);
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <figure className="m-0 border border-line bg-white">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-semibold">
          {width} of press hours sit in jobs that earn below the factory
          average
        </span>
        <span className="num text-[11.5px] text-muted">
          litho press hours, smallest jobs to largest · crossover at{" "}
          {crossoverHrs.toFixed(1)} h
          {/* the headline share carries the crossover's own uncertainty:
              the API evaluates it at both CI bounds, nothing derived here */}
          {shareRange &&
            Number.isFinite(shareRange[0]) &&
            ` · ${pct(shareRange[0], 0)}–${pct(shareRange[1], 0)} across its likely range`}
        </span>
      </figcaption>

      <div className="px-4 pb-4 pt-5">
        <div className="flex h-8 border border-ink">
          {/* Hours in jobs under the crossover. Takes the remainder of the
              width, so the split point is the crossover by construction. */}
          <div className="flex-1 bg-hover" />
          {/* Hours in jobs over it: the finding — ink fill, yellow brand
              outline, exactly like the capacity_share bars. */}
          <div
            className="border-[1.5px] border-yellow bg-ink"
            style={{ width }}
          />
        </div>

        {/* The gauge rule. Ticks every tenth of total constraint-hours, so
            the band reads as a proportion of capacity and not as progress
            towards something. */}
        <div className="relative h-4" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className={`absolute top-0 w-px bg-line ${
                t === 0 || t === 50 || t === 100 ? "h-2.5" : "h-1.5"
              }`}
              style={{ left: `${t}%` }}
            />
          ))}
          <span className="eyebrow absolute left-0 top-3 text-[9px]">0%</span>
          <span className="eyebrow absolute right-0 top-3 text-[9px]">
            100% of press hours
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="eyebrow">The factory&rsquo;s own average rate</p>
            <p className="num mt-1.5 text-[19px] font-semibold">
              {gbp(benchmark)}/hr
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Hour-weighted mean. Every job is judged against this line, not
              against a target.
            </p>
          </div>
          <div className="text-right">
            <p className="eyebrow">{width} of press hours run at</p>
            <p className="figure-lead mt-1.5 text-[40px]">{gbp(rateAbove)}</p>
            <p className="mt-1.5 text-[12px] text-muted">
              per press-hour, in jobs over {crossoverHrs.toFixed(1)} h
            </p>
          </div>
        </div>
      </div>

      <TileFooter
        changes={`This is the margin question in one figure: most of the scarce resource is sold below the factory's own average rate, so large quotes earn a review against that rate. ${lithoNote}`}
      />
    </figure>
  );
}
