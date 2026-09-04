import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fontSans, getAppTheme, pageShellStyle } from "./appTheme.js";
import { PageHeader, RibbonLabeledButton } from "./appIcons.jsx";
import { POST_PLATFORMS, postPlatform } from "../shared/campaignPosting.js";
import {
  SOCIAL_CAMPAIGN_GOALS,
  campaignDestinationUrl,
  campaignThemePathLabel,
  campaignTrackingUrl,
  emptySocialCampaign,
  liveCampaignStats,
  slugFromCampaignName,
} from "../shared/socialCampaigns.js";
import { meetingsForCampaign } from "../shared/meetingBookings.js";
import {
  createSocialCampaign,
  deleteSocialCampaign,
  fetchSocialCampaigns,
  updateSocialCampaign,
} from "./socialCampaignsApi.js";
import { fetchMarketingSettings } from "./marketingApi.js";

const STATUS_LABEL = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed" };
const GOAL_LABEL = Object.fromEntries(SOCIAL_CAMPAIGN_GOALS.map((g) => [g.id, g.label]));

function inputStyle(isDark) {
  const t = getAppTheme(isDark);
  return {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg || t.headBg,
    color: t.title,
    fontSize: 13,
    fontFamily: fontSans,
    width: "100%",
    boxSizing: "border-box",
  };
}

function Field({ label, children, isDark, hint }) {
  const t = getAppTheme(isDark);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.subtle }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: t.subtle, lineHeight: 1.35 }}>{hint}</span> : null}
    </label>
  );
}

function chipBtn(t, active) {
  return {
    padding: "7px 11px",
    borderRadius: 8,
    border: `1px solid ${active ? t.title : t.border}`,
    background: active ? (t.inputBg || t.headBg) : t.panel,
    color: t.title,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}

function StatTile({ label, value, isDark, accent }) {
  const t = getAppTheme(isDark);
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: t.headBg,
        border: `1px solid ${t.border}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: t.subtle, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || t.title, fontFamily: fontSans }}>{value}</div>
    </div>
  );
}

export default function SocialCampaignsPage({ isDark, userName, userEmail, onBack, onOpenAnalytics }) {
  const t = getAppTheme(isDark);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [meetingSettings, setMeetingSettings] = useState(null);
  const [draft, setDraft] = useState(() => emptySocialCampaign());
  const [editingId, setEditingId] = useState(null);
  const [mode, setMode] = useState("list"); // list | wizard | detail
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [social, meetings] = await Promise.all([
        fetchSocialCampaigns(),
        fetchMarketingSettings().catch(() => null),
      ]);
      setCampaigns(social.campaigns || []);
      setMeetingSettings(meetings);
    } catch (err) {
      setError(err.message || "Could not load social campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showFlash(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 2200);
  }

  function startNew() {
    setEditingId(null);
    setDraft(emptySocialCampaign());
    setStep(1);
    setSelectedId(null);
    setMode("wizard");
  }

  function startEdit(row) {
    setEditingId(row.id);
    setDraft({
      ...emptySocialCampaign(),
      ...row,
      platforms: [...(row.platforms || ["meta", "linkedin"])],
      goal: row.goal === "conversions" ? "conversions" : "visits",
      trackSlug: row.trackSlug || slugFromCampaignName(row.name),
      stats: { ...emptySocialCampaign().stats, ...(row.stats || {}) },
    });
    setStep(1);
    setSelectedId(row.id);
    setMode("wizard");
  }

  function openDetail(row) {
    setSelectedId(row.id);
    setMode("detail");
  }

  function backToList() {
    setMode("list");
    setEditingId(null);
    setSelectedId(null);
    setDraft(emptySocialCampaign());
    setStep(1);
  }

  function togglePlatform(key) {
    setDraft((d) => {
      const set = new Set(d.platforms);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      const platforms = [...set];
      return { ...d, platforms: platforms.length ? platforms : [key] };
    });
  }

  async function copyText(text, okMsg) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showFlash(okMsg || "Copied");
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  function canAdvanceFromStep1() {
    if (!draft.name.trim()) {
      window.alert("Give the campaign a name (e.g. Agriculture).");
      return false;
    }
    if (!draft.startDate || !draft.endDate) {
      window.alert("Set a start and end date.");
      return false;
    }
    if (draft.endDate < draft.startDate) {
      window.alert("End date must be on or after the start date.");
      return false;
    }
    if (draft.goal === "conversions" && !meetingSettings?.meetingLinks?.social) {
      window.alert("Set a social meeting booking URL in Marketing Report → Overview before running a conversions campaign.");
      return false;
    }
    return true;
  }

  async function save({ activate = false } = {}) {
    if (!canAdvanceFromStep1()) return false;
    setBusy(true);
    try {
      const payload = {
        ...draft,
        trackSlug: slugFromCampaignName(draft.name),
        status: activate ? "active" : draft.status || "draft",
      };
      let saved;
      if (editingId) saved = await updateSocialCampaign(editingId, payload);
      else saved = await createSocialCampaign(payload);
      const id = saved?.campaign?.id || editingId;
      await load();
      setEditingId(id || null);
      if (id) {
        setSelectedId(id);
        setMode("detail");
      } else {
        backToList();
      }
      showFlash(activate ? "Campaign live — paste the tracking link in your posts" : "Campaign saved");
      return true;
    } catch (err) {
      window.alert(err.message || "Could not save campaign");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this social campaign?")) return;
    setBusy(true);
    try {
      await deleteSocialCampaign(id);
      await load();
      backToList();
      showFlash("Campaign deleted");
    } catch (err) {
      window.alert(err.message || "Could not delete campaign");
    } finally {
      setBusy(false);
    }
  }

  const selected = useMemo(
    () => campaigns.find((c) => c.id === selectedId) || null,
    [campaigns, selectedId],
  );

  const previewCampaign = useMemo(
    () => ({
      ...draft,
      trackSlug: slugFromCampaignName(draft.name || "campaign"),
    }),
    [draft],
  );

  const previewTrackUrl = campaignTrackingUrl(previewCampaign);
  const previewDestination = campaignDestinationUrl(previewCampaign, meetingSettings?.meetingLinks);
  const previewTheme = campaignThemePathLabel(previewCampaign);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title="Social Campaigns"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
        onBack={mode === "list" ? onBack : backToList}
        backTitle={mode === "list" ? "Back to Projects" : "Back to campaigns"}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {flash ? <span style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>{flash}</span> : null}
          {mode === "list" ? (
            <RibbonLabeledButton theme={t} icon="plus" label="New campaign" onClick={startNew} disabled={busy || loading} />
          ) : null}
          {typeof onOpenAnalytics === "function" ? (
            <RibbonLabeledButton theme={t} icon="chart" label="Marketing report" onClick={onOpenAnalytics} />
          ) : null}
        </div>
      </PageHeader>

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ color: t.subtle, padding: "40px 0", textAlign: "center", fontSize: 14 }}>Loading…</div>
        ) : error ? (
          <div style={{ color: t.errorText, padding: "24px 0" }}>{error}</div>
        ) : mode === "wizard" ? (
          <section style={{ maxWidth: 560, margin: "0 auto", background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[
                { id: 1, label: "Setup" },
                { id: 2, label: "Tracking link" },
              ].map((s) => (
                <div
                  key={s.id}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    background: step === s.id ? t.accent : t.headBg,
                    color: step === s.id ? t.accentText : t.subtle,
                    border: `1px solid ${step === s.id ? t.accent : t.border}`,
                  }}
                >
                  {s.id}. {s.label}
                </div>
              ))}
            </div>

            {step === 1 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editingId ? "Edit campaign" : "New campaign"}</h2>
                <p style={{ margin: 0, fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
                  Name it after the theme (e.g. Agriculture). You’ll get one tracking link to paste in Meta and LinkedIn — same link for every platform.
                </p>
                <Field label="Campaign name" isDark={isDark} hint={draft.name.trim() ? `Theme path: ${previewTheme}` : "Becomes the track slug, e.g. Agriculture → /r/agriculture"}>
                  <input
                    style={inputStyle(isDark)}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Agriculture"
                    autoFocus
                  />
                </Field>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>Campaign goal</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {SOCIAL_CAMPAIGN_GOALS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, goal: g.id })}
                        style={{
                          ...chipBtn(t, draft.goal === g.id),
                          textAlign: "left",
                          padding: "12px 14px",
                          display: "grid",
                          gap: 4,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{g.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: t.subtle, lineHeight: 1.35 }}>{g.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>Platforms (where you’ll post)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {POST_PLATFORMS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => togglePlatform(p.key)}
                        style={chipBtn(t, draft.platforms.includes(p.key))}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="Start date" isDark={isDark}>
                    <input style={inputStyle(isDark)} type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
                  </Field>
                  <Field label="End date" isDark={isDark}>
                    <input style={inputStyle(isDark)} type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={backToList} style={chipBtn(t)}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canAdvanceFromStep1()) setStep(2);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: t.accent,
                      color: t.accentText,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: fontSans,
                    }}
                  >
                    Next: tracking link
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Your tracking link</h2>
                <p style={{ margin: 0, fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
                  Paste this one link in every post for <strong style={{ color: t.title }}>{draft.name || "this campaign"}</strong>.
                  Clicks are counted here, then visitors are sent to{" "}
                  {draft.goal === "conversions" ? "your meeting booking page" : "jantaus.com"}.
                </p>

                <div style={{ padding: 14, borderRadius: 10, background: t.headBg, border: `1px solid ${t.border}`, display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.subtle, marginBottom: 4 }}>Theme</div>
                    <div style={{ fontWeight: 700 }}>{previewTheme}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.subtle, marginBottom: 4 }}>Paste this link in Meta / LinkedIn</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={{ ...inputStyle(isDark), flex: 1 }} readOnly value={previewTrackUrl} />
                      <button type="button" onClick={() => copyText(previewTrackUrl, "Tracking link copied")} style={chipBtn(t)}>
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.subtle, marginBottom: 4 }}>Forwards to</div>
                    <div style={{ fontSize: 13, wordBreak: "break-all" }}>{previewDestination}</div>
                    <div style={{ fontSize: 11, color: t.subtle, marginTop: 4 }}>
                      Goal: {GOAL_LABEL[draft.goal] || draft.goal}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setStep(1)} style={chipBtn(t)} disabled={busy}>Back</button>
                  <button type="button" disabled={busy} onClick={() => save({ activate: false })} style={chipBtn(t)}>
                    Save as draft
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => save({ activate: true })}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: t.accent,
                      color: t.accentText,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: fontSans,
                    }}
                  >
                    Activate campaign
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : mode === "detail" && selected ? (
          <CampaignDetail
            isDark={isDark}
            campaign={selected}
            meetingSettings={meetingSettings}
            onEdit={() => startEdit(selected)}
            onDelete={() => remove(selected.id)}
            onCopyTrack={() =>
              copyText(campaignTrackingUrl(selected), "Tracking link copied — paste in your posts")
            }
            busy={busy}
          />
        ) : campaigns.length === 0 ? (
          <div
            style={{
              minHeight: "55vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              textAlign: "center",
              padding: 24,
            }}
          >
            <button
              type="button"
              onClick={startNew}
              aria-label="Add social campaign"
              style={{
                width: 88,
                height: 88,
                borderRadius: 24,
                border: `1px dashed ${t.border}`,
                background: t.panel,
                color: t.title,
                fontSize: 40,
                fontWeight: 300,
                cursor: "pointer",
                boxShadow: isDark ? "none" : "0 8px 28px rgba(47,59,76,0.08)",
              }}
            >
              +
            </button>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Add a social campaign</div>
              <p style={{ margin: 0, fontSize: 14, color: t.subtle, maxWidth: 380, lineHeight: 1.45 }}>
                Create one tracking link per campaign (e.g. Agriculture). Same link works on Meta and LinkedIn.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
            <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>
              One tracking link per campaign. Visits → homepage · Conversions → booking page.
            </p>
            {campaigns.map((c) => {
              const meetings = meetingsForCampaign(meetingSettings, c.id);
              const live = liveCampaignStats(c, meetings);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openDetail(c)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    padding: 16,
                    background: t.panel,
                    cursor: "pointer",
                    color: t.title,
                    fontFamily: fontSans,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                        {STATUS_LABEL[c.status] || c.status} · {GOAL_LABEL[c.goal] || "Visits"} · {campaignThemePathLabel(c)} · {c.startDate} → {c.endDate}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexShrink: 0, fontSize: 12, color: t.subtle }}>
                      <span><strong style={{ color: t.title }}>{live.clicks}</strong> clicks</span>
                      {c.goal === "conversions" ? (
                        <span><strong style={{ color: "#2A9D8F" }}>{live.meetings}</strong> meetings</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={startNew}
              style={{
                border: `1px dashed ${t.border}`,
                borderRadius: 12,
                padding: 18,
                background: "transparent",
                color: t.subtle,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: fontSans,
              }}
            >
              + New campaign
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function CampaignDetail({ isDark, campaign, meetingSettings, onEdit, onDelete, onCopyTrack, busy }) {
  const t = getAppTheme(isDark);
  const meetings = meetingsForCampaign(meetingSettings, campaign.id);
  const live = liveCampaignStats(campaign, meetings);
  const trackUrl = campaignTrackingUrl(campaign);
  const destination = campaignDestinationUrl(campaign, meetingSettings?.meetingLinks);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{campaign.name}</h2>
            <div style={{ fontSize: 13, color: t.subtle, marginTop: 4 }}>
              {STATUS_LABEL[campaign.status] || campaign.status} · {GOAL_LABEL[campaign.goal] || "Visits"} ·{" "}
              {(campaign.platforms || []).map((p) => postPlatform(p)?.label || p).join(", ")} · {campaign.startDate} → {campaign.endDate}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={onEdit} style={chipBtn(t)} disabled={busy}>Edit</button>
            <button type="button" onClick={onDelete} style={{ ...chipBtn(t), color: t.errorText }} disabled={busy}>Delete</button>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: t.subtle, marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Live stats
        </div>
        <div style={{ display: "grid", gridTemplateColumns: campaign.goal === "conversions" ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 16 }}>
          <StatTile isDark={isDark} label="Tracked clicks" value={live.clicks} accent="#0A66C2" />
          {campaign.goal === "conversions" ? (
            <StatTile isDark={isDark} label="Meetings booked" value={live.meetings} accent="#2A9D8F" />
          ) : null}
        </div>

        <Field
          label="Tracking link (same for Meta & LinkedIn)"
          isDark={isDark}
          hint={`Theme ${campaignThemePathLabel(campaign)} · forwards to ${destination}`}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...inputStyle(isDark), flex: 1 }} readOnly value={trackUrl} />
            <button type="button" onClick={onCopyTrack} style={chipBtn(t)}>Copy</button>
          </div>
        </Field>
      </section>
    </div>
  );
}
