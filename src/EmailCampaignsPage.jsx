import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fontSans, getAppTheme, pageShellStyle } from "./appTheme.js";
import { PageHeader, RibbonLabeledButton } from "./appIcons.jsx";
import {
  compileEmailHtml,
  copyRichHtmlToClipboard,
  compilePlainText,
} from "./email-studio/lib/compile.js";
import {
  applyPlaceholdersToDoc,
  clientPlaceholderVars,
} from "../shared/emailCampaignPlaceholders.js";
import {
  fetchEmailClients,
  saveEmailClients,
  fetchEmailAutomations,
  createEmailAutomation,
  updateEmailAutomation,
  deleteEmailAutomation,
  runEmailAutomation,
  processDueEmailAutomations,
  fetchEmailSendQueue,
  patchEmailQueueItem,
  fetchEmailStudioStore,
} from "./emailStudioApi.js";

const TABS = [
  { id: "clients", label: "Clients" },
  { id: "campaigns", label: "Campaigns" },
  { id: "queue", label: "Send queue" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

function newClientDraft() {
  return { firstName: "", name: "", email: "", company: "", notes: "" };
}

function newAutomationDraft(sender = {}) {
  return {
    name: "",
    templateId: "",
    subject: "",
    preheader: "",
    clientIds: [],
    status: "draft",
    schedule: { enabled: false, frequency: "once", time: "09:00", weekday: 1 },
    sender: {
      name: sender.name || "",
      title: sender.title || "",
      email: sender.email || "",
      calendarLink: "",
    },
  };
}

function Panel({ isDark, title, subtitle, children, headerAside }) {
  const t = getAppTheme(isDark);
  return (
    <section
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.18)" : "0 2px 12px rgba(47,59,76,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: t.title }}>{title}</h2>
          {subtitle ? <p style={{ margin: "4px 0 0", fontSize: 13, color: t.subtle }}>{subtitle}</p> : null}
        </div>
        {headerAside}
      </div>
      {children}
    </section>
  );
}

function TabBar({ isDark, tab, onTab }) {
  const t = getAppTheme(isDark);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTab(item.id)}
          style={{
            border: `1px solid ${tab === item.id ? t.accent : t.border}`,
            background: tab === item.id ? (isDark ? "#1A3048" : "#E8F2FC") : t.headBg,
            color: tab === item.id ? t.accent : t.title,
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: fontSans,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, isDark }) {
  const t = getAppTheme(isDark);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.subtle }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

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

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function EmailCampaignsPage({
  isDark,
  userName,
  userEmail,
  accountKey,
  onBack,
  onOpenEmailStudio,
  onOpenEmailTemplate,
}) {
  const t = getAppTheme(isDark);
  const [tab, setTab] = useState("clients");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clients, setClients] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [queue, setQueue] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clientDraft, setClientDraft] = useState(newClientDraft());
  const [campaignDraft, setCampaignDraft] = useState(() => newAutomationDraft({ name: userName, email: userEmail }));
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const senderDefaults = useMemo(
    () => ({ name: userName || "", email: userEmail || "", title: "", calendarLink: "" }),
    [userName, userEmail],
  );

  const templateOptions = useMemo(
    () =>
      templates
        .filter((tpl) => tpl.id)
        .map((tpl) => ({ id: tpl.id, label: tpl.title || tpl.id, kind: tpl.kind || "custom" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [templates],
  );

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  const showFlash = useCallback((msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 2200);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await processDueEmailAutomations().catch(() => {});
      const [clientRes, autoRes, queueRes, store] = await Promise.all([
        fetchEmailClients(),
        fetchEmailAutomations(),
        fetchEmailSendQueue(),
        fetchEmailStudioStore(accountKey).catch(() => ({ templates: [] })),
      ]);
      setClients(clientRes.clients || []);
      setAutomations(autoRes.automations || []);
      setQueue(queueRes.queue || []);
      setTemplates(Array.isArray(store?.templates) ? store.templates : []);
    } catch (err) {
      setError(err.message || "Could not load email campaigns");
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function persistClients(next) {
    setBusy(true);
    try {
      const data = await saveEmailClients(next);
      setClients(data.clients || next);
      showFlash("Clients saved");
    } catch (err) {
      window.alert(err.message || "Could not save clients");
    } finally {
      setBusy(false);
    }
  }

  function handleAddClient(e) {
    e.preventDefault();
    const email = clientDraft.email.trim();
    if (!email) {
      window.alert("Email is required.");
      return;
    }
    const row = {
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: clientDraft.firstName.trim(),
      name: clientDraft.name.trim() || clientDraft.firstName.trim(),
      email,
      company: clientDraft.company.trim(),
      notes: clientDraft.notes.trim(),
      tags: [],
      createdAt: new Date().toISOString(),
    };
    persistClients([row, ...clients]);
    setClientDraft(newClientDraft());
  }

  function handleRemoveClient(id) {
    if (!window.confirm("Remove this client?")) return;
    persistClients(clients.filter((c) => c.id !== id));
  }

  function startNewCampaign() {
    setEditingCampaignId(null);
    setCampaignDraft(newAutomationDraft(senderDefaults));
    setTab("campaigns");
  }

  function startEditCampaign(auto) {
    setEditingCampaignId(auto.id);
    setCampaignDraft({
      name: auto.name || "",
      templateId: auto.templateId || "",
      subject: auto.subject || "",
      preheader: auto.preheader || "",
      clientIds: [...(auto.clientIds || [])],
      status: auto.status || "draft",
      schedule: {
        enabled: Boolean(auto.schedule?.enabled),
        frequency: auto.schedule?.frequency || "once",
        time: auto.schedule?.time || "09:00",
        weekday: auto.schedule?.weekday ?? 1,
        nextRunAt: auto.schedule?.nextRunAt || null,
      },
      sender: { ...senderDefaults, ...(auto.sender || {}) },
    });
    setTab("campaigns");
  }

  async function saveCampaign(e) {
    e.preventDefault();
    if (!campaignDraft.name.trim()) {
      window.alert("Campaign name is required.");
      return;
    }
    if (!campaignDraft.templateId) {
      window.alert("Pick an Email Studio template.");
      return;
    }
    if (!campaignDraft.clientIds.length) {
      window.alert("Select at least one client.");
      return;
    }
    setBusy(true);
    try {
      if (editingCampaignId) {
        await updateEmailAutomation(editingCampaignId, campaignDraft);
      } else {
        await createEmailAutomation(campaignDraft);
      }
      await loadAll();
      setEditingCampaignId(null);
      setCampaignDraft(newAutomationDraft(senderDefaults));
      showFlash("Campaign saved");
    } catch (err) {
      window.alert(err.message || "Could not save campaign");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunCampaign(id) {
    setBusy(true);
    try {
      const res = await runEmailAutomation(id);
      await loadAll();
      showFlash(`Queued ${res.count || 0} send${res.count === 1 ? "" : "s"}`);
      if ((res.count || 0) > 0) setTab("queue");
    } catch (err) {
      window.alert(err.message || "Could not run campaign");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCampaign(auto, nextStatus) {
    setBusy(true);
    try {
      await updateEmailAutomation(auto.id, { ...auto, status: nextStatus });
      await loadAll();
      showFlash(nextStatus === "active" ? "Automation active" : "Automation paused");
    } catch (err) {
      window.alert(err.message || "Could not update campaign");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCampaign(id) {
    if (!window.confirm("Delete this campaign?")) return;
    setBusy(true);
    try {
      await deleteEmailAutomation(id);
      if (editingCampaignId === id) {
        setEditingCampaignId(null);
        setCampaignDraft(newAutomationDraft(senderDefaults));
      }
      await loadAll();
      showFlash("Campaign deleted");
    } catch (err) {
      window.alert(err.message || "Could not delete campaign");
    } finally {
      setBusy(false);
    }
  }

  async function compileQueueItem(item) {
    const template = templates.find((tpl) => tpl.id === item.templateId);
    if (!template?.doc) throw new Error("Template not found — open Email Studio and save the template first.");
    const automation = automations.find((a) => a.id === item.automationId);
    const sender = automation?.sender || senderDefaults;
    const vars = clientPlaceholderVars(
      {
        firstName: item.firstName,
        name: item.clientName,
        company: item.company,
        email: item.clientEmail,
      },
      sender,
    );
    const doc = applyPlaceholdersToDoc(
      {
        ...template.doc,
        subject: item.subject || template.doc.subject || "",
        preheader: item.preheader || template.doc.preheader || "",
      },
      vars,
    );
    return { doc, html: compileEmailHtml(doc, { absoluteLogoOrigin: window.location.origin }) };
  }

  async function handleCopyQueueItem(item) {
    setBusy(true);
    try {
      const { doc, html } = await compileQueueItem(item);
      await copyRichHtmlToClipboard(html, compilePlainText(doc));
      showFlash(`Copied for ${item.clientEmail}`);
    } catch (err) {
      window.alert(err.message || "Could not copy email");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueStatus(item, status) {
    setBusy(true);
    try {
      await patchEmailQueueItem(item.id, { status });
      await loadAll();
    } catch (err) {
      window.alert(err.message || "Could not update queue");
    } finally {
      setBusy(false);
    }
  }

  function toggleClientInDraft(clientId) {
    setCampaignDraft((d) => {
      const set = new Set(d.clientIds);
      if (set.has(clientId)) set.delete(clientId);
      else set.add(clientId);
      return { ...d, clientIds: [...set] };
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title="Email Campaigns"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
        onBack={onBack}
        backTitle="Back to Projects"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {flash ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>{flash}</span>
          ) : null}
          <RibbonLabeledButton theme={t} icon="link" label="Refresh" onClick={loadAll} disabled={loading || busy} />
          <RibbonLabeledButton theme={t} icon="plus" label="New campaign" onClick={startNewCampaign} disabled={busy} />
          {typeof onOpenEmailStudio === "function" ? (
            <RibbonLabeledButton theme={t} icon="mail" label="Email Studio" onClick={onOpenEmailStudio} />
          ) : null}
        </div>
      </PageHeader>

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        <div style={{ marginBottom: 16 }}>
          <TabBar isDark={isDark} tab={tab} onTab={setTab} />
        </div>

        {loading ? (
          <div style={{ color: t.subtle, padding: "40px 0", textAlign: "center", fontSize: 14 }}>Loading…</div>
        ) : error ? (
          <div style={{ color: t.lost || "#B42318", padding: "24px 0" }}>{error}</div>
        ) : (
          <>
            {tab === "clients" ? (
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(280px, 360px) 1fr" }}>
                <Panel isDark={isDark} title="Add client" subtitle="Contacts receive personalized sends from your campaigns.">
                  <form onSubmit={handleAddClient} style={{ display: "grid", gap: 10 }}>
                    <Field label="First name" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={clientDraft.firstName}
                        onChange={(e) => setClientDraft({ ...clientDraft, firstName: e.target.value })}
                        placeholder="Alex"
                      />
                    </Field>
                    <Field label="Full name" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={clientDraft.name}
                        onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })}
                        placeholder="Alex Morgan"
                      />
                    </Field>
                    <Field label="Email" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        type="email"
                        required
                        value={clientDraft.email}
                        onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })}
                        placeholder="alex@company.com"
                      />
                    </Field>
                    <Field label="Company" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={clientDraft.company}
                        onChange={(e) => setClientDraft({ ...clientDraft, company: e.target.value })}
                        placeholder="Acme Data"
                      />
                    </Field>
                    <button
                      type="submit"
                      disabled={busy}
                      style={{
                        marginTop: 4,
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: t.accent,
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: fontSans,
                      }}
                    >
                      Add client
                    </button>
                  </form>
                </Panel>

                <Panel
                  isDark={isDark}
                  title={`Client list (${clients.length})`}
                  subtitle="Used for {{FirstName}} and {{Company}} merge fields."
                >
                  {clients.length ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ color: t.subtle, textAlign: "left" }}>
                            <th style={{ padding: "8px 6px" }}>Name</th>
                            <th style={{ padding: "8px 6px" }}>Email</th>
                            <th style={{ padding: "8px 6px" }}>Company</th>
                            <th style={{ padding: "8px 6px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {clients.map((c) => (
                            <tr key={c.id} style={{ borderTop: `1px solid ${t.border}` }}>
                              <td style={{ padding: "10px 6px" }}>{c.name || c.firstName || "—"}</td>
                              <td style={{ padding: "10px 6px" }}>{c.email}</td>
                              <td style={{ padding: "10px 6px" }}>{c.company || "—"}</td>
                              <td style={{ padding: "10px 6px", textAlign: "right" }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClient(c.id)}
                                  style={{ background: "transparent", border: "none", color: t.lost || "#B42318", cursor: "pointer", fontWeight: 600 }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: t.subtle, fontSize: 13, margin: 0 }}>No clients yet. Add contacts to target in campaigns.</p>
                  )}
                </Panel>
              </div>
            ) : null}

            {tab === "campaigns" ? (
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(320px, 420px) 1fr" }}>
                <Panel
                  isDark={isDark}
                  title={editingCampaignId ? "Edit campaign" : "New campaign"}
                  subtitle="Pick a template, choose clients, and schedule or run now."
                >
                  <form onSubmit={saveCampaign} style={{ display: "grid", gap: 10 }}>
                    <Field label="Campaign name" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={campaignDraft.name}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft, name: e.target.value })}
                        placeholder="Q3 data center outreach"
                      />
                    </Field>
                    <Field label="Email template" isDark={isDark}>
                      <select
                        style={inputStyle(isDark)}
                        value={campaignDraft.templateId}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft, templateId: e.target.value })}
                      >
                        <option value="">Select template…</option>
                        {templateOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Subject override" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={campaignDraft.subject}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft, subject: e.target.value })}
                        placeholder="Uses template subject if blank"
                      />
                    </Field>
                    <Field label="Inbox preview override" isDark={isDark}>
                      <input
                        style={inputStyle(isDark)}
                        value={campaignDraft.preheader}
                        onChange={(e) => setCampaignDraft({ ...campaignDraft, preheader: e.target.value })}
                        placeholder="Optional preheader"
                      />
                    </Field>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>Sender defaults</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          style={inputStyle(isDark)}
                          value={campaignDraft.sender.name}
                          onChange={(e) =>
                            setCampaignDraft({ ...campaignDraft, sender: { ...campaignDraft.sender, name: e.target.value } })
                          }
                          placeholder="Your name ({{YourName}})"
                        />
                        <input
                          style={inputStyle(isDark)}
                          value={campaignDraft.sender.title}
                          onChange={(e) =>
                            setCampaignDraft({ ...campaignDraft, sender: { ...campaignDraft.sender, title: e.target.value } })
                          }
                          placeholder="Title ({{YourTitle}})"
                        />
                        <input
                          style={inputStyle(isDark)}
                          value={campaignDraft.sender.email}
                          onChange={(e) =>
                            setCampaignDraft({ ...campaignDraft, sender: { ...campaignDraft.sender, email: e.target.value } })
                          }
                          placeholder="Email ({{YourEmail}})"
                        />
                        <input
                          style={inputStyle(isDark)}
                          value={campaignDraft.sender.calendarLink}
                          onChange={(e) =>
                            setCampaignDraft({
                              ...campaignDraft,
                              sender: { ...campaignDraft.sender, calendarLink: e.target.value },
                            })
                          }
                          placeholder="Calendar link ({{CalendarLink}})"
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.subtle, marginBottom: 6 }}>
                        Clients ({campaignDraft.clientIds.length} selected)
                      </div>
                      <div
                        style={{
                          maxHeight: 160,
                          overflow: "auto",
                          border: `1px solid ${t.border}`,
                          borderRadius: 8,
                          padding: 8,
                          background: t.headBg,
                        }}
                      >
                        {clients.length ? (
                          clients.map((c) => (
                            <label
                              key={c.id}
                              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0", cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                checked={campaignDraft.clientIds.includes(c.id)}
                                onChange={() => toggleClientInDraft(c.id)}
                              />
                              <span>
                                {c.name || c.email}
                                {c.company ? ` · ${c.company}` : ""}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p style={{ margin: 0, color: t.subtle, fontSize: 12 }}>Add clients first.</p>
                        )}
                      </div>
                    </div>

                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: t.title }}>
                      <input
                        type="checkbox"
                        checked={campaignDraft.schedule.enabled}
                        onChange={(e) =>
                          setCampaignDraft({
                            ...campaignDraft,
                            schedule: { ...campaignDraft.schedule, enabled: e.target.checked },
                          })
                        }
                      />
                      Schedule automation
                    </label>

                    {campaignDraft.schedule.enabled ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <select
                          style={inputStyle(isDark)}
                          value={campaignDraft.schedule.frequency}
                          onChange={(e) =>
                            setCampaignDraft({
                              ...campaignDraft,
                              schedule: { ...campaignDraft.schedule, frequency: e.target.value },
                            })
                          }
                        >
                          <option value="once">Once</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                        {campaignDraft.schedule.frequency === "weekly" ? (
                          <select
                            style={inputStyle(isDark)}
                            value={campaignDraft.schedule.weekday}
                            onChange={(e) =>
                              setCampaignDraft({
                                ...campaignDraft,
                                schedule: { ...campaignDraft.schedule, weekday: Number(e.target.value) },
                              })
                            }
                          >
                            {WEEKDAYS.map((d, i) => (
                              <option key={d} value={i}>
                                {d}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          style={inputStyle(isDark)}
                          type="time"
                          value={campaignDraft.schedule.time}
                          onChange={(e) =>
                            setCampaignDraft({
                              ...campaignDraft,
                              schedule: { ...campaignDraft.schedule, time: e.target.value },
                            })
                          }
                        />
                      </div>
                    ) : null}

                    <select
                      style={inputStyle(isDark)}
                      value={campaignDraft.status}
                      onChange={(e) => setCampaignDraft({ ...campaignDraft, status: e.target.value })}
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active (runs on schedule)</option>
                      <option value="paused">Paused</option>
                    </select>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="submit"
                        disabled={busy}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: t.accent,
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: fontSans,
                        }}
                      >
                        Save campaign
                      </button>
                      {editingCampaignId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingCampaignId(null);
                            setCampaignDraft(newAutomationDraft(senderDefaults));
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 8,
                            border: `1px solid ${t.border}`,
                            background: "transparent",
                            color: t.title,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: fontSans,
                          }}
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </div>
                  </form>
                </Panel>

                <Panel isDark={isDark} title={`Automations (${automations.length})`} subtitle="Run now queues personalized sends. Active campaigns auto-run on schedule while this app is open.">
                  {automations.length ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {automations.map((auto) => {
                        const tpl = templateOptions.find((o) => o.id === auto.templateId);
                        return (
                          <article
                            key={auto.id}
                            style={{
                              border: `1px solid ${t.border}`,
                              borderRadius: 10,
                              padding: 14,
                              background: t.headBg,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{auto.name}</div>
                                <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                                  {STATUS_LABEL[auto.status] || auto.status} · {auto.clientIds?.length || 0} clients · {tpl?.label || "No template"}
                                </div>
                                {auto.schedule?.enabled ? (
                                  <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                                    {auto.schedule.frequency} at {auto.schedule.time}
                                    {auto.schedule.nextRunAt ? ` · next ${formatWhen(auto.schedule.nextRunAt)}` : ""}
                                  </div>
                                ) : null}
                                {auto.lastRunAt ? (
                                  <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>Last run {formatWhen(auto.lastRunAt)}</div>
                                ) : null}
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button type="button" onClick={() => handleRunCampaign(auto.id)} disabled={busy} style={chipBtn(t)}>
                                  Run now
                                </button>
                                {auto.status === "active" ? (
                                  <button type="button" onClick={() => handleToggleCampaign(auto, "paused")} disabled={busy} style={chipBtn(t)}>
                                    Pause
                                  </button>
                                ) : (
                                  <button type="button" onClick={() => handleToggleCampaign(auto, "active")} disabled={busy} style={chipBtn(t)}>
                                    Activate
                                  </button>
                                )}
                                <button type="button" onClick={() => startEditCampaign(auto)} disabled={busy} style={chipBtn(t)}>
                                  Edit
                                </button>
                                {auto.templateId && typeof onOpenEmailTemplate === "function" ? (
                                  <button type="button" onClick={() => onOpenEmailTemplate(auto.templateId)} style={chipBtn(t)}>
                                    Template
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCampaign(auto.id)}
                                  disabled={busy}
                                  style={{ ...chipBtn(t), color: t.lost || "#B42318" }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: t.subtle, fontSize: 13, margin: 0 }}>No campaigns yet. Create one to queue personalized sends for your clients.</p>
                  )}
                </Panel>
              </div>
            ) : null}

            {tab === "queue" ? (
              <Panel
                isDark={isDark}
                title={`Send queue (${pendingCount} pending)`}
                subtitle="Copy HTML for each client, paste into Gmail, then mark sent. Subject line must still be set manually in Gmail."
              >
                {queue.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 10,
                          padding: 14,
                          background: item.status === "pending" ? t.headBg : t.panel,
                          opacity: item.status === "pending" ? 1 : 0.72,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.clientName || item.clientEmail}</div>
                            <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                              {item.clientEmail}
                              {item.company ? ` · ${item.company}` : ""}
                            </div>
                            <div style={{ fontSize: 13, marginTop: 6 }}>{item.subject || "(uses template subject)"}</div>
                            <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                              {item.automationName} · {item.status} · {formatWhen(item.createdAt)}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                            {item.status === "pending" ? (
                              <>
                                <button type="button" disabled={busy} onClick={() => handleCopyQueueItem(item)} style={chipBtn(t)}>
                                  Copy HTML
                                </button>
                                <a
                                  href={`mailto:${encodeURIComponent(item.clientEmail)}?subject=${encodeURIComponent(item.subject || "")}`}
                                  style={{ ...chipBtn(t), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                                >
                                  Open Gmail
                                </a>
                                <button type="button" disabled={busy} onClick={() => handleQueueStatus(item, "sent")} style={chipBtn(t)}>
                                  Mark sent
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleQueueStatus(item, "skipped")}
                                  style={chipBtn(t)}
                                >
                                  Skip
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: t.subtle, fontSize: 13, margin: 0 }}>Queue is empty. Run a campaign to generate personalized sends.</p>
                )}
              </Panel>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function chipBtn(t) {
  return {
    padding: "7px 11px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.panel,
    color: t.title,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: fontSans,
  };
}
