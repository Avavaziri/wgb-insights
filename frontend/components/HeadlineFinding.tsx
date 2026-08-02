// The Overview's opening statement.
//
// WHY IT EXISTS. The page used to open with a file-upload row, a header,
// then six equal KPI tiles. Everything carried the same visual weight, so
// a board member's eye had nowhere to land. This is the thesis: one
// proportion, stated as a sentence a non-technical director reads in
// about three seconds, with the figures that make it mean something.
//
// WHY NO COLOUR FIELD. The first version of this was a full-bleed yellow
// panel with the figure at 136px, reasoning from the brand deck, which
// spends its yellow on exactly that. It was rejected, correctly: the deck
// is a loud print-proud artefact and this is a quiet analytical tool for
// someone whose own taste is minimalist. A colour block that size is
// addition, and the brief here is subtraction.
//
// So the hierarchy is carried by TYPE ALONE. Inter is the only family
// (Fraunces was tried and rejected twice), which leaves scale and weight
// as the whole instrument: one figure near 100px against 13px body, on
// white, in one column, with nothing boxing it in. No panel border, no
// fill, no accent bar. The only yellow is the 1.5px outline on the band's
// ink segment, which is the same fills-carry-data / yellow-carries-brand
// contract the Plotly figures are pytest-tested against and the
// constraint gauge applies by hand.
//
// The band is the argument, not decoration: it is the same split the
// gauge draws on Dashboards, in a coarser register (no ticks, no CI
// range) because this is the glance version and that is the measured one.
//
// NO ARITHMETIC HERE. The share arrives from the API as a proportion and
// becomes a CSS width; the remainder is taken by flex rather than by a
// subtraction, and no complement is printed. A number computed in
// TypeScript is a defect (§4).

import { gbp, pct } from "@/lib/format";

export default function HeadlineFinding({
  share,
  crossoverHrs,
  shareRange,
  benchmark,
  rateAbove,
  lithoNote,
}: {
  /** Proportion of constraint-hours in jobs above the crossover, 0 to 1. */
  share: number;
  /** Only used to anchor the band's two ends. The crossover's own CI is
      reported on the Act 1 card, where the threshold is the headline. */
  crossoverHrs: number;
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

  if (!measured) {
    return (
      <section className="border-b border-line pb-8">
        <p className="eyebrow">The margin question</p>
        <h1 className="measure mt-3 text-lede font-semibold leading-[1.15]">
          The rate curve does not cross the factory average in this extract,
          so there is no crossover size to split capacity at.
        </h1>
        <p className="measure mt-4 text-caption leading-relaxed text-muted">
          {lithoNote}
        </p>
      </section>
    );
  }

  return (
    <section
      className="border-b border-line pb-9"
      aria-labelledby="headline-finding"
    >
      <p className="eyebrow">The margin question</p>

      <div className="mt-3 grid items-baseline gap-x-8 gap-y-2 lg:grid-cols-[auto_1fr]">
        <p className="text-display font-extrabold leading-[0.8] tracking-[-0.045em]">
          {pct(share, 0)}
        </p>
        <h1
          id="headline-finding"
          className="max-w-[26ch] text-lede font-medium leading-[1.15] tracking-[-0.01em]"
        >
          of press time is sold below what the factory itself averages
        </h1>
      </div>

      {/* All litho constraint-hours, split at the crossover job size. Ink
          is the share running below the factory's own rate, wearing the
          uniform yellow brand outline. The anchors matter: without them
          this is a two-tone bar with no stated meaning. */}
      <div className="mt-9 flex h-7 border border-ink" aria-hidden>
        <div className="flex-1 bg-surface" />
        <div
          className="border-[1.5px] border-yellow bg-ink"
          style={{ width: pct(share, 0) }}
        />
      </div>
      {/* Short labels and a gap: at 375px the fuller wording ran the two
          anchors together into one unreadable line. */}
      <div
        className="mt-1.5 flex justify-between gap-x-4 text-micro font-bold uppercase tracking-[0.05em] text-muted"
        aria-hidden
      >
        <span>Under {crossoverHrs.toFixed(1)} h</span>
        <span className="text-right">
          Over {crossoverHrs.toFixed(1)} h, at the lower rate
        </span>
      </div>

      {/* Only what qualifies the headline: the two rates the share is a gap
          BETWEEN, and how far the share moves when the crossover is taken
          at its CI bounds. The crossover and its own interval used to sit
          here and were cut as doubles of the Act 1 card below. */}
      <dl className="mt-7 flex flex-wrap gap-x-14 gap-y-4">
        <div>
          <dt className="eyebrow">Those hours earn</dt>
          <dd className="num mt-1 text-heading font-bold tracking-[-0.02em]">
            {gbp(rateAbove)}/hr
          </dd>
        </div>
        <div>
          <dt className="eyebrow">The factory averages</dt>
          <dd className="num mt-1 text-heading font-bold tracking-[-0.02em]">
            {gbp(benchmark)}/hr
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Share across the likely crossover range</dt>
          <dd className="num mt-1 text-heading font-bold tracking-[-0.02em]">
            {pct(shareRange[0], 0)}&ndash;{pct(shareRange[1], 0)}
          </dd>
        </div>
      </dl>

      <p className="measure mt-7 text-caption leading-relaxed text-muted">
        {lithoNote}
      </p>
    </section>
  );
}
