import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyCrmDefaults } from "../shared/proposalCrmFields.js";
import {
  REPORT_VIEW_CURRENT,
  aggregateSalesReport,
  getReportPeriod,
  reportToCsv,
  shiftReportPeriod,
} from "../shared/reportMetrics.js";
import { readJson, send } from "./httpUtils.js";
import { authenticateRequest } from "./auth/sessions.js";
import { DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { canAccessSalesReport } from "../shared/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_VIEWS = new Set(["current", "full", "past", "pipeline", "forecast", "closed"]);

function loadAllProposals(dataDir) {
  const root = dataDir || DEFAULT_DATA_DIR;
  if (!fs.existsSync(root)) return [];
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  const rows = [];
  for (const dir of dirs) {
    const fp = path.join(root, dir.name, "proposals.json");
    if (!fs.existsSync(fp)) continue;
    const store = readJson(fp, { proposals: [] });
    const list = Array.isArray(store.proposals) ? store.proposals : [];
    for (const p of list) rows.push(applyCrmDefaults({ ...p, userId: p.userId || dir.name }));
  }
  return rows;
}

function normalizeReportView(view) {
  if (view === "pipeline" || view === "closed" || view === "past") return "current";
  if (view === "forecast") return "full";
  return view;
}

function handleSalesReport(req, res, { dataDir, authDataDir, reportView: rawView }) {
  const reportView = normalizeReportView(rawView);
  const url = new URL(req.url, "http://localhost");
  const periodIndexParam = url.searchParams.get("periodIndex");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const format = url.searchParams.get("format") || "json";

  let period;
  if (periodIndexParam != null && periodIndexParam !== "") {
    period = shiftReportPeriod(reportView, Number(periodIndexParam));
  } else if (fromParam && toParam) {
    period = { type: "biweekly", from: fromParam, to: toParam, label: `${fromParam.slice(0, 10)} - ${toParam.slice(0, 10)}`, periodIndex: null };
  } else {
    period = getReportPeriod(reportView);
  }

  const proposals = loadAllProposals(dataDir);
  const usePeriod = reportView === "current" || reportView === "full";
  const report = aggregateSalesReport(proposals, usePeriod ? {
    from: period.from,
    to: period.to,
    quarterPipeline: reportView === "full",
  } : {});

  if (format === "csv") {
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportView}-report-${period.label.replace(/[^a-z0-9]+/gi, "-")}.csv"`,
    });
    res.end(reportToCsv(report, period, reportView));
    return;
  }

  return send(res, 200, { period, report, reportView });
}

export function createReportsApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir } = {}) {
  return async function reportsApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/reports/")) return next();

    try {
      const session = await authenticateRequest(req, { dataDir: authDataDir });
      if (!session) return send(res, 401, { error: "Authentication required" });
      if (!canAccessSalesReport(session.user)) return send(res, 403, { error: "Sales or admin access required" });

      if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

      if (url.pathname === "/api/reports/sales") {
        const rawView = url.searchParams.get("view") || url.searchParams.get("type") || "full";
        if (!VALID_VIEWS.has(rawView)) return send(res, 400, { error: "Invalid report view" });
        const view = normalizeReportView(rawView);
        return handleSalesReport(req, res, { dataDir, authDataDir, reportView: view });
      }

      // Legacy route
      if (url.pathname === "/api/reports/biweekly") {
        return handleSalesReport(req, res, { dataDir, authDataDir, reportView: REPORT_VIEW_CURRENT });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("[reports-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}
