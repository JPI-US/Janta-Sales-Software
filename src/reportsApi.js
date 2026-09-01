import {
  REPORT_VIEW_CURRENT,
  shiftReportPeriod,
} from "../shared/reportMetrics.js";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (options.raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchSalesReport({ view = REPORT_VIEW_CURRENT, periodIndex, from, to } = {}) {
  const params = new URLSearchParams({ view });
  if (periodIndex != null && periodIndex !== "") params.set("periodIndex", String(periodIndex));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request(`/api/reports/sales?${params}`);
}

export async function downloadSalesReportCsv({ view = REPORT_VIEW_CURRENT, periodIndex, from, to } = {}) {
  const params = new URLSearchParams({ view, format: "csv" });
  if (periodIndex != null && periodIndex !== "") params.set("periodIndex", String(periodIndex));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await request(`/api/reports/sales?${params}`, { raw: true });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Export failed (${res.status})`);
  }
  return res.text();
}

/** @deprecated use fetchSalesReport */
export async function fetchBiweeklyReport(opts) {
  return fetchSalesReport({ ...opts, view: REPORT_VIEW_CURRENT, periodIndex: opts?.periodIndex });
}

/** @deprecated use downloadSalesReportCsv */
export async function downloadBiweeklyReportCsv(opts) {
  return downloadSalesReportCsv({ ...opts, view: REPORT_VIEW_CURRENT, periodIndex: opts?.periodIndex });
}

export { shiftReportPeriod };
