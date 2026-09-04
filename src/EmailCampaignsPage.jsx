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
import { fetchMarketingSettings } from "./marketingApi.js";
import { bookingUrlForChannel } from "../shared/meetingBookings.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

const WIZARD_STEPS = [
  { id: 1, label: "Email" },
  { id: 2, label: "Schedule" },
  { id: 3, label: "Go live" },
];

function newClientDraft() {
  return { firstName: "", name: "", email: "", company: "" };
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
    posts: [],
    sender: {
      name: sender.name || "",
      title: sender.title || "",
      email: sender.email || "",
      calendarLink: sender.calendarLink || "",
    },
  };
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

function primaryBtn(t) {
  return {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: t.accent,
    color: t.accentText,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: fontSans,
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

function StepHeader({ step, isDark }) {
  const t = getAppTheme(isDark);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {WIZARD_STEPS.map((s) => (
        <div
          key={s.id}
          style={{
            flex: 1,
            padding: "8px 6px",
            borderRadius: 8,
            textAlign: "center",
            fontSize: 11,
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
  );
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
  const [mode, setMode] = useState("list"); // list | wizard | detail | people | queue
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clients, setClients] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [queue, setQueue] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [meetingLinks, setMeetingLinks] = useState(null);
  const [clientDraft, setClientDraft] = useState(newClientDraft());
  const [campaignDraft, setCampaignDraft] = useState(() => newAutomationDraft({ name: userName, email: userEmail }));
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);

  const senderDefaults = useMemo(() => {
    const emailMeeting = meetingLinks?.email || "";
    return {
      name: userName || "",
      email: userEmail || "",
      title: "",
      calendarLink: emailMeeting || bookingUrlForChannel("email"),
    };
  }, [userName, userEmail, meetingLinks]);

  const templateOptions = useMemo(
    () =>
      templates
        .filter((tpl) => tpl.id)
        .map((tpl) => ({ id: tpl.id, label: tpl.title || tpl.id }))
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
      const [clientRes, autoRes, queueRes, store, marketing] = await Promise.all([
        fetchEmailClients(),
        fetchEmailAutomations(),
        fetchEmailSendQueue(),
        fetchEmailStudioStore(accountKey).catch(() => ({ templates: [] })),
        fetchMarketingSettings().catch(() => null),
      ]);
      setClients(clientRes.clients || []);
      setAutomations(autoRes.automations || []);
      setQueue(queueRes.queue || []);
      setTemplates(Array.isArray(store?.templates) ? store.templates : []);
      setMeetingLinks(marketing?.meetingLinks || null);
    } catch (err) {
      setError(err.message || "Could not load email campaigns");
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function backToList() {
    setMode("list");
    setStep(1);
    setEditingCampaignId(null);
    setSelectedId(null);
    setCampaignDraft(newAutomationDraft(senderDefaults));
    setAddingPerson(false);
  }

  async function persistClients(next, { silent } = {}) {
    setBusy(true);
    try {
      const data = await saveEmailClients(next);
      setClients(data.clients || next);
      if (!silent) showFlash("People saved");
      return data.clients || next;
    } catch (err) {
      window.alert(err.message || "Could not save people");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(e) {
    e?.preventDefault?.();
    const email = clientDraft.email.trim();
    if (!email) {
      window.alert("Email is required.");
      return null;
    }
    const row = {
      id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      firstName: clientDraft.firstName.trim(),
      name: clientDraft.name.trim() || clientDraft.firstName.trim(),
      email,
      company: clientDraft.company.trim(),
      notes: "",
      tags: [],
      createdAt: new Date().toISOString(),
    };
    const next = await persistClients([row, ...clients], { silent: true });
    setClientDraft(newClientDraft());
    setAddingPerson(false);
    if (next) {
      setCampaignDraft((d) => ({ ...d, clientIds: [...new Set([...(d.clientIds || []), row.id])] }));
      showFlash("Person added");
    }
    return row;
  }

  function removePerson(id) {
    if (!window.confirm("Remove this person?")) return;
    persistClients(clients.filter((c) => c.id !== id));
    setCampaignDraft((d) => ({ ...d, clientIds: (d.clientIds || []).filter((x) => x !== id) }));
  }

  function startNewCampaign() {
    setEditingCampaignId(null);
    setCampaignDraft(newAutomationDraft(senderDefaults));
    setStep(1);
    setSelectedId(null);
    setMode("wizard");
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
      posts: [],
      sender: { ...senderDefaults, ...(auto.sender || {}) },
    });
    setStep(1);
    setSelectedId(auto.id);
    setMode("wizard");
  }

  function openDetail(auto) {
    setSelectedId(auto.id);
    setMode("detail");
  }

  function canStep1() {
    if (!campaignDraft.name.trim()) {
      window.alert("Give the campaign a name.");
      return false;
    }
    if (!campaignDraft.templateId) {
      window.alert("Pick an Email Studio template.");
      return false;
    }
    return true;
  }

  async function saveCampaign({ activate = false } = {}) {
    if (!canStep1()) return false;
    setBusy(true);
    try {
      const payload = {
        ...campaignDraft,
        posts: [],
        // People are attached after the campaign is laid out
        clientIds: editingCampaignId ? campaignDraft.clientIds || [] : [],
        status: activate ? "active" : campaignDraft.status || "draft",
        schedule: {
          ...campaignDraft.schedule,
          enabled: activate ? Boolean(campaignDraft.schedule?.enabled) : campaignDraft.schedule?.enabled,
        },
        sender: {
          ...senderDefaults,
          ...campaignDraft.sender,
          calendarLink: campaignDraft.sender?.calendarLink || senderDefaults.calendarLink,
        },
      };
      let saved;
      if (editingCampaignId) saved = await updateEmailAutomation(editingCampaignId, payload);
      else saved = await createEmailAutomation(payload);
      const id = saved?.automation?.id || editingCampaignId;
      showFlash(activate ? "Campaign ready — add people next" : "Campaign saved — add people next");
      await loadAll();
      if (id) {
        setSelectedId(id);
        setMode("detail");
      } else {
        backToList();
      }
      return true;
    } catch (err) {
      window.alert(err.message || "Could not save campaign");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCampaignPeople(campaign, nextClientIds) {
    setBusy(true);
    try {
      await updateEmailAutomation(campaign.id, { ...campaign, posts: [], clientIds: nextClientIds });
      await loadAll();
      showFlash("People updated");
    } catch (err) {
      window.alert(err.message || "Could not update people");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunCampaign(id) {
    const auto = automations.find((a) => a.id === id);
    if (!auto?.clientIds?.length) {
      window.alert("Add people to this campaign before queuing emails.");
      return;
    }
    setBusy(true);
    try {
      const res = await runEmailAutomation(id);
      await loadAll();
      showFlash(`Queued ${res.count || 0} email${res.count === 1 ? "" : "s"}`);
      setMode("queue");
    } catch (err) {
      window.alert(err.message || "Could not run campaign");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCampaign(auto, nextStatus) {
    setBusy(true);
    try {
      await updateEmailAutomation(auto.id, { ...auto, posts: [], status: nextStatus });
      await loadAll();
      showFlash(nextStatus === "active" ? "Campaign active" : "Campaign paused");
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
      await loadAll();
      backToList();
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

  const selected = useMemo(
    () => automations.find((a) => a.id === selectedId) || null,
    [automations, selectedId],
  );

  const selectedTemplateLabel = useMemo(() => {
    const id = mode === "wizard" ? campaignDraft.templateId : selected?.templateId;
    return templateOptions.find((t) => t.id === id)?.label || "No template";
  }, [mode, campaignDraft.templateId, selected?.templateId, templateOptions]);

  const backHandler = mode === "list" ? onBack : backToList;
  const backTitle = mode === "list" ? "Back to Projects" : "Back to campaigns";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title="Email Campaigns"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ")}
        onBack={backHandler}
        backTitle={backTitle}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {flash ? <span style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>{flash}</span> : null}
          {mode === "list" ? (
            <>
              <RibbonLabeledButton theme={t} icon="plus" label="New campaign" onClick={startNewCampaign} disabled={busy || loading} />
              <RibbonLabeledButton theme={t} icon="mail" label={`Queue${pendingCount ? ` (${pendingCount})` : ""}`} onClick={() => setMode("queue")} />
              <RibbonLabeledButton theme={t} icon="projects" label="People" onClick={() => setMode("people")} />
            </>
          ) : null}
          {typeof onOpenEmailStudio === "function" ? (
            <RibbonLabeledButton theme={t} icon="mail" label="Email Studio" onClick={onOpenEmailStudio} />
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
            <StepHeader step={step} isDark={isDark} />

            {step === 1 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editingCampaignId ? "Edit campaign" : "What are you sending?"}</h2>
                <p style={{ margin: 0, fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
                  Pick a template from Email Studio. One campaign at a time — keep it simple.
                </p>
                <Field label="Campaign name" isDark={isDark}>
                  <input
                    style={inputStyle(isDark)}
                    value={campaignDraft.name}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, name: e.target.value })}
                    placeholder="Q3 utility follow-up"
                    autoFocus
                  />
                </Field>
                <Field
                  label="Email template"
                  isDark={isDark}
                  hint={templateOptions.length ? "Built in Email Studio" : "Create a template in Email Studio first"}
                >
                  <select
                    style={inputStyle(isDark)}
                    value={campaignDraft.templateId}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, templateId: e.target.value })}
                  >
                    <option value="">Select template…</option>
                    {templateOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </Field>
                {!templateOptions.length && typeof onOpenEmailStudio === "function" ? (
                  <button type="button" onClick={onOpenEmailStudio} style={chipBtn(t)}>
                    Open Email Studio
                  </button>
                ) : null}
                <Field label="Subject (optional override)" isDark={isDark} hint="Leave blank to use the template subject">
                  <input
                    style={inputStyle(isDark)}
                    value={campaignDraft.subject}
                    onChange={(e) => setCampaignDraft({ ...campaignDraft, subject: e.target.value })}
                    placeholder="Template subject"
                  />
                </Field>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={backToList} style={chipBtn(t)}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canStep1()) setStep(2);
                    }}
                    style={primaryBtn(t)}
                  >
                    Next: schedule
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>When should it go?</h2>
                <p style={{ margin: 0, fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
                  Lay out the send cadence first. You’ll add people after the campaign is saved.
                </p>

                <button
                  type="button"
                  onClick={() => setCampaignDraft({
                    ...campaignDraft,
                    schedule: { ...campaignDraft.schedule, enabled: false },
                  })}
                  style={{ ...chipBtn(t, !campaignDraft.schedule.enabled), textAlign: "left", padding: "12px 14px", display: "grid", gap: 4 }}
                >
                  <span style={{ fontWeight: 700 }}>Manual / run when ready</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.subtle }}>Queue personalized emails after you add people.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignDraft({
                    ...campaignDraft,
                    schedule: { ...campaignDraft.schedule, enabled: true },
                  })}
                  style={{ ...chipBtn(t, campaignDraft.schedule.enabled), textAlign: "left", padding: "12px 14px", display: "grid", gap: 4 }}
                >
                  <span style={{ fontWeight: 700 }}>Scheduled</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.subtle }}>Auto-queue on a repeating cadence while the app is open.</span>
                </button>

                {campaignDraft.schedule.enabled ? (
                  <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: t.headBg }}>
                    <Field label="Frequency" isDark={isDark}>
                      <select
                        style={inputStyle(isDark)}
                        value={campaignDraft.schedule.frequency}
                        onChange={(e) => setCampaignDraft({
                          ...campaignDraft,
                          schedule: { ...campaignDraft.schedule, frequency: e.target.value },
                        })}
                      >
                        <option value="once">Once</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </Field>
                    <div style={{ display: "grid", gridTemplateColumns: campaignDraft.schedule.frequency === "weekly" ? "1fr 1fr" : "1fr", gap: 8 }}>
                      {campaignDraft.schedule.frequency === "weekly" ? (
                        <Field label="Weekday" isDark={isDark}>
                          <select
                            style={inputStyle(isDark)}
                            value={campaignDraft.schedule.weekday}
                            onChange={(e) => setCampaignDraft({
                              ...campaignDraft,
                              schedule: { ...campaignDraft.schedule, weekday: Number(e.target.value) },
                            })}
                          >
                            {WEEKDAYS.map((d, i) => (
                              <option key={d} value={i}>{d}</option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      <Field label="Time" isDark={isDark}>
                        <input
                          style={inputStyle(isDark)}
                          type="time"
                          value={campaignDraft.schedule.time}
                          onChange={(e) => setCampaignDraft({
                            ...campaignDraft,
                            schedule: { ...campaignDraft.schedule, time: e.target.value },
                          })}
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setStep(1)} style={chipBtn(t)}>Back</button>
                  <button type="button" onClick={() => setStep(3)} style={primaryBtn(t)}>Next: go live</button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ready to save?</h2>
                <div style={{ padding: 14, borderRadius: 10, background: t.headBg, border: `1px solid ${t.border}`, fontSize: 13, display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>{campaignDraft.name || "Untitled"}</div>
                  <div style={{ color: t.subtle }}>Template: {selectedTemplateLabel}</div>
                  <div style={{ color: t.subtle }}>
                    {campaignDraft.schedule.enabled
                      ? `Scheduled · ${campaignDraft.schedule.frequency} at ${campaignDraft.schedule.time}${campaignDraft.schedule.frequency === "weekly" ? ` · ${WEEKDAYS[campaignDraft.schedule.weekday]}` : ""}`
                      : "Manual — queue after you add people"}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
                  Next you’ll add people to this campaign, then queue emails.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  <button type="button" onClick={() => setStep(2)} style={chipBtn(t)} disabled={busy}>Back</button>
                  <button type="button" disabled={busy} onClick={() => saveCampaign({ activate: false })} style={chipBtn(t)}>
                    Save draft
                  </button>
                  <button type="button" disabled={busy} onClick={() => saveCampaign({ activate: true })} style={primaryBtn(t)}>
                    Save & add people
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : mode === "detail" && selected ? (
          <CampaignDetail
            isDark={isDark}
            campaign={selected}
            templateLabel={selectedTemplateLabel}
            clients={clients}
            queue={queue.filter((q) => q.automationId === selected.id)}
            clientDraft={clientDraft}
            setClientDraft={setClientDraft}
            addingPerson={addingPerson}
            setAddingPerson={setAddingPerson}
            onAddPerson={async (e) => {
              e?.preventDefault?.();
              const row = await addPerson(e);
              if (!row || !selected) return;
              const nextIds = [...new Set([...(selected.clientIds || []), row.id])];
              await saveCampaignPeople(selected, nextIds);
            }}
            onTogglePerson={(clientId) => {
              const set = new Set(selected.clientIds || []);
              if (set.has(clientId)) set.delete(clientId);
              else set.add(clientId);
              saveCampaignPeople(selected, [...set]);
            }}
            onEdit={() => startEditCampaign(selected)}
            onDelete={() => handleDeleteCampaign(selected.id)}
            onRun={() => handleRunCampaign(selected.id)}
            onToggle={(status) => handleToggleCampaign(selected, status)}
            onOpenQueue={() => setMode("queue")}
            onOpenTemplate={typeof onOpenEmailTemplate === "function" && selected.templateId
              ? () => onOpenEmailTemplate(selected.templateId)
              : undefined}
            busy={busy}
          />
        ) : mode === "people" ? (
          <PeoplePanel
            isDark={isDark}
            clients={clients}
            clientDraft={clientDraft}
            setClientDraft={setClientDraft}
            addingPerson={addingPerson}
            setAddingPerson={setAddingPerson}
            onAdd={addPerson}
            onRemove={removePerson}
            busy={busy}
          />
        ) : mode === "queue" ? (
          <QueuePanel
            isDark={isDark}
            queue={queue}
            busy={busy}
            onCopy={handleCopyQueueItem}
            onStatus={handleQueueStatus}
          />
        ) : automations.length === 0 ? (
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
              onClick={startNewCampaign}
              aria-label="Add email campaign"
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
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Add an email campaign</div>
              <p style={{ margin: 0, fontSize: 14, color: t.subtle, maxWidth: 380, lineHeight: 1.45 }}>
                Lay out the email and schedule first — then add people and queue sends.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, maxWidth: 720, margin: "0 auto" }}>
            <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>
              Lightweight outbound: pick a template, choose people, queue personalized emails.
            </p>
            {automations.map((auto) => {
              const tpl = templateOptions.find((x) => x.id === auto.templateId);
              return (
                <button
                  key={auto.id}
                  type="button"
                  onClick={() => openDetail(auto)}
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{auto.name}</div>
                      <div style={{ fontSize: 12, color: t.subtle, marginTop: 4 }}>
                        {STATUS_LABEL[auto.status] || auto.status} · {auto.clientIds?.length || 0} people · {tpl?.label || "No template"}
                        {auto.schedule?.enabled ? ` · ${auto.schedule.frequency} ${auto.schedule.time}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: t.subtle, flexShrink: 0 }}>
                      {auto.lastRunAt ? `Last run ${formatWhen(auto.lastRunAt)}` : "Not run yet"}
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={startNewCampaign}
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

function CampaignDetail({
  isDark,
  campaign,
  templateLabel,
  clients,
  queue,
  clientDraft,
  setClientDraft,
  addingPerson,
  setAddingPerson,
  onAddPerson,
  onTogglePerson,
  onEdit,
  onDelete,
  onRun,
  onToggle,
  onOpenQueue,
  onOpenTemplate,
  busy,
}) {
  const t = getAppTheme(isDark);
  const selectedIds = new Set(campaign.clientIds || []);
  const people = clients.filter((c) => selectedIds.has(c.id));
  const pending = queue.filter((q) => q.status === "pending").length;
  const canQueue = people.length > 0;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{campaign.name}</h2>
            <div style={{ fontSize: 13, color: t.subtle, marginTop: 4 }}>
              {STATUS_LABEL[campaign.status] || campaign.status} · {templateLabel}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={onEdit} style={chipBtn(t)} disabled={busy}>Edit layout</button>
            <button type="button" onClick={onDelete} style={{ ...chipBtn(t), color: t.errorText }} disabled={busy}>Delete</button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={onRun} style={primaryBtn(t)} disabled={busy || !canQueue} title={canQueue ? undefined : "Add people first"}>
            Queue emails
          </button>
          {campaign.status === "active" ? (
            <button type="button" onClick={() => onToggle("paused")} style={chipBtn(t)} disabled={busy}>Pause</button>
          ) : (
            <button type="button" onClick={() => onToggle("active")} style={chipBtn(t)} disabled={busy}>Activate</button>
          )}
          {pending ? (
            <button type="button" onClick={onOpenQueue} style={chipBtn(t)}>{pending} in queue</button>
          ) : null}
          {onOpenTemplate ? (
            <button type="button" onClick={onOpenTemplate} style={chipBtn(t)}>Open template</button>
          ) : null}
        </div>
      </section>

      <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add people</h3>
        <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle, lineHeight: 1.45 }}>
          Campaign layout is done — now choose who gets this email. Then queue sends.
        </p>

        {addingPerson ? (
          <form onSubmit={onAddPerson} style={{ display: "grid", gap: 8, marginBottom: 14, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: t.headBg }}>
            <Field label="Email" isDark={isDark}>
              <input style={inputStyle(isDark)} value={clientDraft.email} onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })} required autoFocus />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="First name" isDark={isDark}>
                <input style={inputStyle(isDark)} value={clientDraft.firstName} onChange={(e) => setClientDraft({ ...clientDraft, firstName: e.target.value })} />
              </Field>
              <Field label="Company" isDark={isDark}>
                <input style={inputStyle(isDark)} value={clientDraft.company} onChange={(e) => setClientDraft({ ...clientDraft, company: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={busy} style={primaryBtn(t)}>Add to campaign</button>
              <button type="button" onClick={() => setAddingPerson(false)} style={chipBtn(t)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAddingPerson(true)} style={{ ...chipBtn(t), marginBottom: 12 }} disabled={busy}>
            + New person
          </button>
        )}

        {clients.length ? (
          <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {clients.map((c) => {
              const on = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onTogglePerson(c.id)}
                  style={{
                    ...chipBtn(t, on),
                    textAlign: "left",
                    padding: "10px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>
                    <strong>{c.name || c.firstName || c.email}</strong>
                    <span style={{ color: t.subtle, fontWeight: 500 }}> · {c.email}</span>
                  </span>
                  <span>{on ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>No people yet — add someone above.</p>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: t.subtle }}>
          {people.length} on this campaign
        </div>
      </section>
    </div>
  );
}

function PeoplePanel({ isDark, clients, clientDraft, setClientDraft, addingPerson, setAddingPerson, onAdd, onRemove, busy }) {
  const t = getAppTheme(isDark);
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>People</h2>
        <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>Contacts you can add to any email campaign.</p>

        {addingPerson ? (
          <form onSubmit={onAdd} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <Field label="Email" isDark={isDark}>
              <input style={inputStyle(isDark)} value={clientDraft.email} onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })} required autoFocus />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="First name" isDark={isDark}>
                <input style={inputStyle(isDark)} value={clientDraft.firstName} onChange={(e) => setClientDraft({ ...clientDraft, firstName: e.target.value })} />
              </Field>
              <Field label="Company" isDark={isDark}>
                <input style={inputStyle(isDark)} value={clientDraft.company} onChange={(e) => setClientDraft({ ...clientDraft, company: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={busy} style={primaryBtn(t)}>Add</button>
              <button type="button" onClick={() => setAddingPerson(false)} style={chipBtn(t)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAddingPerson(true)} style={{ ...chipBtn(t), marginBottom: 14 }}>+ Add person</button>
        )}

        {clients.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {clients.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: `1px solid ${t.border}` }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name || c.firstName || c.email}</div>
                  <div style={{ fontSize: 12, color: t.subtle }}>{c.email}{c.company ? ` · ${c.company}` : ""}</div>
                </div>
                <button type="button" onClick={() => onRemove(c.id)} style={{ ...chipBtn(t), color: t.errorText }} disabled={busy}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>No people yet.</p>
        )}
      </section>
    </div>
  );
}

function QueuePanel({ isDark, queue, busy, onCopy, onStatus }) {
  const t = getAppTheme(isDark);
  const pending = queue.filter((q) => q.status === "pending");
  const done = queue.filter((q) => q.status !== "pending").slice(0, 20);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Send queue</h2>
        <p style={{ margin: "4px 0 14px", fontSize: 13, color: t.subtle }}>
          Copy each personalized email into your mail client, then mark it sent.
        </p>
        {pending.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {pending.map((item) => (
              <div key={item.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.headBg }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.clientName || item.clientEmail}</div>
                <div style={{ fontSize: 12, color: t.subtle, marginTop: 2 }}>
                  {item.automationName} · {item.clientEmail}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" disabled={busy} onClick={() => onCopy(item)} style={primaryBtn(t)}>Copy email</button>
                  <button type="button" disabled={busy} onClick={() => onStatus(item, "sent")} style={chipBtn(t)}>Mark sent</button>
                  <button type="button" disabled={busy} onClick={() => onStatus(item, "skipped")} style={chipBtn(t)}>Skip</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: t.subtle }}>Queue is empty. Open a campaign and tap Queue emails.</p>
        )}
        {done.length ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.subtle, marginBottom: 8, textTransform: "uppercase" }}>Recent</div>
            {done.map((item) => (
              <div key={item.id} style={{ fontSize: 12, color: t.subtle, padding: "6px 0", borderTop: `1px solid ${t.border}` }}>
                {item.clientEmail} · {item.status} · {formatWhen(item.sentAt || item.createdAt)}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
