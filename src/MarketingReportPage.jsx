import React, { useCallback, useEffect, useMemo, useState } from "react";
import MediaDashboard from "./MediaDashboard.jsx";
import {
  MEDIA_CHANNEL_EMAIL,
  MEDIA_CHANNEL_INSTAGRAM,
  MEDIA_CHANNEL_LINKEDIN,
  MEDIA_CHANNEL_ORDER,
  MEDIA_CHANNEL_WEBSITE,
} from "../shared/mediaMetrics.js";
import {
  MEETING_CHANNELS,
  bookingUrlForChannel,
  meetingsForCampaign,
  totalMeetings,
} from "../shared/meetingBookings.js";
import { fetchEmailAutomations } from "./emailStudioApi.js";
import { fetchSocialCampaigns } from "./socialCampaignsApi.js";
import { liveCampaignStats } from "../shared/socialCampaigns.js";
import { WebsiteSeoExtras } from "./WebsiteSeoPage.jsx";
import { fetchMarketingSettings, saveMarketingSettings } from "./marketingApi.js";
import { fontSans, getAppTheme } from "./appTheme.js";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "email", label: "Email" },
  { id: "social", label: "Social Media" },
  { id: "website", label: "Website" },
];

const CHANNELS_BY_SECTION = {
  overview: MEDIA_CHANNEL_ORDER,
  email: [MEDIA_CHANNEL_EMAIL],
  social: [MEDIA_CHANNEL_INSTAGRAM, MEDIA_CHANNEL_LINKEDIN],
  website: [MEDIA_CHANNEL_WEBSITE],
};

function panelStyle(t) {
  return {
    background: t.panel,
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: 20,
  };
}

function EmailCampaignTable({ isDark }) {
  const t = getAppTheme(isDark);
  const [automations, setAutomations] = useState([]);

  useEffect(() => {
    fetchEmailAutomations()
      .then((data) => setAutomations(data.automations || []))
      .catch(() => setAutomations([]));
  }, []);

  return (
    <section style={panelStyle(t)}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.title, fontFamily: fontSans }}>Campaigns</h2>
      <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
        Use the email meeting booking link in CTAs — a booked meeting counts as a conversion.
      </p>
      {automations.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
            <thead>
              <tr style={{ color: t.subtle, textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Campaign</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
                <th style={{ padding: "8px 6px" }}>Clients</th>
                <th style={{ padding: "8px 6px" }}>Schedule</th>
                <th style={{ padding: "8px 6px" }}>Last run</th>
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => (
                <tr key={a.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: "10px 6px", color: t.title }}>{a.name}</td>
                  <td style={{ padding: "10px 6px" }}>{a.status}</td>
                  <td style={{ padding: "10px 6px" }}>{a.clientIds?.length || 0}</td>
                  <td style={{ padding: "10px 6px" }}>
                    {a.schedule?.enabled ? `${a.schedule.frequency} at ${a.schedule.time}` : "Off"}
                  </td>
                  <td style={{ padding: "10px 6px" }}>{a.lastRunAt ? new Date(a.lastRunAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>No email campaigns yet.</p>
      )}
    </section>
  );
}

function SocialCampaignTable({ isDark, meetingSettings }) {
  const t = getAppTheme(isDark);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    fetchSocialCampaigns()
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]));
  }, []);

  return (
    <section style={panelStyle(t)}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.title, fontFamily: fontSans }}>Campaign performance</h2>
      <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
        Live tracked clicks and booked meetings by social campaign.
      </p>
      {campaigns.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: fontSans }}>
            <thead>
              <tr style={{ color: t.subtle, textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Campaign</th>
                <th style={{ padding: "8px 6px" }}>Goal</th>
                <th style={{ padding: "8px 6px" }}>Dates</th>
                <th style={{ padding: "8px 6px" }}>Clicks</th>
                <th style={{ padding: "8px 6px" }}>Meetings</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const live = liveCampaignStats(c, meetingsForCampaign(meetingSettings, c.id));
                return (
                  <tr key={c.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: "10px 6px", color: t.title }}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: t.subtle }}>{c.status}</div>
                    </td>
                    <td style={{ padding: "10px 6px" }}>{c.goal === "conversions" ? "Conversions" : "Visits"}</td>
                    <td style={{ padding: "10px 6px" }}>
                      {c.startDate} → {c.endDate}
                    </td>
                    <td style={{ padding: "10px 6px" }}>{live.clicks}</td>
                    <td style={{ padding: "10px 6px" }}>{c.goal === "conversions" ? live.meetings : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>No social campaigns yet. Create one under Social Campaigns.</p>
      )}
    </section>
  );
}

function MeetingLinksPanel({ isDark, settings, onSaved }) {
  const t = getAppTheme(isDark);
  const [links, setLinks] = useState({ email: "", social: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    setLinks({
      email: settings?.meetingLinks?.email || "",
      social: settings?.meetingLinks?.social || "",
      website: settings?.meetingLinks?.website || "",
    });
  }, [settings]);

  async function copyBooking(channel) {
    const url = bookingUrlForChannel(channel);
    try {
      await navigator.clipboard.writeText(url);
      setFlash(`Copied ${channel} booking tracker`);
      setTimeout(() => setFlash(""), 2000);
    } catch {
      window.prompt("Copy this booking tracker link:", url);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const next = await saveMarketingSettings(links);
      onSaved?.(next);
      setFlash("Meeting links saved");
      setTimeout(() => setFlash(""), 2000);
    } catch (err) {
      window.alert(err.message || "Could not save meeting links");
    } finally {
      setBusy(false);
    }
  }

  const meetings = settings?.meetings || {};
  const total = totalMeetings(meetings);

  return (
    <section style={{ ...panelStyle(t), marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.title, fontFamily: fontSans }}>
        Conversions = booked meetings
      </h2>
      <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
        Set your Calendly / HubSpot booking URLs per channel. Share the <strong style={{ color: t.title }}>tracker link</strong>{" "}
        (not the raw booking URL) in email, social, and website CTAs — each booking increments that channel and rolls into the combined marketing total.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ padding: "10px 14px", borderRadius: 10, background: t.headBg, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, color: t.subtle, fontWeight: 600 }}>Total meetings</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2A9D8F" }}>{total}</div>
        </div>
        {MEETING_CHANNELS.map((ch) => (
          <div key={ch.id} style={{ padding: "10px 14px", borderRadius: 10, background: t.headBg, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.subtle, fontWeight: 600 }}>{ch.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.title }}>{meetings[ch.id] || 0}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {MEETING_CHANNELS.map((ch) => (
          <div key={ch.id} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle }}>{ch.label} booking URL</div>
            <input
              value={links[ch.id] || ""}
              onChange={(e) => setLinks((prev) => ({ ...prev, [ch.id]: e.target.value }))}
              placeholder="https://calendly.com/your-team/..."
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.inputBg || t.headBg,
                color: t.title,
                fontSize: 13,
                fontFamily: fontSans,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ fontSize: 11, color: t.subtle }}>{bookingUrlForChannel(ch.id)}</code>
              <button
                type="button"
                onClick={() => copyBooking(ch.id)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.panel,
                  color: t.title,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: fontSans,
                }}
              >
                Copy tracker
              </button>
            </div>
            <div style={{ fontSize: 11, color: t.subtle }}>{ch.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: t.ctaBg,
            color: t.ctaText,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: fontSans,
          }}
        >
          Save meeting links
        </button>
        {flash ? <span style={{ fontSize: 13, fontWeight: 600, color: t.positive }}>{flash}</span> : null}
      </div>
    </section>
  );
}

export default function MarketingReportPage({
  isDark,
  userName,
  userEmail,
  onBack,
  onOpenEmailStudio,
  section = "overview",
  onSectionChange,
}) {
  const t = getAppTheme(isDark);
  const activeSection = SECTIONS.some((s) => s.id === section) ? section : "overview";
  const channelKeys = CHANNELS_BY_SECTION[activeSection] || MEDIA_CHANNEL_ORDER;
  const [meetingSettings, setMeetingSettings] = useState(null);

  const loadMeetings = useCallback(() => {
    fetchMarketingSettings()
      .then(setMeetingSettings)
      .catch(() => setMeetingSettings(null));
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const websiteLink = useMemo(
    () =>
      activeSection === "website" || activeSection === "overview" ? (
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
      ) : null,
    [activeSection, t.border, t.headBg, t.title],
  );

  return (
    <MediaDashboard
      isDark={isDark}
      userName={userName}
      userEmail={userEmail}
      onBack={onBack}
      title="Marketing Report"
      channelKeys={channelKeys}
      showSummary={activeSection === "overview"}
      periodMode="quarter"
      sectionTabs={SECTIONS}
      activeSection={activeSection}
      onSectionChange={onSectionChange}
      headerExtra={websiteLink}
      onOpenEmailStudio={activeSection === "email" || activeSection === "overview" ? onOpenEmailStudio : undefined}
    >
      {activeSection === "overview" ? (
        <MeetingLinksPanel isDark={isDark} settings={meetingSettings} onSaved={setMeetingSettings} />
      ) : null}
      {activeSection === "email" ? <EmailCampaignTable isDark={isDark} /> : null}
      {activeSection === "social" ? <SocialCampaignTable isDark={isDark} meetingSettings={meetingSettings} /> : null}
      {activeSection === "website" ? <WebsiteSeoExtras isDark={isDark} /> : null}
    </MediaDashboard>
  );
}
