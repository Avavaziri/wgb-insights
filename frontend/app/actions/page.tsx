import { ApiDown } from "@/components/ApiGuard";
import {
  Chip,
  type ChipTone,
  LinkButton,
  MetaSep,
  PageHeader,
  Panel,
  Section,
  Table,
  TableFrame,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { dash, dp, gbp, gbpM, num, pct } from "@/lib/format";
import { API_BASE, ApiDownError, getJson } from "@/lib/api";
import type { CallList, Value } from "@/lib/types";

// The actionable outputs, one tab: who the money comes from, what work
// makes it, and which accounts to ring this week. Everything here is a
// descriptive ranking or a rule-based list; the modelling lives behind the
// Overview's evidence fold.

// Risk band to chip tone. The two bands that are a call to make now carry
// the authorised status colours (globals.css) so the ranking is visible at
// a glance; "watch (irregular)" stays neutral and outlined because it is
// recorded with no action, the account having no reliable cadence to be
// late against. The band WORD is always rendered next to the colour, so
// none of this is encoded in colour alone.
const BAND_TONE: Record<string, ChipTone | undefined> = {
  high: "critical",
  elevated: "warning",
  "watch (irregular)": "outline",
};

export default async function ActionsPage() {
  let value: Value;
  let calls: CallList;
  try {
    [value, calls] = await Promise.all([
      getJson<Value>("/value"),
      getJson<CallList>("/call-list"),
    ]);
  } catch (e) {
    if (e instanceof ApiDownError) return <ApiDown message={e.message} />;
    throw e;
  }

  return (
    <>
      <PageHeader
        eyebrow="Customers & actions"
        title="Who the money comes from, and who to ring this week"
        meta={
          <>
            <span>
              as of <span className="num">{calls.as_of}</span>
            </span>
            <MetaSep />
            <span>closed jobs, whole period</span>
          </>
        }
      />

      <Section
        kicker="Most valuable customers"
        title={`Top ${value.top_customers.length} accounts by contribution`}
        note={value.caveat}
      >
        <TableFrame caption="Contribution is sell price net of purchases (paper, ink, outwork), summed over the whole period, closed jobs only. It does not net internal labour or handling: there is no cost-to-serve data here, so an account whose jobs are harder to run reads no worse than one whose jobs aren't. Share is of this sample's total contribution, so the column does not sum to 100% across ten rows.">
          <Table>
            <thead>
              <tr>
                <Th align="right">#</Th>
                <Th>Customer</Th>
                <Th>Rep</Th>
                <Th>Industry</Th>
                <Th align="right">Jobs</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Contribution</Th>
                <Th align="right">Share</Th>
                <Th align="right">£/press-hr</Th>
              </tr>
            </thead>
            <tbody>
              {value.top_customers.map((r, i) => (
                <Tr key={r.name}>
                  <Td align="right" num muted className="w-10">
                    {i + 1}
                  </Td>
                  <Td className="font-semibold">{r.name}</Td>
                  <Td muted>{r.rep}</Td>
                  <Td muted>{r.industry}</Td>
                  <Td align="right" num muted>
                    {num(r.jobs)}
                  </Td>
                  <Td align="right" num>
                    {gbpM(r.revenue_gbp)}
                  </Td>
                  <Td align="right" num className="font-semibold">
                    {gbpM(r.contribution_gbp)}
                  </Td>
                  <Td align="right" num>
                    {pct(r.share_of_contribution)}
                  </Td>
                  <Td align="right" num muted>
                    {r.contribution_per_press_hr === null
                      ? dash
                      : gbp(r.contribution_per_press_hr)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      </Section>

      <Section
        kicker="Most valuable types of work"
        title="What we print, ranked by what it contributes"
        note="The £/press-hr column is the constraint view. Work that contributes a lot is not automatically work that earns a good hourly rate."
      >
        <TableFrame caption="Small product types roll into 'Other (long tail)' instead of disappearing. Contribution flatters small jobs because there is no cost-to-serve data here, so read this as a map of where the money comes from and not as a strategy on its own.">
          <Table>
            <thead>
              <tr>
                <Th>Type of work</Th>
                <Th align="right">Jobs</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Contribution</Th>
                <Th align="right">Share</Th>
                <Th align="right">£/press-hr</Th>
              </tr>
            </thead>
            <tbody>
              {value.work_types.map((r) => (
                <Tr key={r.name}>
                  <Td className="font-semibold">{r.name}</Td>
                  <Td align="right" num muted>
                    {num(r.jobs)}
                  </Td>
                  <Td align="right" num>
                    {gbpM(r.revenue_gbp)}
                  </Td>
                  <Td align="right" num className="font-semibold">
                    {gbpM(r.contribution_gbp)}
                  </Td>
                  <Td align="right" num>
                    {pct(r.share_of_contribution)}
                  </Td>
                  <Td align="right" num muted>
                    {r.contribution_per_press_hr === null
                      ? dash
                      : gbp(r.contribution_per_press_hr)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      </Section>

      <Section
        kicker="Retention"
        title="Ranked call list"
        note="Risk band first, then account value, so the valuable ones get rung first. For overdue accounts the last column shows the date they were already due. Where there is no cadence to work from, there is no date at all."
      >
        <LinkButton href={`${API_BASE}/call-list.csv`} download="call_list.csv">
          <svg aria-hidden viewBox="0 0 16 16" className="size-4">
            <path
              d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5M2 13h12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Download the full call list (CSV)
        </LinkButton>

        <Panel>
          <div className="max-h-[36rem] overflow-auto">
            <Table>
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th>Customer</Th>
                  <Th>Rep</Th>
                  <Th align="right">Historic contribution</Th>
                  <Th align="right">Days silent</Th>
                  <Th align="right">Own cadence</Th>
                  <Th>Risk</Th>
                  <Th>Expected next order</Th>
                </tr>
              </thead>
              <tbody>
                {calls.rows.map((r) => (
                  <Tr key={r.customer}>
                    <Td className="font-medium">{r.customer}</Td>
                    <Td muted>{r.rep}</Td>
                    <Td align="right" num className="font-semibold">
                      {gbpM(r.historic_contribution_gbp)}
                    </Td>
                    <Td align="right" num>
                      {r.days_since.toFixed(0)}
                    </Td>
                    <Td align="right" num muted>
                      {r.own_median_interval === null
                        ? dash
                        : `every ~${r.own_median_interval.toFixed(0)}d · variability ${dp(r.interval_cv, 2)}`}
                    </Td>
                    <Td>
                      {BAND_TONE[r.risk_band] ? (
                        <Chip tone={BAND_TONE[r.risk_band]}>{r.risk_band}</Chip>
                      ) : (
                        <span className="text-body text-muted">
                          {r.risk_band}
                        </span>
                      )}
                    </Td>
                    {/* For a flagged account the expected date has, by
                        definition, already passed (that is what flagged
                        means), so it is labelled as the date they were
                        due, never as a fresh promise. The band is
                        the API's own category; no date maths happens here. */}
                    <Td num className={r.expected_next_order ? "" : "text-muted"}>
                      {r.expected_next_order === null
                        ? "no cadence, so no date"
                        : r.risk_band === "normal"
                          ? r.expected_next_order
                          : `was due ${r.expected_next_order}`}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>
        <p className="measure text-caption leading-relaxed text-muted">
          &ldquo;Own cadence&rdquo; is the account&rsquo;s median gap between
          order dates. &ldquo;Variability&rdquo; is how steady that rhythm is
          (statistically, the coefficient of variation, where 0 is clockwork).
          An account counts as at risk once it has been silent for longer than
          its own median gap × (1 + 1.5 × its own variability), so it is judged
          against its own rhythm instead of a company-wide number of days.
        </p>
      </Section>
    </>
  );
}
