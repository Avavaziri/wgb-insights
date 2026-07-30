// Display formatting only: every value here arrives computed from the
// API and is turned into a string. No statistic is derived in this file
// (§4: a number recomputed in TS is a defect).

export const dash = "-";

/** 0.085 -> "8.5%" */
export const pct = (x: number, dp = 1): string => `${(x * 100).toFixed(dp)}%`;

/** Already-percentage values from the API (e.g. pct_effect = -4.6). */
export const pctPoints = (x: number | null, dp = 1): string =>
  x === null ? dash : `${x > 0 ? "+" : ""}${x.toFixed(dp)}%`;

export const gbp = (x: number): string => `£${Math.round(x).toLocaleString()}`;

export const gbpK = (x: number): string =>
  `${x >= 0 ? "+" : "-"}£${Math.abs(Math.round(x / 1000)).toLocaleString()}k`;

export const num = (x: number): string => x.toLocaleString();

export const dp = (x: number | null, places = 3): string =>
  x === null ? dash : x.toFixed(places);

export const expo = (x: number | null, places = 1): string =>
  x === null ? dash : x.toExponential(places);

/** p-values: keep small ones readable rather than collapsing to 0.000. */
export const pval = (x: number | null): string => {
  if (x === null) return dash;
  if (x < 0.001) return x.toExponential(1);
  return x.toFixed(3);
};

/**
 * CI bounds arrive on the log scale (the models are log-linear), so the
 * percentage form needs exp() - 1. This is a unit conversion of a
 * supplied bound, not a new estimate, but it is the one transform still
 * happening client-side, so it lives here alone rather than inline on two
 * pages. Proper fix: emit ci_low_pct / ci_high_pct from stats_core's
 * EffectReport and delete this function.
 */
export const ciPctFromLog = (lo: number, hi: number, places = 1): string =>
  `[${((Math.exp(lo) - 1) * 100).toFixed(places)}, ${((Math.exp(hi) - 1) * 100).toFixed(places)}]%`;

/**
 * The SE label from the API already carries the cluster variable and
 * count, for example "cluster-robust (customer_id, 50 clusters)", so it is
 * passed through rather than having the count appended twice.
 */
export const seLabel = (seType: string): string => seType;
