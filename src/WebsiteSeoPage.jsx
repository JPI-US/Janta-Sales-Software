import React, { useCallback, useEffect, useState } from "react";
import {
  MEDIA_CHANNEL_WEBSITE,
  buildDemoChannel,
  formatMediaNumber,
  formatMediaPercent,
  getMediaPeriod,
} from "../shared/mediaMetrics.js";
import { fetchMediaOverview } from "./mediaApi.js";
import { fontSans, getAppTheme, pageShellStyle } from "./appTheme.js";
import { PageHeader, RibbonLabeledButton } from "./appIcons.jsx";
import { LineChart } from "./reportCharts.jsx";

export const SEO_KEYWORDS = [
  { term: "janta power", position: 4, change: "+1", volume: "880" },
  { term: "3d solar towers", position: 9, change: "+2", volume: "1.1K" },
  { term: "three-dimensional solar", position: 11, change: "+3", volume: "640" },
  { term: "more power less land", position: 7, change: "+2", volume: "320" },
  { term: "vertical solar commercial", position: 14, change: "0", volume: "490" },
  { term: "sun tracking solar tower", position: 16, change: "+1", volume: "410" },
];

export function WebsiteSeoExtras({ isDark }) {
  const t = getAppTheme(isDark);
  return (
    <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.title, fontFamily: fontSans }}>SEO</h2>
      <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
        Search terms that should land on Janta Power — vertically scaling, sun-tracking 3D solar towers. More Power. Less Land.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
        <thead>
          <tr style={{ color: t.subtle, textAlign: "left" }}>
            <th style={{ padding: "8px 6px" }}>Keyword</th>
            <th style={{ padding: "8px 6px" }}>Position</th>
            <th style={{ padding: "8px 6px" }}>Change</th>
            <th style={{ padding: "8px 6px" }}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {SEO_KEYWORDS.map((row) => (
            <tr key={row.term} style={{ borderTop: `1px solid ${t.border}` }}>
              <td style={{ padding: "10px 6px" }}>{row.term}</td>
              <td style={{ padding: "10px 6px" }}>{row.position}</td>
              <td style={{ padding: "10px 6px", color: row.change.startsWith("+") ? "#2A9D8F" : t.subtle }}>{row.change}</td>
              <td style={{ padding: "10px 6px" }}>{row.volume}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: "16px 0 0", fontSize: 13, color: t.subtle, lineHeight: 1.5 }}>
        On-page for <a href="https://jantaus.com/" target="_blank" rel="noreferrer" style={{ color: t.title }}>jantaus.com</a>: hero “More Power. Less Land.” · Contact Us CTA · proof (Munich Airport, Greentown Labs, DFW, PV Magazine) · 50% more energy, 3× power/unit area, up to 34% capacity factor vs traditional solar · sitemap and index for home + contact.
      </p>
    </section>
  );
}

function kpiValue(kpi) {
  if (!kpi) return "—";
  if (kpi.format === "percent") return formatMediaPercent(kpi.value);
  return formatMediaNumber(kpi.value);
}

export default function WebsiteSeoPage({ isDark, userName, userEmail, onBack }) {
  const t = getAppTheme(isDark);
  const [channel, setChannel] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMediaOverview({ days: 30 });
      setChannel(data.channels?.website || null);
      setDemo(Boolean(data.anyDemo && !data.anyLive));
    } catch {
      const period = getMediaPeriod(new Date(), { days: 30 });
      setChannel(buildDemoChannel(MEDIA_CHANNEL_WEBSITE, period));
      setDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = channel?.kpis || [];
  const trendSeries = channel?.trend?.length > 1 ? [{ label: "Sessions", points: channel.trend, color: "#2A9D8F" }] : [];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title="Website & SEO"
        subtitle={[userName, userEmail, "jantaus.com"].filter(Boolean).join(" · ")}
        onBack={onBack}
        backTitle="Back to Projects"
      >
        <a
          href="https://jantaus.com/"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.headBg,
            color: t.title,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            fontFamily: fontSans,
          }}
        >
          Open jantaus.com
        </a>
        <RibbonLabeledButton theme={t} icon="link" label="Refresh" onClick={load} disabled={loading} />
      </PageHeader>
      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {demo ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 10,
              background: isDark ? "#2A2418" : "#FFF7ED",
              color: isDark ? "#FBBF24" : "#92400E",
              border: `1px solid ${isDark ? "#854D0E" : "#FCD34D"}`,
              fontSize: 13,
              fontFamily: fontSans,
            }}
          >
            Sample website and SEO figures for jantaus.com until GA4 / Search Console are connected in `.env`.
          </div>
        ) : null}

        <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Website</h2>
          <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
            Traffic for <a href="https://jantaus.com/" target="_blank" rel="noreferrer" style={{ color: t.title, fontWeight: 600 }}>jantaus.com</a> — Janta Power, three-dimensional solar.
          </p>
          {loading ? (
            <p style={{ color: t.subtle, fontSize: 13 }}>Loading…</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                {kpis.map((kpi) => (
                  <div key={kpi.key} style={{ padding: "12px 14px", borderRadius: 10, background: t.headBg, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 12, color: t.subtle, marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#2A9D8F" }}>{kpiValue(kpi)}</div>
                  </div>
                ))}
              </div>
              {trendSeries.length ? <LineChart isDark={isDark} series={trendSeries} formatValue={formatMediaNumber} height={140} /> : null}
              {channel?.items?.length ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 8 }}>Top pages</div>
                  {channel.items.map((item, i) => (
                    <div key={item.title} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: i < channel.items.length - 1 ? `1px solid ${t.border}` : undefined, fontSize: 13 }}>
                      <span>{item.title}</span>
                      <span style={{ color: t.subtle }}>{item.metric}{item.secondary ? ` · ${item.secondary}` : ""}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>SEO</h2>
          <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
            Search terms that should land on Janta Power — vertically scaling, sun-tracking 3D solar towers. More Power. Less Land.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
            <thead>
              <tr style={{ color: t.subtle, textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Keyword</th>
                <th style={{ padding: "8px 6px" }}>Position</th>
                <th style={{ padding: "8px 6px" }}>Change</th>
                <th style={{ padding: "8px 6px" }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {SEO_KEYWORDS.map((row) => (
                <tr key={row.term} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: "10px 6px" }}>{row.term}</td>
                  <td style={{ padding: "10px 6px" }}>{row.position}</td>
                  <td style={{ padding: "10px 6px", color: row.change.startsWith("+") ? "#2A9D8F" : t.subtle }}>{row.change}</td>
                  <td style={{ padding: "10px 6px" }}>{row.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "16px 0 0", fontSize: 13, color: t.subtle, lineHeight: 1.5 }}>
            On-page for <a href="https://jantaus.com/" target="_blank" rel="noreferrer" style={{ color: t.title }}>jantaus.com</a>: hero “More Power. Less Land.” · Contact Us CTA · proof (Munich Airport, Greentown Labs, DFW, PV Magazine) · 50% more energy, 3× power/unit area, up to 34% capacity factor vs traditional solar · sitemap and index for home + contact.
          </p>
        </section>
      </main>
    </div>
  );
}
