import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  crmFormatDate,
  crmFormatDateShort,
  crmLikelihoodAccentColor,
  crmLikelihoodLabel,
  crmPriorityColor,
  crmPriorityLabel,
  crmStageColor,
  crmStageLabel,
  crmStageReportLabel,
  CRM_DEAL_TYPE_FILTER_OPTIONS,
  normalizeCrmStage,
} from "./proposalCrm.js";
import { DonutChart, FunnelChart, HorizontalBarChart, LineChart, LineChartLegend, StageRevenueFlowChart, formatDateLabel, forecastTrendColor } from "./reportCharts.jsx";
import { downloadSalesReportCsv, fetchSalesReport } from "./reportsApi.js";
import { buildTestSalesReport } from "./reportTestData.js";
import {
  CRM_PRIORITY_HIGH,
  CRM_PRIORITY_LOW,
  CRM_PRIORITY_MEDIUM,
  CRM_STAGE_OPTIONS,
  CRM_STAGE_LEAD_LOST,
} from "../shared/proposalCrmFields.js";
import {
  getCurrentBiweeklyPeriodIndex,
  getCurrentQuarterlyPeriodIndex,
  buildDailyForecastSeries,
  REPORT_VIEW_HEALTH,
  REPORT_VIEW_OPTIONS,
  REPORT_VIEW_SALES,
  REPORT_VIEW_TEST,
} from "../shared/reportMetrics.js";
import { formatUsd, formatUsdCompact } from "./solarPricing.js";
import {
  fontSans,
  getAppTheme,
  pageShellStyle,
} from "./appTheme.js";
import {
  PageHeader,
  RibbonLabeledButton,
} from "./appIcons.jsx";

function pct(n) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
}

function formatSystemSize(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return "—";
  if (kw >= 1000) return `${(kw / 1000).toFixed(kw >= 10000 ? 1 : 2)} MW`;
  return `${kw.toFixed(kw >= 100 ? 0 : 1)} kW`;
}

const OPPORTUNITY_COLUMNS = [
  { key: "title", label: "Project" },
  { key: "stage", label: "Stage", render: (r) => crmStageReportLabel(r.stage) },
  { key: "dealTypeLabel", label: "Type", render: (r) => r.dealTypeLabel || "—" },
  { key: "systemKw", label: "Size", render: (r) => formatSystemSize(r.systemKw) },
  { key: "revenue", label: "Revenue", render: (r) => formatUsdCompact(r.revenue) },
  { key: "weightedRevenue", label: "Weighted", render: (r) => formatUsdCompact(r.weightedRevenue) },
  { key: "closeLikelihoodPct", label: "Likelihood", render: (r) => crmLikelihoodLabel(r.closeLikelihoodPct) },
  { key: "priority", label: "Priority", render: (r) => crmPriorityLabel(r.priority) },
];

function useTheme(isDark) {
  return useMemo(() => {
    const base = getAppTheme(isDark);
    return {
      ...base,
      gold: isDark ? "#D1D5DB" : "#7A5A12",
      signed: isDark ? "#6EE7B7" : "#2A9D8F",
      lost: isDark ? "#F87171" : "#B42318",
    };
  }, [isDark]);
}

function useReportMetricColors(isDark, avgLikelihood) {
  const t = useTheme(isDark);
  return useMemo(
    () => ({
      // Revenue forecast — teal unweighted, brand light blue weighted
      unweighted: isDark ? "#6EE7B7" : "#2A9D8F",
      weighted: isDark ? "#8FB0C8" : "#87A9C4",
      // Capacity — app teal (signed / success)
      capacity: t.signed,
      // Semantic CRM colors
      likelihood: crmLikelihoodAccentColor(avgLikelihood) || (isDark ? "#9CA3AF" : t.subtle),
      priorityHigh: crmPriorityColor(CRM_PRIORITY_HIGH) || "#DC2626",
      priorityMedium: crmPriorityColor(CRM_PRIORITY_MEDIUM) || "#D97706",
      priorityLow: crmPriorityColor(CRM_PRIORITY_LOW) || "#6B7280",
      signed: t.signed,
      lost: t.lost,
      new: t.signed,
      volume: t.subtle,
    }),
    [isDark, avgLikelihood, t.lost, t.signed, t.subtle, t.title]
  );
}

function reportTypography(t) {
  return {
    sectionTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: t.title, fontFamily: fontSans },
    sectionSub: { margin: "4px 0 0", fontSize: 13, color: t.subtle, fontFamily: fontSans },
    label: { fontSize: 12, fontWeight: 500, color: t.subtle, marginBottom: 4, fontFamily: fontSans },
    valueHero: { fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontFamily: fontSans },
    valueMd: { fontSize: 18, fontWeight: 600, lineHeight: 1.1, fontFamily: fontSans },
    valueSm: { fontSize: 14, fontWeight: 600, fontFamily: fontSans },
    body: { fontSize: 13, fontFamily: fontSans },
    tableHead: {
      textAlign: "left",
      padding: "8px 10px",
      color: t.subtle,
      fontWeight: 600,
      whiteSpace: "nowrap",
      fontSize: 12,
      fontFamily: fontSans,
    },
  };
}

function StatPill({ label, value, isDark, accent }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: t.headBg,
        border: `1px solid ${accent || t.border}`,
        flex: "1 1 140px",
        minWidth: 0,
      }}
    >
      <div style={type.label}>{label}</div>
      <div style={{ ...type.valueMd, color: accent || t.title }}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children, isDark, span2, compact, inGrid, featured, secondary, primary, tight, stretch, headerAside }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  const titleStyle = featured
    ? { ...type.sectionTitle, fontSize: 17, fontWeight: 700 }
    : primary
      ? { ...type.sectionTitle, fontSize: 15, fontWeight: 700 }
      : secondary
        ? { ...type.sectionTitle, fontSize: 13, fontWeight: 600, color: t.subtle }
        : type.sectionTitle;
  const subStyle = secondary || tight ? { ...type.sectionSub, fontSize: 11 } : type.sectionSub;
  const pad = featured ? "20px 22px" : tight ? "12px 14px" : compact ? 16 : 20;
  const headerMb = featured ? 16 : tight ? 8 : compact ? 12 : 16;

  return (
    <section
      style={{
        background: t.panel,
        border: `1px solid ${featured ? t.border : primary ? (isDark ? "#404040" : "#D5DCE4") : t.border}`,
        boxShadow: featured ? (isDark ? "0 4px 20px rgba(0,0,0,0.2)" : "0 2px 12px rgba(47,59,76,0.06)") : undefined,
        borderRadius: 12,
        padding: pad,
        gridColumn: span2 ? "1 / -1" : undefined,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: stretch ? 1 : undefined,
        marginBottom: inGrid ? 0 : 16,
      }}
    >
      <div
        style={{
          marginBottom: headerMb,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={titleStyle}>{title}</h2>
          {subtitle ? <p style={subStyle}>{subtitle}</p> : null}
        </div>
        {headerAside ? <div style={{ flexShrink: 0, paddingTop: 2 }}>{headerAside}</div> : null}
      </div>
      <div style={{ flex: 1, minHeight: stretch ? 0 : undefined }}>{children}</div>
    </section>
  );
}

function StageRevenuePanel({ isDark, chartData }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  const hasStages = chartData.stageItems.some((item) => item.value > 0);

  return (
    <Panel
      title="Unweighted revenue by stage"
      subtitle="Open pipeline"
      isDark={isDark}
      span2
      inGrid
      primary
    >
      {hasStages ? (
        <StageRevenueFlowChart
          isDark={isDark}
          items={chartData.stageItems}
          formatValue={formatUsdCompact}
        />
      ) : (
        <div style={{ ...type.body, color: t.subtle, fontStyle: "italic", padding: "48px 0" }}>
          No open deals with stage revenue.
        </div>
      )}
    </Panel>
  );
}

const OPPORTUNITY_PAGE_SIZE = 10;

const OPP_PRIORITY_OPTIONS = [
  { value: CRM_PRIORITY_HIGH, label: "High" },
  { value: CRM_PRIORITY_MEDIUM, label: "Medium" },
  { value: CRM_PRIORITY_LOW, label: "Low" },
  { value: "unset", label: "Unset" },
];

const OPP_LIKELIHOOD_OPTIONS = [
  { value: "76-100", label: "76–100%" },
  { value: "51-75", label: "51–75%" },
  { value: "26-50", label: "26–50%" },
  { value: "0-25", label: "0–25%" },
  { value: "unset", label: "Unset" },
];

const OPP_REVENUE_OPTIONS = [
  { value: "under_500k", label: "< $500K" },
  { value: "500k_2m", label: "$500K–$2M" },
  { value: "over_2m", label: "$2M+" },
];

function oppLikelihoodBucket(pct) {
  if (!Number.isFinite(pct)) return "unset";
  if (pct <= 25) return "0-25";
  if (pct <= 50) return "26-50";
  if (pct <= 75) return "51-75";
  return "76-100";
}

function oppRevenueBucket(revenue) {
  if (revenue < 500_000) return "under_500k";
  if (revenue < 2_000_000) return "500k_2m";
  return "over_2m";
}

function ActiveOpportunitiesPanel({ isDark, rows, totalOpen }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  const [stageFilter, setStageFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [likelihoodFilter, setLikelihoodFilter] = useState(null);
  const [revenueFilter, setRevenueFilter] = useState(null);
  const [page, setPage] = useState(0);

  const stageOptions = useMemo(() => {
    const seen = new Map();
    for (const row of rows) {
      if (row.stage) seen.set(row.stage, crmStageReportLabel(row.stage));
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const typeOptions = useMemo(
    () => CRM_DEAL_TYPE_FILTER_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    []
  );

  const ownerOptions = useMemo(() => {
    const seen = new Set();
    for (const row of rows) {
      if (row.proposalOwner) seen.add(row.proposalOwner);
    }
    return [...seen].sort().map((label) => ({ value: label, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (stageFilter && row.stage !== stageFilter) return false;
      if (typeFilter && row.dealType !== typeFilter) return false;
      if (priorityFilter) {
        const pr = row.priority || "unset";
        if (pr !== priorityFilter) return false;
      }
      if (ownerFilter && row.proposalOwner !== ownerFilter) return false;
      if (likelihoodFilter && oppLikelihoodBucket(row.closeLikelihoodPct) !== likelihoodFilter) return false;
      if (revenueFilter && oppRevenueBucket(row.revenue || 0) !== revenueFilter) return false;
      return true;
    });
  }, [rows, stageFilter, typeFilter, priorityFilter, ownerFilter, likelihoodFilter, revenueFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / OPPORTUNITY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * OPPORTUNITY_PAGE_SIZE,
    safePage * OPPORTUNITY_PAGE_SIZE + OPPORTUNITY_PAGE_SIZE
  );
  const hasLocalFilters = Boolean(
    stageFilter || typeFilter || priorityFilter || ownerFilter || likelihoodFilter || revenueFilter
  );

  useEffect(() => {
    setPage(0);
  }, [stageFilter, typeFilter, priorityFilter, ownerFilter, likelihoodFilter, revenueFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const subtitle =
    totalOpen !== filtered.length
      ? `${filtered.length} shown of ${totalOpen} open · sorted by weighted revenue`
      : `${totalOpen} open · sorted by weighted revenue`;

  function clearFilters() {
    setStageFilter(null);
    setTypeFilter(null);
    setPriorityFilter(null);
    setOwnerFilter(null);
    setLikelihoodFilter(null);
    setRevenueFilter(null);
  }

  return (
    <Panel title="Active opportunities" subtitle={subtitle} isDark={isDark} primary inGrid stretch>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
        <div style={{ flexShrink: 0, marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <select
              value={stageFilter || ""}
              onChange={(e) => setStageFilter(e.target.value || null)}
              style={oppSelectStyle(t, Boolean(stageFilter), isDark)}
              aria-label="Filter by stage"
            >
              <option value="">Stage</option>
              {stageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={typeFilter || ""}
              onChange={(e) => setTypeFilter(e.target.value || null)}
              style={oppSelectStyle(t, Boolean(typeFilter), isDark)}
              aria-label="Filter by type"
            >
              <option value="">Type</option>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter || ""}
              onChange={(e) => setPriorityFilter(e.target.value || null)}
              style={oppSelectStyle(t, Boolean(priorityFilter), isDark)}
              aria-label="Filter by priority"
            >
              <option value="">Priority</option>
              {OPP_PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {ownerOptions.length > 0 ? (
              <select
                value={ownerFilter || ""}
                onChange={(e) => setOwnerFilter(e.target.value || null)}
                style={oppSelectStyle(t, Boolean(ownerFilter), isDark)}
                aria-label="Filter by owner"
              >
                <option value="">Owner</option>
                {ownerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={likelihoodFilter || ""}
              onChange={(e) => setLikelihoodFilter(e.target.value || null)}
              style={oppSelectStyle(t, Boolean(likelihoodFilter), isDark)}
              aria-label="Filter by likelihood"
            >
              <option value="">Likelihood</option>
              {OPP_LIKELIHOOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={revenueFilter || ""}
              onChange={(e) => setRevenueFilter(e.target.value || null)}
              style={oppSelectStyle(t, Boolean(revenueFilter), isDark)}
              aria-label="Filter by revenue"
            >
              <option value="">Revenue</option>
              {OPP_REVENUE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {hasLocalFilters ? (
              <button type="button" onClick={clearFilters} style={oppClearBtn(t)}>
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {filtered.length > 0 ? (
          <>
            <DataTable
              isDark={isDark}
              columns={OPPORTUNITY_COLUMNS}
              rows={pageRows}
              scrollable
              fill
              stickyHead
            />

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "auto",
                paddingTop: 12,
                borderTop: `1px solid ${t.border}`,
                fontSize: 12,
                color: t.subtle,
                fontFamily: fontSans,
                flexShrink: 0,
              }}
            >
              <span>
                {`Showing ${safePage * OPPORTUNITY_PAGE_SIZE + 1}–${Math.min((safePage + 1) * OPPORTUNITY_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={oppPageBtn(t, safePage <= 0)}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <span style={{ padding: "4px 8px", color: t.title, fontWeight: 600 }}>
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={oppPageBtn(t, safePage >= totalPages - 1)}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ ...type.body, color: t.subtle, fontStyle: "italic" }}>No matching opportunities.</div>
        )}
      </div>
    </Panel>
  );
}

function oppSelectStyle(t, active = false, isDark = false) {
  const highlight = isDark
    ? { border: "#8FB0C8", bg: "rgba(143,176,200,0.18)" }
    : { border: "#87A9C4", bg: "rgba(135,169,196,0.2)" };
  return {
    padding: "6px 8px",
    borderRadius: 8,
    border: `1px solid ${active ? highlight.border : t.border}`,
    background: active ? highlight.bg : t.inputBg,
    color: active ? t.title : t.subtle,
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    fontFamily: fontSans,
    minWidth: 108,
  };
}

function oppClearBtn(t) {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: t.subtle,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}

function oppPageBtn(t, disabled) {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: disabled ? t.subtle : t.title,
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontFamily: fontSans,
  };
}

function RevenueMixRow({ isDark, chartData }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      <Panel title="Revenue by priority" subtitle="Unweighted · open pipeline" isDark={isDark} primary compact inGrid>
        <DonutChart
          isDark={isDark}
          segments={chartData.priorityRevenueItems.filter((item) => item.value > 0)}
          formatValue={formatUsdCompact}
          valueLabel="revenue"
          size={180}
        />
      </Panel>
      <Panel title="Revenue by project type" subtitle="Unweighted · open pipeline" isDark={isDark} primary compact inGrid>
        <DonutChart
          isDark={isDark}
          segments={chartData.projectTypeRevenueItems.filter((item) => item.value > 0)}
          formatValue={formatUsdCompact}
          valueLabel="revenue"
          size={180}
        />
      </Panel>
      <Panel title="Revenue by financing" subtitle="Unweighted · open pipeline" isDark={isDark} primary compact inGrid>
        <DonutChart
          isDark={isDark}
          segments={chartData.financingRevenueItems.filter((item) => item.value > 0)}
          formatValue={formatUsdCompact}
          valueLabel="revenue"
          size={180}
        />
      </Panel>
    </div>
  );
}

function OpportunitiesMixRow({ isDark, chartData, rows, totalOpen }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      <ActiveOpportunitiesPanel isDark={isDark} rows={rows} totalOpen={totalOpen} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0, height: "100%" }}>
        <Panel title="Priority mix" subtitle="Open deals" isDark={isDark} primary compact inGrid stretch>
          <HorizontalBarChart
            isDark={isDark}
            items={chartData.priorityItems}
            formatValue={(v) => String(v)}
          />
        </Panel>
        <Panel title="Project type" subtitle="Open deals" isDark={isDark} primary compact inGrid>
          <HorizontalBarChart
            isDark={isDark}
            items={chartData.projectTypeItems}
            formatValue={(v) => String(v)}
          />
        </Panel>
        <Panel title="Financing" subtitle="Open deals" isDark={isDark} primary compact inGrid>
          <HorizontalBarChart
            isDark={isDark}
            items={chartData.financingItems}
            formatValue={(v) => String(v)}
          />
        </Panel>
      </div>
    </div>
  );
}

function ReportGrid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {children}
    </div>
  );
}

function DataTable({ columns, rows, isDark, scrollable = false, maxHeight, stickyHead = false, fill = false }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  if (!rows.length) {
    return <div style={{ ...type.body, color: t.subtle, fontStyle: "italic" }}>No data.</div>;
  }
  const wrapStyle = scrollable
    ? fill
      ? { overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }
      : { overflowX: "auto", overflowY: "auto", maxHeight: maxHeight || 360 }
    : { overflowX: "auto" };
  const headStyle = stickyHead
    ? { ...type.tableHead, position: "sticky", top: 0, background: t.panel, zIndex: 1 }
    : type.tableHead;

  return (
    <div style={wrapStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.border}` }}>
            {columns.map((c) => (
              <th key={c.key} style={headStyle}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} style={{ borderBottom: `1px solid ${t.border}` }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "10px", color: t.title, verticalAlign: "top", fontSize: 13 }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeBadge({ outcome, isDark }) {
  const t = useTheme(isDark);
  const signed = outcome === "signed";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: signed ? (isDark ? "#14332E" : "#E6F5F1") : t.errorBg,
        color: signed ? t.signed : t.lost,
      }}
    >
      {signed ? "Signed" : "Lead lost"}
    </span>
  );
}

export default function ReportsDashboard({ isDark, userName, userEmail, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(null);
  const [report, setReport] = useState(null);
  const [reportView, setReportView] = useState(REPORT_VIEW_SALES);
  const [periodIndex, setPeriodIndex] = useState(null);
  const [tableTab, setTableTab] = useState("new");
  const [exporting, setExporting] = useState(false);
  const t = useTheme(isDark);

  const currentPeriodIndex = useMemo(
    () =>
      reportView === REPORT_VIEW_SALES || reportView === REPORT_VIEW_TEST
        ? getCurrentQuarterlyPeriodIndex()
        : getCurrentBiweeklyPeriodIndex(),
    [reportView]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (reportView === REPORT_VIEW_TEST) {
        const data = buildTestSalesReport({ periodIndex: periodIndex ?? undefined });
        setPeriod(data.period);
        setReport(data.report);
        if (periodIndex == null && data.period?.periodIndex != null) {
          setPeriodIndex(data.period.periodIndex);
        }
        return;
      }

      const data = await fetchSalesReport({
        view: reportView,
        periodIndex: periodIndex ?? undefined,
      });
      setPeriod(data.period);
      setReport(data.report);
      if (periodIndex == null && data.period?.periodIndex != null) {
        setPeriodIndex(data.period.periodIndex);
      }
    } catch (err) {
      setError(err.message || "Could not load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [periodIndex, reportView]);

  useEffect(() => {
    load();
  }, [load]);

  function changeReportView(nextView) {
    if (nextView === reportView) return;
    setReportView(nextView);
    setPeriod(null);
    setReport(null);
    setPeriodIndex(null);
  }

  const metricColors = useReportMetricColors(isDark, report?.summary?.avgCloseLikelihood);

  const chartData = useMemo(() => {
    if (!report) return null;
    const f = report.period?.conversionFunnel || report.conversionFunnel || {};
    const pipelineStageOrder = CRM_STAGE_OPTIONS.filter(
      (o) => o.value && o.value !== CRM_STAGE_LEAD_LOST
    ).map((o) => o.value);
    const byStage = report.systemPipeline?.byStage || report.pipelineHealth?.byStage || {};
    const stageKeys = [
      ...pipelineStageOrder,
      ...(byStage.unset ? ["unset"] : []),
    ];
    const systemStages = stageKeys.map((stageKey) => {
      const s = byStage[stageKey];
      return {
        stageKey,
        label: stageKey === "unset" ? "Unset" : s?.label || crmStageLabel(stageKey),
        value: s?.revenue || 0,
        weightedValue: s?.weightedRevenue ?? 0,
        color: stageKey === "unset" ? (isDark ? "#6B7280" : "#9CA3AF") : crmStageColor(stageKey).bg,
      };
    });
    const stageItems = systemStages.map(({ stageKey, label, value, color }) => {
      const stageDeals = (report.activeOpportunities || []).filter(
        (row) => (normalizeCrmStage(row.stage) || "unset") === stageKey,
      );
      return {
        stageKey,
        label,
        value,
        color,
        count: byStage[stageKey]?.count || stageDeals.length,
        contributors: stageDeals
          .slice()
          .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
          .slice(0, 5)
          .map((row) => ({
            title: row.title || "Untitled",
            revenue: row.revenue || 0,
            owner: row.proposalOwner || null,
          })),
      };
    });

    const priorityColorMap = {
      High: metricColors.priorityHigh,
      Medium: metricColors.priorityMedium,
      Low: metricColors.priorityLow,
      Unset: isDark ? "#6B7280" : "#9CA3AF",
    };

    const priorityOrder = ["high", "medium", "low", "unset"];
    const projectTypeColorMap = {
      Pilot: isDark ? "#D1D5DB" : "#D3A14A",
      Residential: isDark ? "#737373" : "#6F8096",
      "Small commercial": isDark ? "#93C5FD" : "#5B8DEF",
      Commercial: isDark ? "#6EE7B7" : "#2A9D8F",
      "Large commercial": isDark ? "#34D399" : "#1F7A6C",
      "Dist. utility": isDark ? "#A3A3A3" : "#4A6FA5",
      "Utility scale": isDark ? "#9CA3AF" : "#3D5A80",
      "Large utility": isDark ? "#D4D4D4" : "#2F4858",
    };
    const financingColorMap = {
      "Self-pay": isDark ? "#6EE7B7" : "#2A9D8F",
      PPA: isDark ? "#D1D5DB" : "#D3A14A",
      Loan: isDark ? "#93C5FD" : "#5B8DEF",
      Unset: isDark ? "#6B7280" : "#9CA3AF",
    };

    const revenueByDate = report.revenueByDate || {};
    const weightedByDate = report.weightedRevenueByDate || {};
    const periodFrom = period?.from || report.period?.from;
    const periodTo = period?.to || report.period?.to;
    const daily = buildDailyForecastSeries(revenueByDate, weightedByDate, {
      from: periodFrom,
      to: periodTo,
    });
    const unweightedPoints = daily.unweighted.map((pt) => ({
      date: pt.date,
      label: formatDateLabel(pt.date),
      value: pt.value,
    }));
    const weightedPoints = daily.weighted.map((pt) => ({
      date: pt.date,
      label: formatDateLabel(pt.date),
      value: pt.value,
    }));

    return {
      stageSegments: systemStages,
      stageItems,
      forecastSeries: [
        { label: "Weighted", points: weightedPoints, color: metricColors.weighted },
        { label: "Unweighted", points: unweightedPoints, color: metricColors.unweighted },
      ],
      forecastSummary: {
        hasForecastChart: daily.closeDateCount > 0,
      },
      forecastXDomain:
        periodFrom && periodTo ? { from: periodFrom, to: periodTo } : null,
      steps: [
        { label: "Proposal created", value: f.proposalCreated ?? 0 },
        { label: "Drafting proposal", value: f.draftingProposal ?? 0 },
        { label: "Proposal approved", value: f.proposalApproved ?? 0 },
        { label: "Proposal sent", value: f.proposalSent ?? 0 },
        { label: "Proposal negotiation", value: f.proposalNegotiation ?? 0 },
        { label: "Proposal revision", value: f.proposalRevision ?? 0 },
        { label: "Needs follow-up", value: f.needsFollowUp ?? 0, tone: "followup" },
        { label: "Proposal signed", value: f.proposalSigned ?? 0, tone: "signed" },
        { label: "Lead lost", value: f.leadLost ?? 0, tone: "lost" },
      ],
      priorityItems: priorityOrder.map((key) => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          return {
            label,
            value: report.priority?.distribution?.[key] ?? 0,
            color: priorityColorMap[label],
          };
        }),
      priorityRevenueItems: (() => {
        const totals = { high: 0, medium: 0, low: 0, unset: 0 };
        for (const row of report.activeOpportunities || []) {
          const pr = row.priority;
          const key =
            pr === CRM_PRIORITY_HIGH ? "high" : pr === CRM_PRIORITY_MEDIUM ? "medium" : pr === CRM_PRIORITY_LOW ? "low" : "unset";
          totals[key] += row.revenue || 0;
        }
        return priorityOrder.map((key) => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          return {
            label,
            value: totals[key] || 0,
            color: priorityColorMap[label],
          };
        });
      })(),
      projectTypeItems: (report.projectsBySize || []).map((row) => ({
        label: row.label,
        value: row.count,
        color: projectTypeColorMap[row.label] || (isDark ? "#6B7280" : "#9CA3AF"),
      })),
      projectTypeRevenueItems: (report.projectsBySize || []).map((row) => ({
        label: row.label,
        value: row.revenue || 0,
        color: projectTypeColorMap[row.label] || (isDark ? "#6B7280" : "#9CA3AF"),
      })),
      financingItems: (report.projectsByFinancing || []).map((row) => ({
        label: row.label,
        value: row.count,
        color: financingColorMap[row.label] || (isDark ? "#6B7280" : "#9CA3AF"),
      })),
      financingRevenueItems: (report.projectsByFinancing || []).map((row) => ({
        label: row.label,
        value: row.revenue || 0,
        color: financingColorMap[row.label] || (isDark ? "#6B7280" : "#9CA3AF"),
      })),
    };
  }, [report, metricColors, isDark, period]);

  async function handleExport() {
    if (reportView === REPORT_VIEW_TEST) {
      window.alert("CSV export is not available for the test preview.");
      return;
    }
    setExporting(true);
    try {
      const csv = await downloadSalesReportCsv({
        view: reportView,
        periodIndex: periodIndex ?? undefined,
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportView}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const periodSummary = report?.period?.summary;
  const periodNavLabel =
    reportView === REPORT_VIEW_SALES || reportView === REPORT_VIEW_TEST ? "quarter" : "2 weeks";
  const isSalesLikeView = reportView === REPORT_VIEW_SALES || reportView === REPORT_VIEW_TEST;

  return (
    <>
      <PageHeader
        theme={t}
        title="Sales Reports"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
        onBack={onBack}
        backTitle="Back to Projects"
      >
        <RibbonLabeledButton
          theme={t}
          icon="download"
          variant="primary"
          title="Download report as CSV"
          onClick={handleExport}
          disabled={exporting || !report || reportView === REPORT_VIEW_TEST}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </RibbonLabeledButton>
      </PageHeader>

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            padding: "12px 16px",
            background: t.panel,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REPORT_VIEW_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => changeReportView(o.value)}
                style={{
                  ...chipBtn(isDark),
                  background: reportView === o.value ? t.accent : t.inputBg,
                  color: reportView === o.value ? t.accentText : t.subtle,
                  border: `1px solid ${reportView === o.value ? t.accent : t.border}`,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <PeriodNav
            isDark={isDark}
            label={period?.label || "..."}
            canGoBack={periodIndex != null && periodIndex > 0}
            canGoForward={periodIndex != null && periodIndex < currentPeriodIndex}
            onBack={() => setPeriodIndex((i) => (i == null ? i : i - 1))}
            onForward={() => setPeriodIndex((i) => (i == null ? i : i + 1))}
            stepLabel={periodNavLabel}
          />
        </div>

        {error ? (
          <div style={{ color: t.errorText, marginBottom: 16, padding: 12, background: t.errorBg, borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{ color: t.subtle, padding: 48, textAlign: "center", fontSize: 14 }}>Loading report...</div>
        ) : null}

        {!loading && report && chartData ? (
          <>
            {isSalesLikeView ? (
              <ReportGrid>
                {reportView === REPORT_VIEW_TEST ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: isDark ? "rgba(135,169,196,0.12)" : "rgba(135,169,196,0.18)",
                      border: `1px solid ${isDark ? "rgba(135,169,196,0.35)" : "rgba(135,169,196,0.45)"}`,
                      color: t.subtle,
                      fontSize: 13,
                      fontFamily: fontSans,
                    }}
                  >
                    Test preview — 80 sample projects with varied stages, types, sizes, and revenue. Not real pipeline data.
                  </div>
                ) : null}

                <PipelinePanel
                  report={report}
                  isDark={isDark}
                  periodLabel={period?.label}
                  metricColors={metricColors}
                />

                <RevenueForecastPanel
                  isDark={isDark}
                  series={chartData.forecastSeries}
                  summary={chartData.forecastSummary}
                  xDomain={chartData.forecastXDomain}
                />

                <StageRevenuePanel isDark={isDark} chartData={chartData} />

                <RevenueMixRow isDark={isDark} chartData={chartData} />

                <OpportunitiesMixRow
                  isDark={isDark}
                  chartData={chartData}
                  rows={report.activeOpportunities}
                  totalOpen={report.summary.openOpportunities}
                />
              </ReportGrid>
            ) : null}

            {reportView === REPORT_VIEW_HEALTH ? (
              <>
                <Panel
                  title="Period summary"
                  subtitle={period?.label ? `Activity for ${period.label}` : "Activity this period"}
                  isDark={isDark}
                  span2
                  compact
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                    <StatPill isDark={isDark} label="New this period" value={periodSummary?.newCount ?? 0} accent={metricColors.new} />
                    <StatPill isDark={isDark} label="Signed" value={periodSummary?.signedCount ?? 0} accent={metricColors.signed} />
                    <StatPill isDark={isDark} label="Lead lost" value={periodSummary?.lostCount ?? 0} accent={metricColors.lost} />
                    <StatPill isDark={isDark} label="Win rate" value={pct(periodSummary?.winRate)} accent={metricColors.likelihood} />
                  </div>
                  <FunnelChart isDark={isDark} steps={chartData.steps} />
                </Panel>

                <Panel
                  title="Projects"
                  subtitle={tableTab === "new" ? "Added this period" : "Closed this period"}
                  isDark={isDark}
                  span2
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {[
                      ["new", `New (${periodSummary?.newCount ?? 0})`],
                      ["closed", `Closed (${(periodSummary?.signedCount ?? 0) + (periodSummary?.lostCount ?? 0)})`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTableTab(key)}
                        style={{
                          ...chipBtn(isDark),
                          background: tableTab === key ? t.accent : t.inputBg,
                          color: tableTab === key ? t.accentText : t.subtle,
                          border: `1px solid ${tableTab === key ? t.accent : t.border}`,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {tableTab === "new" ? (
                    <DataTable
                      isDark={isDark}
                      columns={[
                        { key: "title", label: "Project" },
                        { key: "proposalOwner", label: "Owner", render: (r) => r.proposalOwner || "—" },
                        { key: "createdAt", label: "Created", render: (r) => crmFormatDateShort(r.createdAt) },
                        { key: "stage", label: "Stage", render: (r) => crmStageReportLabel(r.stage) },
                        { key: "dealTypeLabel", label: "Type", render: (r) => r.dealTypeLabel || "—" },
                        { key: "systemKw", label: "Size", render: (r) => formatSystemSize(r.systemKw) },
                        { key: "revenue", label: "Revenue", render: (r) => formatUsd(r.revenue) },
                        { key: "priority", label: "Priority", render: (r) => crmPriorityLabel(r.priority) },
                        { key: "closeLikelihoodPct", label: "Likelihood", render: (r) => crmLikelihoodLabel(r.closeLikelihoodPct) },
                      ]}
                      rows={report.period?.newProjects || []}
                    />
                  ) : (
                    <DataTable
                      isDark={isDark}
                      columns={[
                        { key: "title", label: "Project" },
                        { key: "proposalOwner", label: "Owner", render: (r) => r.proposalOwner || "—" },
                        { key: "outcome", label: "Outcome", render: (r) => <OutcomeBadge outcome={r.outcome} isDark={isDark} /> },
                        { key: "revenue", label: "Revenue", render: (r) => formatUsd(r.revenue) },
                        { key: "systemKw", label: "Size", render: (r) => formatSystemSize(r.systemKw) },
                        { key: "updatedAt", label: "Closed", render: (r) => crmFormatDate(r.updatedAt) },
                      ]}
                      rows={report.period?.closedDeals || []}
                    />
                  )}
                </Panel>
              </>
            ) : null}
          </>
        ) : null}
      </main>
    </>
  );
}

function PipelinePanel({ report, isDark, periodLabel, metricColors }) {
  const summary = report.summary;
  const totalKw = summary.totalOpenSystemKw ?? 0;
  const kwDisplay = totalKw > 0 ? formatSystemSize(totalKw) : "—";

  return (
    <Panel
      title="Pipeline"
      subtitle={periodLabel ? `Deals expected to close ${periodLabel}` : "Open deals"}
      isDark={isDark}
      span2
      compact
      inGrid
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <StatPill isDark={isDark} label="Weighted" value={formatUsdCompact(summary.pipelineWeighted)} accent={metricColors.weighted} />
        <StatPill isDark={isDark} label="Unweighted" value={formatUsdCompact(summary.pipelineUnweighted)} accent={metricColors.unweighted} />
        <StatPill isDark={isDark} label="Open deals" value={summary.openOpportunities} />
        <StatPill isDark={isDark} label="Capacity" value={kwDisplay} accent={metricColors.capacity} />
        <StatPill
          isDark={isDark}
          label="Likelihood"
          value={summary.avgCloseLikelihood != null ? `${summary.avgCloseLikelihood}%` : "—"}
          accent={metricColors.likelihood}
        />
        <StatPill
          isDark={isDark}
          label="High priority"
          value={report.priority?.distribution?.high ?? 0}
          accent={metricColors.priorityHigh}
        />
      </div>
    </Panel>
  );
}

function RevenueForecastPanel({ isDark, series, summary, xDomain }) {
  const t = useTheme(isDark);
  const type = reportTypography(t);
  const trendLegend = {
    label: "Close activity trend",
    color: forecastTrendColor(isDark),
  };

  return (
    <Panel
      title="Revenue forecast"
      subtitle="Expected close value by day across the quarter"
      isDark={isDark}
      featured
      span2
      inGrid
      headerAside={
        summary.hasForecastChart ? (
          <LineChartLegend series={series} isDark={isDark} trendLine={trendLegend} />
        ) : null
      }
    >
      {summary.hasForecastChart ? (
        <LineChart
          isDark={isDark}
          series={series}
          formatValue={formatUsdCompact}
          featured
          executive
          xDomain={xDomain}
          showTrendLine
        />
      ) : (
        <div style={{ ...type.body, color: t.subtle, fontStyle: "italic", padding: "24px 0" }}>
          Add expected close dates on open deals to see the forecast chart.
        </div>
      )}
    </Panel>
  );
}

function PeriodNav({ isDark, label, canGoBack, canGoForward, onBack, onForward, stepLabel = "period" }) {
  const t = useTheme(isDark);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <button
        type="button"
        aria-label={`Previous ${stepLabel}`}
        title={`Previous ${stepLabel}`}
        disabled={!canGoBack}
        onClick={onBack}
        style={periodArrowBtn(isDark, !canGoBack)}
      >
        <ChevronIcon direction="left" />
      </button>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: t.title,
          minWidth: 0,
          textAlign: "center",
          padding: "0 4px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <button
        type="button"
        aria-label={`Next ${stepLabel}`}
        title={canGoForward ? `Next ${stepLabel}` : "Current period"}
        disabled={!canGoForward}
        onClick={onForward}
        style={periodArrowBtn(isDark, !canGoForward)}
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}

function ChevronIcon({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {direction === "left" ? (
        <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function periodArrowBtn(isDark, disabled) {
  const t = getAppTheme(isDark);
  return {
    display: "grid",
    placeItems: "center",
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: disabled ? t.disabledBg : t.inputBg,
    color: disabled ? t.disabled : t.subtle,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    flexShrink: 0,
    fontFamily: fontSans,
  };
}

function chipBtn(isDark) {
  const t = getAppTheme(isDark);
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg,
    color: t.subtle,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}
