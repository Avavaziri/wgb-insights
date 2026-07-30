// The discovery tab. Everything about how the system works lives here —
// standards, ingest checks, the hypothesis register, the data gaps, the API —
// so the pages a manager reads carry conclusions and nothing else.

import { ApiDown } from "@/components/ApiGuard";
import {
  Chip,
  DefList,
  PageHeader,
  Panel,
  PanelHead,
  Section,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { expo, num } from "@/lib/format";
import { API_BASE, ApiDownError, getJson } from "@/lib/api";
import type { Overview } from "@/lib/types";

const STANDARDS = [
  {
    head: "One multiplicity correction",
    body: "A Benjamini-Hochberg pass over a test family fixed before the tests ran, applied once. Anything that fails loses headline status automatically and is dropped from the exported slides — no one decides case by case.",
  },
  {
    head: "Cluster-robust standard errors",
    body: "Every job-level model clusters on customer. Jobs from one account are not independent observations, and treating them as though they were overstates confidence.",
  },
  {
    head: "Grouped cross-validation",
    body: "The override model groups folds by customer. Splitting at random would put an account in both training and test data and let the model learn that account's pricing habits, then score itself on them.",
  },
  {
    head: "Thresholds as ranges",
    body: "No threshold is reported as a single number. Each carries a sensitivity range and a bootstrap interval, because one figure to a decimal place would imply precision the data does not support.",
  },
  {
    head: "Dated from the file, not the clock",
    body: "The as-of date is the latest sale in the extract. The same file gives the same answers on any day, which is what makes the figures quotable a month from now.",
  },
  {
    head: "Negative results are kept",
    body: "Hypotheses that failed stay in the register with the reason. A finding that quietly disappears is one nobody can audit.",
  },
];

export default async function MethodPage() {
  let data: Overview;
  try {
    data = await getJson<Overview>("/overview");
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }
  const v = data.validation;
  const c = data.clean_report;

  return (
    <>
      <PageHeader
        eyebrow="Method & data"
        title="How these figures are produced"
        lede="Written for anyone who wants to interrogate the analysis rather than read its conclusions: the standards it holds to, the checks it runs on the file, the gaps that limit what can be claimed, and every hypothesis tested including the ones that failed."
      />

      <Section
        kicker="Standards"
        title="Six rules the analysis is held to"
        note="These are enforced in code, not by convention: results travel as fixed records with every field required, so a figure cannot reach the screen without its confidence interval, p-value, sample size and standard-error type attached."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STANDARDS.map((m) => (
            <div key={m.head} className="border border-line bg-white p-4">
              <p className="text-[14.5px] font-semibold leading-snug">
                {m.head}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        kicker="Provenance"
        title="What the file says, and what it doesn't"
        note="Two arithmetic identities in the source are used as consistency proofs when the file is read. If the second ever fails on a new upload, the pricing analysis refuses to report rather than guess what a column means."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <DefList
            title="Checks on the current file"
            rows={[
              {
                label: (
                  <>
                    Identity <code>VA/24 = VA ÷ hrs × 24</code> — largest error
                  </>
                ),
                value: expo(Number(v.identity1_max_err)),
              },
              {
                label: (
                  <>
                    Identity <code>mupnett = labmup + manadj</code> — largest
                    error across {num(Number(v.n_identity2_checked))} complete
                    rows
                  </>
                ),
                value: v.identity2_ok
                  ? expo(Number(v.identity2_max_err))
                  : "Failed — pricing withheld",
              },
              {
                label: (
                  <>
                    <code>#DIV/0!</code> cells in the margin column — real Excel
                    error cells, counted before the spreadsheet reader turns them
                    into blanks
                  </>
                ),
                value: num(Number(v.va_pct_error_cells)),
              },
              {
                label: (
                  <>
                    Blank <code>manadj</code> — held out of the override analysis
                  </>
                ),
                value: num(Number(v.n_null_manadj)),
              },
              {
                label: (
                  <>
                    Blank <code>Binding Type</code> — read as outsourced binding:
                    data, not absence
                  </>
                ),
                value: num(Number(v.n_null_binding)),
              },
              {
                label: (
                  <>
                    Jobs with no press hours — why the capacity analysis covers
                    Litho only
                  </>
                ),
                value: num(Number(v.n_press_hrs_zero)),
              },
              {
                label: (
                  <>
                    Credits (<code>Sell Price</code> ≤ 0) — separated and
                    counted, never dropped silently
                  </>
                ),
                value: num(Number(c.n_quarantined_credits)),
              },
            ]}
          />
          <Panel>
            <PanelHead meta="the investment ask">
              What the data cannot answer
            </PanelHead>
            <ul className="m-0 divide-y divide-line">
              {data.gaps.map((g) => (
                <li key={g.gap} className="px-4 py-2.5">
                  <p className="text-[13.5px] font-semibold leading-snug">
                    {g.gap}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-muted">
                    Blocks: {g.blocks}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Section>

      <Section
        kicker="Audit trail"
        title={`Every hypothesis tested — ${data.hypothesis_register.length} of them`}
        note="Recorded before the results were known, so the list cannot be trimmed to fit the story afterwards."
      >
        <Panel>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Hypothesis</Th>
                  <Th>Outcome</Th>
                  <Th>Status</Th>
                  <Th>Evidence</Th>
                </tr>
              </thead>
              <tbody>
                {data.hypothesis_register.map((e) => (
                  <Tr key={e.id}>
                    <Td className="font-semibold">{e.hypothesis}</Td>
                    <Td muted>{e.outcome}</Td>
                    <Td>
                      <Chip tone={e.status === "headline" ? "done" : "now"}>
                        {e.status.replace("_", " ")}
                      </Chip>
                    </Td>
                    <Td muted className="text-[12.5px]">
                      {e.evidence}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>
      </Section>

      <Section
        kicker="Reproducing it"
        title="Reproducing and interrogating the numbers"
        note={`Every figure on this site is computed once from the file and served as structured data — the pages only render it, so a number cannot drift between the analysis and the screen. Seeds are fixed (${Object.entries(
          data.seeds,
        )
          .map(([k, s]) => `${k} ${s}`)
          .join(", ")}), so a rerun reproduces exactly.`}
      >
        <p className="text-[13px] text-muted">
          Machine-readable results and full field definitions:{" "}
          <a href={`${API_BASE}/docs`}>{API_BASE}/docs</a>
        </p>
      </Section>
    </>
  );
}
