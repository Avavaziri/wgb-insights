import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import { InSampleOnlyBadge } from "@/components/banners";
import {
  PageHeader,
  Readout,
  Section,
  Table,
  TableFrame,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { dp, num, pval } from "@/lib/format";
import { ApiDownError, getChart, getJson } from "@/lib/api";
import type { Decomposition } from "@/lib/types";

/** The palette is three colours, so direction is carried by weight and
    the sign, never by red/green. A rounded zero gets no emphasis at all. */
const cvTone = (x: number): string =>
  Number(x.toFixed(3)) === 0 ? "text-muted" : "font-semibold";

export default async function MarginPage() {
  let data: Decomposition;
  let repFig: unknown;
  try {
    [data, repFig] = await Promise.all([
      getJson<Decomposition>("/decomposition"),
      getChart("rep_confounding"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const rp = data.rep_pair;

  return (
    <>
      <PageHeader
        eyebrow="Where margin lives"
        title="Who actually moves contribution per constraint-hour?"
        lede={
          <>
            A nested decomposition of <code>{data.target}</code>. Each block
            enters cumulatively, and the question is not who is significant but
            who moves <em>out-of-sample</em> R². In-sample gain without
            predictive gain is flagged, not celebrated.
          </>
        }
      />

      <Section
        kicker="Nested decomposition"
        title="Blocks in order, judged on cross-validated fit"
        note={data.order_note}
      >
        <TableFrame caption="CV increment is the change in out-of-sample R² when the block is added. The in-sample-only marker records a block that clears the nested F-test decisively while moving out-of-sample R² by less than the increment set in config — statistically present, predictively negligible. Thresholds live in config.yaml, so they are described here rather than restated.">
          <Table>
            <thead>
              <tr>
                <Th>Block (cumulative)</Th>
                <Th align="right">R²</Th>
                <Th align="right">adj R²</Th>
                <Th align="right">CV R²</Th>
                <Th align="right">CV increment</Th>
                <Th align="right">params</Th>
                <Th align="right">nested F p</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Tr key={r.block} highlight={r.block === "customer"}>
                  <Td className="font-medium">
                    <span className="text-ink-4">+ </span>
                    {r.block}
                    {r.in_sample_only && <InSampleOnlyBadge />}
                  </Td>
                  <Td align="right" num muted>
                    {dp(r.r2)}
                  </Td>
                  <Td align="right" num muted>
                    {dp(r.r2_adj)}
                  </Td>
                  <Td align="right" num className="font-semibold">
                    {dp(r.r2_cv)}
                  </Td>
                  {/* Colour keys off the rounded value that is actually
                      displayed, so a +0.000 is never shown in "gain" green. */}
                  <Td align="right" num className={cvTone(r.cv_increment)}>
                    {r.cv_increment >= 0 ? "+" : ""}
                    {r.cv_increment.toFixed(3)}
                  </Td>
                  <Td align="right" num muted>
                    {r.n_params}
                  </Td>
                  <Td align="right" num muted>
                    {r.f_p_vs_prev === null ? "—" : pval(r.f_p_vs_prev)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      </Section>

      <Section
        kicker="Negative result"
        title="The rep dashboard this data refuses to build"
        note="A naive rep-only model looks like a performance story. Once size, run features, product, customer and year are in first, the rep block adds nothing — the apparent effect was which accounts each rep carries."
      >
        <PlotlyChart figure={repFig} />
        <Readout
          items={[
            { label: "Naive model", value: `CV R² ${dp(rp.naive.r2_cv)}` },
            { label: "Naive formula", value: rp.naive.formula, tone: "mono" },
            { label: "Jobs", value: num(rp.naive.n_obs) },
            {
              label: "Controlled nested F p",
              value: pval(rp.controlled_f_p),
            },
            {
              label: "Controlled CV gain",
              value: `${rp.controlled_cv_increment >= 0 ? "+" : ""}${rp.controlled_cv_increment.toFixed(3)}`,
            },
            {
              label: "adj R² gain",
              value: `${rp.controlled_adj_increment >= 0 ? "+" : ""}${rp.controlled_adj_increment.toFixed(3)}`,
            },
          ]}
        />
        <p className="measure text-[15px] font-medium leading-relaxed">
          {rp.conclusion}
        </p>
      </Section>
    </>
  );
}
