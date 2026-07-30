import PlotlyChart from "@/components/PlotlyChart";
import { ApiDown } from "@/components/ApiGuard";
import {
  Chip,
  Panel,
  KpiRow,
  PageHeader,
  Section,
  Kpi,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { dash, dp, num } from "@/lib/format";
import { API_BASE, ApiDownError, getChart, getJson } from "@/lib/api";
import type { Churn } from "@/lib/types";

// Yellow means "act on this"; ink means "recorded, no action".
const BAND_TONE: Record<string, "now" | "done" | undefined> = {
  high: "now",
  elevated: "now",
  "watch (irregular)": "done",
};

export default async function RetentionPage() {
  let data: Churn;
  let cmpFig: unknown;
  try {
    [data, cmpFig] = await Promise.all([
      getJson<Churn>("/churn"),
      getChart("churn_comparison"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const nForecastable = data.rows.filter((r) => r.forecastable).length;
  const rows = data.rows
    .slice()
    .sort((a, b) => (b.gap_ratio ?? 0) - (a.gap_ratio ?? 0));

  return (
    <>
      <PageHeader
        eyebrow="Retention risk"
        title="A call list, and a refusal to invent dates."
        lede={data.gate}
      />

      <KpiRow>
        <Kpi
          label="Accounts"
          value={num(data.rows.length)}
          detail={`as of ${data.as_of}, from the data and not the clock`}
        />
        <Kpi
          label="Forecastable"
          value={num(nForecastable)}
          detail="ordering regularly enough for a predicted next order; the rest get no date at all"
        />
        <Kpi
          accent
          label="Personalised at-risk"
          value={num(data.comparison.n_personalised)}
          detail="silent beyond own median interval × (1 + 1.5 × own CV)"
        />
        <Kpi
          label={`Fixed ${data.comparison.fixed_days}-day rule`}
          value={num(data.comparison.n_fixed)}
          detail={
            `a different set: it misses ${data.comparison.only_personalised.length} accounts the personalised rule catches` +
            (data.comparison.only_fixed.length > 0
              ? `, and flags ${data.comparison.only_fixed.length} that are simply slow-cycle`
              : "")
          }
        />
      </KpiRow>

      <PlotlyChart
        figure={cmpFig}
        caption={`The two rules are not interchangeable: ${data.comparison.n_fixed} accounts satisfy both, and the personalised rule adds ${data.comparison.only_personalised.length} that a single company-wide number of days never reaches.`}
      />

      <Section
        kicker="Actionable output"
        title="Ranked call list"
        note="Ordered by how far past its own normal cadence each account is. An account with no reliable cadence is shown, flagged, and given no predicted date. The system does not fill that gap with a guess."
      >
        <a
          href={`${API_BASE}/call-list.csv`}
          download="call_list.csv"
          className="stamp inline-flex items-center gap-2 border border-rule bg-surface px-4 py-2.5 text-[11px] transition-colors hover:bg-yellow"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-ink-3">
            <path
              d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5M2 13h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Download ranked call list (CSV)
        </a>

        <Panel>
          <div className="max-h-[36rem] overflow-auto">
            <Table>
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th className="bg-surface-2">Customer</Th>
                  <Th align="right">Orders</Th>
                  <Th align="right">Median interval</Th>
                  <Th align="right">Interval CV</Th>
                  <Th align="right">Days silent</Th>
                  <Th>Risk</Th>
                  <Th>Reason</Th>
                  <Th>Expected next order</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.customer}>
                    <Td className="font-medium">{r.customer}</Td>
                    <Td align="right" num muted>
                      {r.n_orders}
                    </Td>
                    <Td align="right" num muted>
                      {r.median_interval === null
                        ? dash
                        : `${r.median_interval.toFixed(0)}d`}
                    </Td>
                    <Td align="right" num muted>
                      {dp(r.interval_cv, 2)}
                    </Td>
                    <Td align="right" num className="font-semibold">
                      {r.gap_days.toFixed(0)}
                    </Td>
                    <Td>
                      {BAND_TONE[r.risk_band] ? (
                        <Chip tone={BAND_TONE[r.risk_band]}>{r.risk_band}</Chip>
                      ) : (
                        <span className="text-[13px] text-muted">
                          {r.risk_band}
                        </span>
                      )}
                    </Td>
                    <Td muted className="font-mono text-[12.5px]">
                      {r.reason_code}
                    </Td>
                    <Td num className={r.expected_next_order ? "" : "text-muted"}>
                      {r.expected_next_order ?? "not forecastable, no date invented"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>
      </Section>
    </>
  );
}
