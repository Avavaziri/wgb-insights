// Server-side fetch helpers. The frontend renders JSON from the API —
// Python is the single source of truth; no number is computed here.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiDownError extends Error {}

export async function getJson<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiDownError(
      `API unreachable at ${API_BASE} — start it with \`make api\``,
    );
  }
  if (!resp.ok) {
    throw new Error(`${path} -> ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<T>;
}

export async function getChart(name: string): Promise<unknown> {
  return getJson<unknown>(`/charts/${name}`);
}
