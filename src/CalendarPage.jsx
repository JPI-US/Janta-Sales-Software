import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fontSans, getAppTheme, pageShellStyle } from "./appTheme.js";
import { PageHeader } from "./appIcons.jsx";
import { fetchEmailAutomations } from "./emailStudioApi.js";
import { listProposalsForUser } from "./proposalStorage.js";
import { fetchSocialCampaigns } from "./socialCampaignsApi.js";
import { postPlatform } from "../shared/campaignPosting.js";
import { crmPriorityLabel, crmStageLabel, crmResolveCloseDate } from "./proposalCrm.js";
import { formatUsdCompact } from "./solarPricing.js";

function useTheme(isDark) {
  return useMemo(() => getAppTheme(isDark), [isDark]);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TYPE_SALES = "sales";
const TYPE_EMAIL = "email";
const TYPE_CONTENT = "content";
const TYPE_REPORT = "report";

const EVENT_TYPES = [
  { key: TYPE_SALES, label: "Sales closes", color: "#2A9D8F" },
  { key: TYPE_EMAIL, label: "Email campaigns", color: "#7C5CBF" },
  { key: TYPE_CONTENT, label: "Social campaigns", color: "#0A66C2" },
  { key: TYPE_REPORT, label: "Quarterly report", color: "#D97706" },
];

const TYPE_COLOR = Object.fromEntries(EVENT_TYPES.map((t) => [t.key, t.color]));
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const HOUR_PX = 64;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dateKeyFromDate(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function todayKey() {
  return dateKeyFromDate(new Date());
}

function addDays(d, n) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildWeeks(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  while (weeks[weeks.length - 1].length < 7) weeks[weeks.length - 1].push(null);
  return weeks;
}

function parseClockToMinutes(timeStr) {
  const raw = String(timeStr || "").trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h !== 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  return 9 * 60;
}

function formatMinutes(mins) {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${pad2(m)} ${mer}`;
}

function formatHourLabel(h) {
  const mer = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12} ${mer}`;
}

function relativeDayLabel(key) {
  const today = startOfDay(new Date());
  const d = startOfDay(new Date(`${key}T12:00:00`));
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 8) return `in ${diff}d`;
  if (diff < 0 && diff > -8) return `${Math.abs(diff)}d ago`;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function isQuarterStart(d) {
  return d.getDate() === 1 && d.getMonth() % 3 === 0;
}

function previousQuarterRangeLabel(quarterStart) {
  const end = addDays(quarterStart, -1);
  const start = new Date(quarterStart.getFullYear(), quarterStart.getMonth() - 3, 1);
  const startLabel = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`;
  const endLabel = `${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  return `${startLabel} – ${endLabel}`;
}

function priorityColor(p) {
  if (p === "high") return "#DC2626";
  if (p === "medium") return "#D97706";
  return "#6B7280";
}

function eventSort(a, b) {
  if (a.allDay && !b.allDay) return -1;
  if (!a.allDay && b.allDay) return 1;
  return (a.minutes ?? 0) - (b.minutes ?? 0) || a.title.localeCompare(b.title);
}

function proposalToCloseRow(p) {
  if (!p) return null;
  const closeDate = String(crmResolveCloseDate(p) || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) return null;
  return {
    id: p.id,
    title: p.title || "Untitled project",
    stage: p.stage,
    priority: p.priority,
    revenue: p.revenue ?? p.estimatedRevenue,
    proposalOwner: p.proposalOwner,
    closeDate,
  };
}

function salesEvents(opportunities) {
  return (opportunities || [])
    .filter((r) => r.closeDate)
    .map((r) => ({
      id: `sales-${r.id || r.title}-${r.closeDate}`,
      type: TYPE_SALES,
      dateKey: String(r.closeDate).slice(0, 10),
      allDay: true,
      minutes: null,
      timeLabel: "All day",
      title: r.title || "Project close",
      subtitle: [crmStageLabel(r.stage), r.proposalOwner].filter(Boolean).join(" · "),
      color: priorityColor(r.priority),
      meta: r,
    }));
}

function contentEventsFromSocialCampaigns(campaigns, from, to) {
  const events = [];
  (campaigns || []).forEach((c) => {
    if (c.status === "completed" || c.status === "draft") return;
    const start = c.startDate || "";
    const end = c.endDate || "";
    if (!start) return;
    for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
      const dk = dateKeyFromDate(d);
      if (dk < start) continue;
      if (end && dk > end) continue;
      const isStart = dk === start;
      const isEnd = end && dk === end;
      if (!isStart && !isEnd) continue;
      events.push({
        id: `social-${c.id}-${dk}`,
        type: TYPE_CONTENT,
        dateKey: dk,
        allDay: true,
        minutes: 0,
        timeLabel: "All day",
        title: isStart ? `${c.name || "Social campaign"} starts` : `${c.name || "Social campaign"} ends`,
        subtitle: `${c.goal === "conversions" ? "Conversions" : "Visits"} · ${(c.platforms || []).map((p) => postPlatform(p)?.label || p).join(", ") || "social"}`,
        color: TYPE_COLOR[TYPE_CONTENT],
        meta: { campaign: c },
      });
    }
  });
  return events;
}

function contentEventsFromCampaigns(automations, from, to) {
  const events = [];
  (automations || []).forEach((auto) => {
    if (auto.status === "completed") return;
    (auto.posts || []).forEach((post) => {
      const plat = postPlatform(post.platform);
      const weekday = Number(post.weekday);
      const minutes = parseClockToMinutes(post.time);
      for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
        if (d.getDay() !== weekday) continue;
        events.push({
          id: `content-${auto.id}-${post.id || post.platform}-${dateKeyFromDate(d)}`,
          type: TYPE_CONTENT,
          dateKey: dateKeyFromDate(d),
          allDay: false,
          minutes,
          timeLabel: formatMinutes(minutes),
          title: auto.name || "Campaign post",
          subtitle: `${plat?.label || post.platform} · ${auto.status === "draft" ? "draft" : "scheduled post"}`,
          color: plat?.color || TYPE_COLOR[TYPE_CONTENT],
          platform: plat,
          meta: { auto, post },
        });
      }
    });
  });
  return events;
}

function reportEventsForRange(from, to) {
  const events = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    if (!isQuarterStart(d)) continue;
    const range = previousQuarterRangeLabel(d);
    events.push({
      id: `report-${dateKeyFromDate(d)}`,
      type: TYPE_REPORT,
      dateKey: dateKeyFromDate(d),
      allDay: true,
      minutes: 0,
      timeLabel: "All day",
      title: "Quarterly marketing report",
      subtitle: `Due 1st of the quarter · Covers ${range}`,
      color: TYPE_COLOR[TYPE_REPORT],
      meta: { range },
    });
  }
  return events;
}

function emailEventsFromAutomations(automations, from, to) {
  const events = [];
  (automations || []).forEach((auto) => {
    const schedule = auto.schedule || {};
    const time = schedule.time || "09:00";
    const minutes = parseClockToMinutes(time);
    const timeLabel = formatMinutes(minutes);
    const freq = schedule.frequency || "once";
    const activeOnCal = schedule.enabled && auto.status !== "completed";

    if (schedule.nextRunAt) {
      const at = new Date(schedule.nextRunAt);
      if (!Number.isNaN(at.getTime())) {
        const dk = dateKeyFromDate(at);
        if (dk >= dateKeyFromDate(from) && dk <= dateKeyFromDate(to)) {
          events.push({
            id: `email-next-${auto.id}-${dk}`,
            type: TYPE_EMAIL,
            dateKey: dk,
            allDay: false,
            minutes: at.getHours() * 60 + at.getMinutes(),
            timeLabel: formatMinutes(at.getHours() * 60 + at.getMinutes()),
            title: auto.name || "Email campaign",
            subtitle: `${auto.status === "active" ? "Next send" : auto.status} · ${auto.clientIds?.length || 0} clients`,
            color: TYPE_COLOR[TYPE_EMAIL],
            meta: auto,
          });
        }
      }
    }

    if (!activeOnCal) return;
    if (freq === "once") return;

    for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
      if (freq === "weekly" && d.getDay() !== Number(schedule.weekday ?? 1)) continue;
      const dk = dateKeyFromDate(d);
      if (events.some((e) => e.id === `email-next-${auto.id}-${dk}`)) continue;
      events.push({
        id: `email-${auto.id}-${dk}`,
        type: TYPE_EMAIL,
        dateKey: dk,
        allDay: false,
        minutes,
        timeLabel,
        title: auto.name || "Email campaign",
        subtitle: `${freq} send · ${auto.subject || "No subject"} · ${auto.clientIds?.length || 0} clients`,
        color: TYPE_COLOR[TYPE_EMAIL],
        meta: auto,
      });
    }
  });
  return events;
}

function Chip({ label, active, color, isDark, onClick }) {
  const t = useTheme(isDark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? (color || t.accent) : t.border}`,
        background: active ? (isDark ? `${color || t.accent}22` : `${color || t.accent}14`) : "transparent",
        color: active ? t.title : t.subtle,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: fontSans,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {color ? <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} /> : null}
      {label}
    </button>
  );
}

function LegendDot({ color, label, isDark }) {
  const t = useTheme(isDark);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: t.subtle, fontFamily: fontSans }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block", flexShrink: 0 }} />
      {label}
    </div>
  );
}

function EventCard({ event, isDark, compact }) {
  const t = useTheme(isDark);
  const typeLabel = EVENT_TYPES.find((x) => x.key === event.type)?.label || event.type;
  return (
    <div
      style={{
        padding: compact ? "8px 10px" : "12px 14px",
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.04)" : "#F9FAFB",
        border: `1px solid ${t.border}`,
        borderLeft: `3px solid ${event.color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: event.color, fontFamily: fontSans }}>{event.timeLabel}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: t.subtle, fontFamily: fontSans, textTransform: "uppercase", letterSpacing: "0.04em" }}>{typeLabel}</span>
      </div>
      <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: t.title, fontFamily: fontSans }}>{event.title}</div>
      {event.subtitle ? (
        <div style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans, marginTop: 3 }}>{event.subtitle}</div>
      ) : null}
      {event.type === TYPE_SALES && event.meta ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans }}>
            Priority: <strong style={{ color: event.color }}>{crmPriorityLabel(event.meta.priority)}</strong>
          </span>
          {event.meta.revenue ? (
            <span style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans }}>
              Revenue: <strong style={{ color: t.title }}>{formatUsdCompact(event.meta.revenue)}</strong>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MonthView({
  isDark,
  year,
  month,
  eventsByDate,
  selectedKey,
  onSelectDay,
  onOpenDay,
}) {
  const t = useTheme(isDark);
  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);
  const tdk = useMemo(() => todayKey(), []);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 600, color: t.subtle, textAlign: "center", fontFamily: fontSans, padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {week.map((day, di) => {
              if (!day) return <div key={di} style={{ minHeight: 96 }} />;
              const dk = dateKey(year, month, day);
              const dayEvents = eventsByDate[dk] || [];
              const isToday = dk === tdk;
              const isSel = selectedKey === dk;
              return (
                <div
                  key={di}
                  onClick={() => onSelectDay(dk)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    onOpenDay(dk);
                  }}
                  title="Double-click to open day view"
                  style={{
                    minHeight: 96,
                    background: isSel
                      ? isDark ? "rgba(143,176,200,0.18)" : "rgba(143,176,200,0.16)"
                      : isToday
                        ? isDark ? "rgba(135,169,196,0.12)" : "rgba(135,169,196,0.10)"
                        : t.headBg,
                    border: `1px solid ${isSel || isToday ? "#87A9C4" : t.border}`,
                    borderRadius: 8,
                    padding: "5px 6px",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? (isDark ? "#8FB0C8" : "#2F6B8A") : t.subtle,
                      lineHeight: 1,
                      marginBottom: 4,
                      fontFamily: fontSans,
                    }}
                  >
                    {day}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          overflow: "hidden",
                          background: `${ev.color}22`,
                          borderRadius: 3,
                          padding: "1px 4px",
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: t.title, fontFamily: fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                          {ev.allDay ? ev.title : `${ev.timeLabel.replace(" ", "")} ${ev.title}`}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span style={{ fontSize: 9, color: t.subtle, fontFamily: fontSans }}>+{dayEvents.length - 3} more</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: t.subtle, fontFamily: fontSans }}>
        Double-click a day to open the hour-by-hour schedule.
      </p>
    </div>
  );
}

function DayView({ isDark, dateKeyValue, events, onPrev, onNext, onBackToMonth }) {
  const t = useTheme(isDark);
  const parsed = parseDateKey(dateKeyValue);
  const d = new Date(parsed.year, parsed.month, parsed.day);
  const allDay = events.filter((e) => e.allDay).sort(eventSort);
  const timed = events.filter((e) => !e.allDay).sort(eventSort);
  const hours = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  const gridHeight = hours.length * HOUR_PX;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onPrev}
            style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 8, cursor: "pointer", color: t.subtle, fontSize: 18, padding: "4px 12px", fontFamily: fontSans }}
          >
            ‹
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.title, fontFamily: fontSans }}>
              {DAY_FULL[d.getDay()]}, {MONTH_NAMES[parsed.month]} {parsed.day}
            </div>
            <div style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans, marginTop: 2 }}>
              {relativeDayLabel(dateKeyValue)} · {events.length} item{events.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onNext}
            style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 8, cursor: "pointer", color: t.subtle, fontSize: 18, padding: "4px 12px", fontFamily: fontSans }}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={onBackToMonth}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.headBg,
            color: t.title,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: fontSans,
          }}
        >
          Back to month
        </button>
      </div>

      {allDay.length ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.subtle, fontFamily: fontSans, marginBottom: 8 }}>
            All day
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allDay.map((ev) => (
              <EventCard key={ev.id} event={ev} isDark={isDark} />
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "relative",
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          background: t.panel,
          overflow: "auto",
          maxHeight: "calc(100vh - 280px)",
        }}
      >
        <div style={{ position: "relative", minHeight: gridHeight }}>
          {hours.map((h, i) => (
            <div
              key={h}
              style={{
                height: HOUR_PX,
                borderBottom: i < hours.length - 1 ? `1px solid ${t.border}` : "none",
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 72,
                  flexShrink: 0,
                  padding: "6px 8px 0 12px",
                  fontSize: 11,
                  color: t.subtle,
                  fontFamily: fontSans,
                  fontWeight: 600,
                }}
              >
                {formatHourLabel(h)}
              </div>
              <div style={{ flex: 1, borderLeft: `1px solid ${t.border}` }} />
            </div>
          ))}

          {timed.map((ev) => {
            const mins = ev.minutes ?? 9 * 60;
            const clamped = Math.max(DAY_START_HOUR * 60, Math.min(mins, DAY_END_HOUR * 60 + 50));
            const top = ((clamped - DAY_START_HOUR * 60) / 60) * HOUR_PX + 4;
            return (
              <div
                key={ev.id}
                style={{
                  position: "absolute",
                  left: 84,
                  right: 12,
                  top,
                  minHeight: 52,
                  zIndex: 1,
                }}
              >
                <EventCard event={ev} isDark={isDark} compact />
              </div>
            );
          })}
        </div>
      </div>

      {!events.length ? (
        <p style={{ marginTop: 16, fontSize: 13, color: t.subtle, fontFamily: fontSans }}>Nothing scheduled this day.</p>
      ) : null}
    </div>
  );
}

export default function CalendarPage({ isDark, userName, userEmail, accountKey, onBack }) {
  const t = useTheme(isDark);
  const now = new Date();
  const [view, setView] = useState("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dayKey, setDayKey] = useState(todayKey());
  const [filters, setFilters] = useState(() => new Set(EVENT_TYPES.map((x) => x.key)));
  const [opportunities, setOpportunities] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [socialCampaigns, setSocialCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [proposals, autoRes, socialRes] = await Promise.all([
        accountKey ? listProposalsForUser(accountKey).catch(() => []) : Promise.resolve([]),
        fetchEmailAutomations().catch(() => ({ automations: [] })),
        fetchSocialCampaigns().catch(() => ({ campaigns: [] })),
      ]);
      setOpportunities((proposals || []).map(proposalToCloseRow).filter(Boolean));
      setAutomations(autoRes?.automations || []);
      setSocialCampaigns(socialRes?.campaigns || []);
    } catch {
      setOpportunities([]);
      setAutomations([]);
      setSocialCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    load();
  }, [load]);

  const range = useMemo(() => {
    const from = addDays(new Date(year, month, 1), -14);
    const to = addDays(new Date(year, month + 1, 0), 45);
    return { from, to };
  }, [year, month]);

  const allEvents = useMemo(() => {
    return [
      ...salesEvents(opportunities),
      ...emailEventsFromAutomations(automations, range.from, range.to),
      ...contentEventsFromCampaigns(automations, range.from, range.to),
      ...contentEventsFromSocialCampaigns(socialCampaigns, range.from, range.to),
      ...reportEventsForRange(range.from, range.to),
    ];
  }, [opportunities, automations, socialCampaigns, range]);

  const visibleEvents = useMemo(
    () => allEvents.filter((e) => filters.has(e.type)),
    [allEvents, filters],
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    visibleEvents.forEach((e) => {
      if (!map[e.dateKey]) map[e.dateKey] = [];
      map[e.dateKey].push(e);
    });
    Object.values(map).forEach((list) => list.sort(eventSort));
    return map;
  }, [visibleEvents]);

  const selectedEvents = eventsByDate[dayKey] || [];

  const upcoming = useMemo(() => {
    const monthStart = dateKey(year, month, 1);
    const start = monthStart < todayKey() ? monthStart : todayKey();
    const end = dateKeyFromDate(addDays(new Date(), 90));
    return visibleEvents
      .filter((e) => e.dateKey >= start && e.dateKey <= end)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || eventSort(a, b))
      .slice(0, 40);
  }, [visibleEvents, year, month]);

  function navMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  function openDay(key) {
    const parsed = parseDateKey(key);
    setDayKey(key);
    setYear(parsed.year);
    setMonth(parsed.month);
    setView("day");
  }

  function shiftDay(delta) {
    const parsed = parseDateKey(dayKey);
    const next = addDays(new Date(parsed.year, parsed.month, parsed.day), delta);
    const key = dateKeyFromDate(next);
    setDayKey(key);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function goToday() {
    const d = new Date();
    const key = dateKeyFromDate(d);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDayKey(key);
  }

  function toggleFilter(key) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) EVENT_TYPES.forEach((x) => next.add(x.key));
      return next;
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.title }}>
      <PageHeader
        theme={t}
        title="Calendar"
        subtitle={[userName, userEmail].filter(Boolean).join(" · ") || "Sales & marketing schedule"}
        onBack={onBack}
        backTitle="Back to Projects"
      >
        <Chip label="Month" active={view === "month"} isDark={isDark} onClick={() => setView("month")} />
        <Chip label="Day" active={view === "day"} isDark={isDark} onClick={() => openDay(dayKey)} />
        <Chip label="Today" active={false} isDark={isDark} onClick={goToday} />
      </PageHeader>

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          {view === "month" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => navMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: t.subtle, fontSize: 22, padding: "2px 10px" }}>‹</button>
              <span style={{ fontSize: 17, fontWeight: 700, color: t.title, fontFamily: fontSans, minWidth: 180, textAlign: "center" }}>
                {MONTH_NAMES[month]} {year}
              </span>
              <button type="button" onClick={() => navMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", color: t.subtle, fontSize: 22, padding: "2px 10px" }}>›</button>
            </div>
          ) : (
            <div />
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {EVENT_TYPES.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                color={item.color}
                active={filters.has(item.key)}
                isDark={isDark}
                onClick={() => toggleFilter(item.key)}
              />
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 14, color: t.subtle, fontFamily: fontSans, padding: "48px 0", textAlign: "center" }}>
            Loading calendar…
          </div>
        ) : view === "day" ? (
          <DayView
            isDark={isDark}
            dateKeyValue={dayKey}
            events={selectedEvents}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onBackToMonth={() => setView("month")}
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 300px",
              gap: 20,
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                {EVENT_TYPES.map((item) => (
                  <LegendDot key={item.key} color={item.color} label={item.label} isDark={isDark} />
                ))}
              </div>
              <MonthView
                isDark={isDark}
                year={year}
                month={month}
                eventsByDate={eventsByDate}
                selectedKey={dayKey}
                onSelectDay={setDayKey}
                onOpenDay={openDay}
              />
            </div>

            <div
              style={{
                background: t.panel,
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                padding: 16,
                position: "sticky",
                top: 20,
                maxHeight: "calc(100vh - 160px)",
                overflowY: "auto",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.subtle, fontFamily: fontSans, marginBottom: 4 }}>
                {dayKey === todayKey() ? "Today" : relativeDayLabel(dayKey)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.title, fontFamily: fontSans, marginBottom: 12 }}>
                {(() => {
                  const p = parseDateKey(dayKey);
                  return `${MONTH_NAMES[p.month]} ${p.day}, ${p.year}`;
                })()}
              </div>
              {selectedEvents.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {selectedEvents.map((ev) => (
                    <EventCard key={ev.id} event={ev} isDark={isDark} compact />
                  ))}
                  <button
                    type="button"
                    onClick={() => openDay(dayKey)}
                    style={{
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${t.border}`,
                      background: t.headBg,
                      color: t.title,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: fontSans,
                    }}
                  >
                    Open day view
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans, margin: "0 0 18px" }}>
                  Nothing on this day. Double-click the date to open the empty day view.
                </p>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.subtle, fontFamily: fontSans, marginBottom: 10, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
                This month and upcoming
              </div>
              {upcoming.length === 0 ? (
                <p style={{ fontSize: 12, color: t.subtle, fontFamily: fontSans }}>No upcoming items.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {upcoming.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => openDay(ev.dateKey)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: isDark ? "rgba(255,255,255,0.04)" : "#F9FAFB",
                        border: `1px solid ${t.border}`,
                        borderLeft: `3px solid ${ev.color}`,
                        cursor: "pointer",
                        fontFamily: fontSans,
                      }}
                    >
                      <div style={{ fontSize: 11, color: t.subtle }}>{relativeDayLabel(ev.dateKey)} · {ev.timeLabel}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.title, marginTop: 2 }}>{ev.title}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
