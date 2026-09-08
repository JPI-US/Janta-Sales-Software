import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fontSans,
  getAppTheme,
  pageShellStyle,
} from "./appTheme.js";
import { PageHeader, RibbonLabeledButton } from "./appIcons.jsx";
import { LineChart } from "./reportCharts.jsx";
import { fetchMediaOverview } from "./mediaApi.js";
import {
  MEDIA_CHANNEL_ORDER,
  formatMediaNumber,
  formatMediaPercent,
} from "../shared/mediaMetrics.js";

const ROLLING_PERIOD_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
];

function calendarQuarterIndex(d = new Date()) {
  return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
}

function calendarQuarterRange(index) {
  const year = Math.floor(index / 4);
  const q = ((index % 4) + 4) % 4;
  const start = new Date(year, q * 3, 1, 0, 0, 0, 0);
  const end = new Date(year, q * 3 + 3, 0, 23, 59, 59, 999);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label: `Q${q + 1} ${year}`,
  };
}

function useTheme(isDark) {
  return useMemo(() => getAppTheme(isDark), [isDark]);
}

function mediaTypography(t) {
  return {
    sectionTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: t.title, fontFamily: fontSans },
    sectionSub: { margin: "4px 0 0", fontSize: 13, color: t.subtle, fontFamily: fontSans },
    label: { fontSize: 12, fontWeight: 500, color: t.subtle, marginBottom: 4, fontFamily: fontSans },
    valueHero: { fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontFamily: fontSans },
    valueMd: { fontSize: 18, fontWeight: 600, lineHeight: 1.1, fontFamily: fontSans },
    body: { fontSize: 13, fontFamily: fontSans },
  };
}

function formatKpiValue(kpi) {
  if (kpi.format === "percent") return formatMediaPercent(kpi.value);
  return formatMediaNumber(kpi.value);
}

function Panel({ title, subtitle, children, isDark, headerAside, accent }) {
  const t = useTheme(isDark);
  const type = mediaTypography(t);
  return (
    <section
      style={{
        background: t.panel,
        border: `1px solid ${accent ? `${accent}33` : t.border}`,
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.18)" : "0 2px 12px rgba(47,59,76,0.06)",
      }}
    >
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...type.sectionTitle, fontSize: 16 }}>{title}</h2>
          {subtitle ? <p style={type.sectionSub}>{subtitle}</p> : null}
        </div>
        {headerAside ? <div style={{ flexShrink: 0 }}>{headerAside}</div> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </section>
  );
}

function StatPill({ label, value, isDark, accent }) {
  const t = useTheme(isDark);
  const type = mediaTypography(t);
  return (
    <div
      style={{
        padding: "14px 16px 14px 16px",
        borderRadius: 10,
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderLeft: `3px solid ${accent || t.amber}`,
        flex: "1 1 160px",
        minWidth: 0,
      }}
    >
      <div style={type.label}>{label}</div>
      <div style={{ ...type.valueMd, color: t.title }}>{value}</div>
    </div>
  );
}

function StatusBadge({ channel, isDark }) {
  const t = useTheme(isDark);
  let label = "Demo";
  let bg = isDark ? "rgba(243,182,100,0.16)" : "#FFF3DE";
  let color = isDark ? t.amber : "#B26A00";

  if (channel.live) {
    label = "Live";
    bg = t.successBg;
    color = t.successText || t.positive;
  } else if (channel.error) {
    label = "Error";
    bg = t.errorBg;
    color = t.lost || "#B42318";
  } else if (!channel.demo && !channel.configured) {
    label = "Not connected";
    bg = isDark ? "#0B1A2E" : "#F4F6FA";
    color = t.subtle;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ChannelPanel({ channel, isDark }) {
  const t = useTheme(isDark);
  const type = mediaTypography(t);
  const topKpis = (channel.kpis || []).slice(0, 4);
  const trendSeries =
    channel.trend?.length > 1
      ? [{ label: channel.label, points: channel.trend, color: channel.accent }]
      : [];

  return (
    <Panel
      title={channel.label}
      subtitle={channel.provider}
      isDark={isDark}
      accent={channel.accent}
      headerAside={<StatusBadge channel={channel} isDark={isDark} />}
    >
      {channel.error ? (
        <div
          style={{
            ...type.body,
            color: t.lost || "#B42318",
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: t.errorBg,
          }}
        >
          {channel.error}
        </div>
      ) : null}

      {!channel.live && !channel.demo && !channel.configured ? (
        <div style={{ ...type.body, color: t.subtle, fontStyle: "italic", padding: "12px 0 16px" }}>
          {channel.setupHint}
        </div>
      ) : null}

      {topKpis.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
          {topKpis.map((kpi) => (
            <div
              key={kpi.key}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: t.headBg,
                border: `1px solid ${t.border}`,
              }}
            >
              <div style={type.label}>{kpi.label}</div>
              <div style={{ ...type.valueMd, fontSize: 16, color: channel.accent }}>{formatKpiValue(kpi)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {trendSeries.length ? (
        <div style={{ marginBottom: 16 }}>
          <LineChart isDark={isDark} series={trendSeries} formatValue={formatMediaNumber} height={140} />
        </div>
      ) : null}

      {channel.items?.length ? (
        <div>
          <div style={{ ...type.label, marginBottom: 8 }}>Top performers</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {channel.items.map((item, i) => (
              <div
                key={`${item.title}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: i < channel.items.length - 1 ? `1px solid ${t.border}` : undefined,
                }}
              >
                <div style={{ ...type.body, color: t.title, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ ...type.body, fontWeight: 600, color: t.title }}>{item.metric}</div>
                  {item.secondary ? <div style={{ fontSize: 11, color: t.subtle }}>{item.secondary}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {channel.demo ? (
        <div style={{ ...type.body, fontSize: 11, color: t.subtle, marginTop: 12 }}>
          Sample data — connect {channel.provider} in `.env` for live stats.
        </div>
      ) : null}
    </Panel>
  );
}

function PeriodChip({ label, active, isDark, onClick, disabled }) {
  const t = useTheme(isDark);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? t.title : t.border}`,
        background: active ? (isDark ? "#262626" : "#FFFFFF") : "transparent",
        color: active ? t.title : t.subtle,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: fontSans,
      }}
    >
      {label}
    </button>
  );
}

export default function MediaDashboard({
  isDark,
  userName,
  userEmail,
  onBack,
  onOpenEmailStudio,
  title = "Marketing Report",
  channelKeys = MEDIA_CHANNEL_ORDER,
  showSummary = true,
  periodMode = "quarter",
  sectionTabs,
  activeSection,
  onSectionChange,
  headerExtra,
  summaryExtras,
  children,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [days, setDays] = useState(90);
  const [quarterIndex, setQuarterIndex] = useState(() => calendarQuarterIndex());
  const t = useTheme(isDark);
  const type = mediaTypography(t);
  const currentQuarter = calendarQuarterIndex();
  const selectedQuarter = calendarQuarterRange(quarterIndex);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data =
        periodMode === "quarter"
          ? await fetchMediaOverview({ from: selectedQuarter.from, to: selectedQuarter.to })
          : await fetchMediaOverview({ days });
      setOverview(data);
    } catch (err) {
      setError(err.message || "Could not load marketing analytics");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [days, periodMode, selectedQuarter.from, selectedQuarter.to]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = overview?.summary;
  const channels = overview?.channels || {};

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title={title}
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
        onBack={onBack}
        backTitle="Back to Projects"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {Array.isArray(sectionTabs) && sectionTabs.length
            ? sectionTabs.map((tab) => (
                <PeriodChip
                  key={tab.id}
                  label={tab.label}
                  active={activeSection === tab.id}
                  isDark={isDark}
                  onClick={() => onSectionChange?.(tab.id)}
                />
              ))
            : null}
          {periodMode === "quarter" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PeriodChip
                label="Prev"
                active={false}
                isDark={isDark}
                onClick={() => setQuarterIndex((i) => i - 1)}
              />
              <span style={{ ...type.body, fontWeight: 600, color: t.title, padding: "0 4px" }}>
                {selectedQuarter.label}
              </span>
              <PeriodChip
                label="Next"
                active={false}
                isDark={isDark}
                disabled={quarterIndex >= currentQuarter}
                onClick={() => setQuarterIndex((i) => Math.min(currentQuarter, i + 1))}
              />
            </div>
          ) : (
            ROLLING_PERIOD_OPTIONS.map((opt) => (
              <PeriodChip
                key={opt.days}
                label={opt.label}
                active={days === opt.days}
                isDark={isDark}
                onClick={() => setDays(opt.days)}
              />
            ))
          )}
          {headerExtra}
          <RibbonLabeledButton theme={t} icon="link" label="Refresh" onClick={load} disabled={loading} />
          {typeof onOpenEmailStudio === "function" ? (
            <RibbonLabeledButton theme={t} icon="mail" label="Email Studio" onClick={onOpenEmailStudio} />
          ) : null}
        </div>
      </PageHeader>

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ ...type.body, color: t.subtle, padding: "48px 0", textAlign: "center" }}>Loading {title.toLowerCase()}…</div>
        ) : error ? (
          <div style={{ ...type.body, color: t.lost || "#B42318", padding: "24px 0" }}>{error}</div>
        ) : overview ? (
          <>
            {overview.anyDemo && !overview.anyLive ? (
              <div
                style={{
                  ...type.body,
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: isDark ? "#2A2418" : "#FFF7ED",
                  color: isDark ? "#FBBF24" : "#92400E",
                  border: `1px solid ${isDark ? "#854D0E" : "#FCD34D"}`,
                }}
              >
                Showing sample data until platform API keys are configured in `.env`. Live channels will replace demo panels automatically.
              </div>
            ) : null}

            {showSummary ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "stretch" }}>
              <StatPill isDark={isDark} label="Total reach" value={formatMediaNumber(summary?.totalReach)} accent="#8FB0C8" />
              <StatPill isDark={isDark} label="Total clicks / sessions" value={formatMediaNumber(summary?.totalClicks)} accent="#2A9D8F" />
              <StatPill isDark={isDark} label="Website sessions" value={formatMediaNumber(summary?.totalSessions)} accent="#2A9D8F" />
              <StatPill isDark={isDark} label="Social engagement" value={formatMediaNumber(summary?.totalEngagement)} accent="#C13584" />
              <StatPill
                isDark={isDark}
                label="Booked meetings"
                value={formatMediaNumber(summary?.totalMeetings ?? overview?.meetings?.total)}
                accent="#2A9D8F"
              />
              {summaryExtras || null}
            </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
                gap: 16,
              }}
            >
              {(channelKeys || MEDIA_CHANNEL_ORDER).map((key) => (
                channels[key] ? <ChannelPanel key={key} channel={channels[key]} isDark={isDark} /> : null
              ))}
            </div>

            {children ? <div style={{ marginTop: 20 }}>{children}</div> : null}

            <p style={{ ...type.body, color: t.subtle, marginTop: 20, fontSize: 12 }}>
              Period: {periodMode === "quarter" ? selectedQuarter.label : overview.period?.label || `Last ${days} days`}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
