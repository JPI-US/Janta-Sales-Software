/**
 * Minimal BigQuery REST client -- one call: run a query, get typed rows back.
 * No dependencies; see server/analytics/googleAuth.js for the auth half.
 */

const API = "https://bigquery.googleapis.com/bigquery/v2";

/** BigQuery returns every value as a string; coerce using the column type. */
function coerce(value, type) {
  if (value == null) return null;
  switch (String(type).toUpperCase()) {
    case "INTEGER":
    case "INT64":
    case "FLOAT":
    case "FLOAT64":
    case "NUMERIC":
    case "BIGNUMERIC": {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "BOOLEAN":
    case "BOOL":
      return value === "true" || value === true;
    default:
      return value;
  }
}

/** Turns the {schema, rows} wire format into plain objects. Pure, so it is unit-tested. */
export function parseQueryResponse(payload) {
  const fields = payload?.schema?.fields || [];
  const rows = payload?.rows || [];
  return rows.map((row) => {
    const out = {};
    (row.f || []).forEach((cell, i) => {
      const field = fields[i];
      if (!field) return;
      out[field.name] = coerce(cell.v, field.type);
    });
    return out;
  });
}

export async function runQuery({
  projectId,
  query,
  location = "US",
  accessToken,
  fetchImpl = fetch,
  timeoutMs = 60000,
}) {
  if (!projectId) throw new Error("projectId is required");
  if (!accessToken) throw new Error("accessToken is required");

  const res = await fetchImpl(`${API}/projects/${encodeURIComponent(projectId)}/queries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, useLegacySql: false, location, timeoutMs }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`BigQuery query failed: ${detail}`);
    err.status = res.status;
    err.notFound = res.status === 404 || /not found/i.test(detail);
    throw err;
  }

  // Small queries complete inline. Anything slower needs the results endpoint.
  if (payload.jobComplete === false) {
    const jobId = payload?.jobReference?.jobId;
    if (!jobId) throw new Error("BigQuery did not complete the job and returned no job id");
    return await waitForResults({ projectId, jobId, location, accessToken, fetchImpl, timeoutMs });
  }
  return parseQueryResponse(payload);
}

async function waitForResults({ projectId, jobId, location, accessToken, fetchImpl, timeoutMs }) {
  const deadline = Date.now() + Math.max(timeoutMs, 10000);
  while (Date.now() < deadline) {
    const url = new URL(`${API}/projects/${encodeURIComponent(projectId)}/queries/${encodeURIComponent(jobId)}`);
    url.searchParams.set("location", location);
    url.searchParams.set("timeoutMs", "10000");
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`BigQuery results failed: ${payload?.error?.message || `HTTP ${res.status}`}`);
    }
    if (payload.jobComplete) return parseQueryResponse(payload);
  }
  throw new Error("BigQuery query timed out");
}
