import React, { useState } from "react";

const CHART_COLORS = ["#2F3B4C", "#D3A14A", "#2A9D8F", "#6F8096", "#B45309", "#4A6FA5", "#8B5CF6", "#C2410C"];

export function chartPalette(isDark) {
  return isDark
    ? ["#D1D5DB", "#6EE7B7", "#737373", "#9CA3AF", "#525252", "#A3A3A3", "#4B5563", "#6B7280"]
    : CHART_COLORS;
}

function chartText(isDark) {
  return {
    title: isDark ? "#F3F4F6" : "#2F3B4C",
    subtle: isDark ? "#9CA3AF" : "#6F8096",
    grid: isDark ? "#333333" : "#E8ECF0",
  };
}

export function HorizontalBarChart({ items, isDark, formatValue = (v) => String(v), barColor, columns = 1, dense = false, large = false }) {
  const colors = chartPalette(isDark);
  const { title, subtle, grid } = chartText(isDark);
  if (!items.length) return <EmptyChart isDark={isDark} message="No data" />;

  const max = Math.max(...items.map((d) => d.value), 1);
  const zeroBar = isDark ? "#3A3A3A" : "#E8ECF0";
  const zeroLabel = isDark ? "#6B7280" : "#9CA3AF";
  const rowGap = large ? 14 : dense ? 6 : 10;
  const barHeight = large ? 16 : dense ? 8 : 10;
  const labelSize = large ? 13 : dense ? 11 : 12;

  const renderItem = (item, i) => {
    const isZero = !item.value;
    const pctWidth = isZero ? 0 : Math.max(4, (item.value / max) * 100);
    const color = isZero ? zeroBar : item.color || barColor || colors[i % colors.length];
    return (
      <div key={item.label} style={{ opacity: isZero ? 0.72 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: large ? 6 : dense ? 2 : 4, fontSize: labelSize, gap: 8 }}>
          <span
            style={{
              color: isZero ? zeroLabel : title,
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </span>
          <span style={{ color: isZero ? zeroLabel : subtle, whiteSpace: "nowrap", fontWeight: 600 }}>
            {formatValue(item.value)}
          </span>
        </div>
        <div style={{ height: barHeight, background: grid, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pctWidth}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s ease" }} />
        </div>
      </div>
    );
  };

  if (columns > 1) {
    const mid = Math.ceil(items.length / columns);
    const cols = Array.from({ length: columns }, (_, ci) => items.slice(ci * mid, (ci + 1) * mid));
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: dense ? "6px 16px" : "10px 20px" }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: rowGap }}>
            {col.map((item, i) => renderItem(item, ci * mid + i))}
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: rowGap }}>{items.map(renderItem)}</div>;
}

export function VerticalBarChart({ items, isDark, formatValue = (v) => String(v), height = 180 }) {
  const colors = chartPalette(isDark);
  const { title, subtle, grid } = chartText(isDark);
  if (!items.length) return <EmptyChart isDark={isDark} message="No data" />;

  const max = Math.max(...items.map((d) => d.value), 1);
  const barGap = 8;
  const barWidth = Math.min(48, Math.max(24, (320 - barGap * (items.length - 1)) / items.length));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: barGap, height, paddingBottom: 4, borderBottom: `1px solid ${grid}` }}>
        {items.map((item, i) => {
          const barH = Math.max(4, (item.value / max) * (height - 24));
          return (
            <div key={item.label} style={{ flex: "1 1 0", minWidth: barWidth, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: subtle, fontWeight: 600 }}>{formatValue(item.value)}</span>
              <div
                style={{
                  width: "100%",
                  maxWidth: barWidth,
                  height: barH,
                  background: colors[i % colors.length],
                  borderRadius: "6px 6px 2px 2px",
                  transition: "height 0.3s ease",
                }}
                title={`${item.label}: ${formatValue(item.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: barGap, marginTop: 8 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              flex: "1 1 0",
              fontSize: 10,
              color: title,
              textAlign: "center",
              lineHeight: 1.2,
              wordBreak: "break-word",
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DualBarChart({ items, isDark, formatValue = (v) => String(v), keys = ["unweighted", "weighted"], labels = ["Unweighted", "Weighted"], barColors }) {
  const colors = chartPalette(isDark);
  const { title, subtle, grid } = chartText(isDark);
  if (!items.length) return <EmptyChart isDark={isDark} message="No data" />;

  const max = Math.max(...items.flatMap((d) => keys.map((k) => d[k] || 0)), 1);
  const seriesColors = barColors?.length ? barColors : colors.slice(0, keys.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: subtle }}>
        {labels.map((label, i) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: seriesColors[i], display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 12, fontWeight: 600, color: title, marginBottom: 6 }}>{item.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {keys.map((key, i) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 8, background: grid, borderRadius: 999, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${Math.max(2, ((item[key] || 0) / max) * 100)}%`,
                      height: "100%",
                      background: seriesColors[i],
                      borderRadius: 999,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: subtle, minWidth: 72, textAlign: "right" }}>{formatValue(item[key] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FunnelChart({ steps, pipelineSteps, outcomeSteps, isDark }) {
  const { grid } = chartText(isDark);
  const mergedSteps =
    steps?.length
      ? steps
      : [
          ...(pipelineSteps || []),
          ...(outcomeSteps || []),
        ];
  if (!mergedSteps.length) return <EmptyChart isDark={isDark} message="No activity this period" />;

  const total = mergedSteps.length;
  const taper = total > 1 ? 66 / (total - 1) : 0;

  function stepColor(step, index) {
    if (step.tone === "signed") return isDark ? "#065F46" : "#2A9D8F";
    if (step.tone === "lost") return isDark ? "#7F1D1D" : "#B42318";
    if (step.tone === "followup") return isDark ? "#374151" : "#4A6380";
    const colors = isDark
      ? ["#E5E7EB", "#D1D5DB", "#C4C4C4", "#B8B8B8", "#A3A3A3", "#949494", "#858585", "#767676"]
      : ["#2F3B4C", "#3D4F66", "#4A6380", "#5A7390", "#6F8096", "#8B7355", "#4A6380", "#5A7390"];
    return colors[Math.min(index, colors.length - 1)];
  }

  function stepTextColor(step) {
    if (step.tone === "signed" || step.tone === "lost") return "#FFFFFF";
    if (step.tone === "followup") return isDark ? "#E5E7EB" : "#FFFFFF";
    return isDark ? "#111111" : "#FFFFFF";
  }

  function renderStep(step, index) {
    const widthPct = Math.max(34, 100 - index * taper);
    const barColor = stepColor(step, index);
    const textColor = stepTextColor(step);

    return (
      <div
        key={`${step.label}-${index}`}
        style={{
          width: `${widthPct}%`,
          minWidth: Math.max(148, 220 - index * 18),
          maxWidth: 560,
          position: "relative",
          margin: "0 auto",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            clipPath: "polygon(7% 0, 93% 0, 100% 100%, 0% 100%)",
            background: barColor,
            borderRadius: index === 0 ? "4px 4px 0 0" : 0,
          }}
        />
        <div
          style={{
            position: "relative",
            boxSizing: "border-box",
            padding: "15px 18px",
            paddingLeft: "11%",
            paddingRight: "11%",
            minHeight: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: textColor,
              lineHeight: 1.35,
              minWidth: 0,
            }}
          >
            {step.label}
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: textColor,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {step.value}
          </span>
        </div>
        {index < total - 1 ? (
          <div
            style={{
              width: 2,
              height: 3,
              background: grid,
              opacity: 0.45,
              margin: "0 auto",
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px 4px" }}>
      <div style={{ width: "100%", maxWidth: 580, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {mergedSteps.map((step, i) => renderStep(step, i))}
      </div>
    </div>
  );
}

export function LineChartLegend({ series, isDark, trendLine = null }) {
  const colors = chartPalette(isDark);
  const { subtle } = chartText(isDark);
  const items = (series || []).filter((s) => s.points?.length);
  if (!items.length && !trendLine) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 18, fontSize: 12, color: subtle }}>
      {items.map((s, i) => (
        <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <svg width={28} height={8} aria-hidden="true">
            <line
              x1={0}
              y1={4}
              x2={28}
              y2={4}
              stroke={s.color || colors[i % colors.length]}
              strokeWidth={i === 0 ? 2.5 : 2}
              strokeDasharray={i === 0 ? undefined : "5 4"}
            />
          </svg>
          {s.label}
        </span>
      ))}
      {trendLine ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <svg width={28} height={8} aria-hidden="true">
            <line
              x1={0}
              y1={4}
              x2={28}
              y2={4}
              stroke={trendLine.color}
              strokeWidth={1.75}
              strokeDasharray="3 3"
            />
          </svg>
          {trendLine.label}
        </span>
      ) : null}
    </div>
  );
}

/** Gaussian-weighted smoother — follows the series shape (trend), not a straight best-fit line. */
function smoothTrendPoints(points, getX, { bandwidthDays = 10, excludeZero = false } = {}) {
  if (!points?.length) return null;
  const n = points.length;
  const xs = points.map((_, i) => getX(i));
  const ys = points.map((p) => Number(p.value) || 0);
  const usable = ys.map((y) => !(excludeZero && y <= 0));
  if (usable.filter(Boolean).length < 2) return null;

  const span = xs[n - 1] - xs[0];
  const isTime = span > 86_400_000;
  const bandwidth = isTime
    ? Math.max(bandwidthDays, 3) * 86_400_000
    : Math.max(2.5, Math.round(n * 0.12) || 3);

  const smoothed = [];
  for (let i = 0; i < n; i++) {
    let wSum = 0;
    let ySum = 0;
    for (let j = 0; j < n; j++) {
      if (!usable[j]) continue;
      const d = (xs[j] - xs[i]) / bandwidth;
      const w = Math.exp(-0.5 * d * d);
      wSum += w;
      ySum += w * ys[j];
    }
    smoothed.push({
      ...points[i],
      value: wSum > 0 ? Math.max(0, ySum / wSum) : 0,
    });
  }
  return smoothed;
}

function forecastTrendColor(isDark) {
  return isDark ? "#A3A3A3" : "#6B7280";
}

export { forecastTrendColor };

export function LineChart({
  series,
  isDark,
  height = 200,
  formatValue = (v) => String(v),
  featured = false,
  executive = false,
  xDomain = null,
  showTrendLine = false,
}) {
  const colors = chartPalette(isDark);
  const { title, subtle, grid } = chartText(isDark);
  const [hoverIndex, setHoverIndex] = useState(null);
  const activeSeries = (series || []).filter((s) => s.points?.length);
  if (!activeSeries.length) return <EmptyChart isDark={isDark} message="No forecast data" />;

  const labelOrder = [];
  const seen = new Set();
  for (const s of activeSeries) {
    for (const p of s.points) {
      const key = chartPointKey(p);
      if (!seen.has(key)) {
        seen.add(key);
        labelOrder.push({ key, label: p.label });
      }
    }
  }
  if (labelOrder.some(({ key }) => isIsoDateKey(key) || /^\d{4}-\d{2}$/.test(key))) {
    labelOrder.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }

  const alignedSeries = activeSeries.map((s) => ({
    ...s,
    points: labelOrder.map(({ key, label }) => {
      const pt = s.points.find((p) => chartPointKey(p) === key);
      return { label, date: isIsoDateKey(key) ? key : null, value: pt?.value ?? 0 };
    }),
  }));

  const labels = labelOrder.map((l) => l.label);
  const n = labels.length;
  const chartHeight = featured ? 240 : height;
  const pad = { top: featured ? 16 : 20, right: featured ? 20 : 12, bottom: 36, left: 52 };
  const width = featured ? 960 : 560;
  const innerW = width - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;
  const useTimeScale = n > 0 && labelOrder.every(({ key }) => isIsoDateKey(key));
  const timestamps = useTimeScale ? labelOrder.map(({ key }) => parseChartUtcTime(key)) : [];
  const dataMinTime = useTimeScale && timestamps.length ? Math.min(...timestamps) : 0;
  const dataMaxTime = useTimeScale && timestamps.length ? Math.max(...timestamps) : 0;
  const domainMinTime =
    useTimeScale && xDomain?.from ? parseChartUtcTime(xDomain.from) : dataMinTime;
  const domainMaxTime = useTimeScale && xDomain?.to ? parseChartUtcTime(xDomain.to) : dataMaxTime;
  const hasQuarterDomain =
    useTimeScale &&
    xDomain?.from &&
    xDomain?.to &&
    Number.isFinite(domainMinTime) &&
    Number.isFinite(domainMaxTime) &&
    domainMaxTime > domainMinTime;
  const quarterAxisTicks = hasQuarterDomain
    ? buildQuarterAxisTicks(domainMinTime, domainMaxTime, { executive })
    : [];
  const maxAxisLabels = featured ? 8 : 5;
  const labelStep = n <= maxAxisLabels ? 1 : Math.ceil(n / maxAxisLabels);

  function xAtTime(t) {
    if (useTimeScale && domainMaxTime > domainMinTime) {
      return pad.left + ((t - domainMinTime) / (domainMaxTime - domainMinTime)) * innerW;
    }
    return pad.left + innerW / 2;
  }

  function xAt(i) {
    if (useTimeScale) return xAtTime(timestamps[i]);
    return pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  }

  const trendPoints =
    showTrendLine && alignedSeries[0]?.points?.length >= 2
      ? smoothTrendPoints(alignedSeries[0].points, (i) => (useTimeScale ? timestamps[i] : i), {
          bandwidthDays: executive ? 12 : 8,
          // Keep zeros so empty stretches pull the trend down — reads as activity over time
          excludeZero: false,
        })
      : null;
  const trendMax = trendPoints?.length ? Math.max(...trendPoints.map((p) => p.value)) : 0;

  const allValues = alignedSeries.flatMap((s) => s.points.map((p) => p.value));
  const max = Math.max(...allValues, trendMax, 1);
  const min = 0;

  function yAt(v) {
    return pad.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  }

  const baseY = pad.top + innerH;

  function pathFor(points) {
    if (!points.length) return "";
    if (points.length === 1) {
      const x = xAt(0);
      const y = yAt(points[0].value);
      const span = n <= 1 ? Math.min(40, innerW * 0.12) : innerW / Math.max(n - 1, 1) / 2;
      return `M ${(x - span).toFixed(1)} ${y.toFixed(1)} L ${(x + span).toFixed(1)} ${y.toFixed(1)}`;
    }

    return points
      .map((p, i) => {
        const x = xAt(i).toFixed(1);
        const y = yAt(p.value).toFixed(1);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  function areaFor(points) {
    if (!points.length) return "";
    const line = pathFor(points);
    const lastX = xAt(points.length - 1);
    const firstX = hasQuarterDomain ? xAtTime(domainMinTime) : xAt(0);
    return `${line} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`;
  }

  const yTicks = executive
    ? [0, max]
    : [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const areaFill = executive
    ? isDark
      ? "rgba(143,176,200,0.14)"
      : "rgba(135,169,196,0.16)"
    : featured
      ? isDark
        ? "url(#forecastAreaDark)"
        : "url(#forecastAreaLight)"
      : isDark
        ? "rgba(110,231,183,0.12)"
        : "rgba(42,157,143,0.12)";

  const hitW = n <= 1 ? innerW : innerW / Math.max(n - 1, 1);
  const tooltipLeftPct = hoverIndex != null ? (xAt(hoverIndex) / width) * 100 : 0;
  const tooltipTopPx = hoverIndex != null ? yAt(Math.max(...alignedSeries.map((s) => s.points[hoverIndex]?.value ?? 0))) - 12 : 0;

  function showAxisLabel(i) {
    if (n <= maxAxisLabels) return true;
    if (i === 0 || i === n - 1) return true;
    return i % labelStep === 0;
  }

  function hitX(i) {
    if (n <= 1) return xAt(0) - hitW / 2;
    if (i === 0) return xAt(0) - hitW / 2;
    if (i === n - 1) return xAt(n - 1) - hitW / 2;
    return (xAt(i - 1) + xAt(i)) / 2;
  }

  function hitWidth(i) {
    if (n <= 1) return hitW;
    if (i === 0) return xAt(1) - xAt(0);
    if (i === n - 1) return xAt(n - 1) - xAt(n - 2);
    return xAt(i + 1) - xAt(i - 1);
  }

  function isCloseDatePoint(points, i) {
    return !(i === 0 && (points[i]?.value ?? 0) === 0);
  }

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <div style={{ width: "100%", overflowX: featured ? "auto" : "auto" }}>
        <svg viewBox={`0 0 ${width} ${chartHeight}`} width="100%" style={{ display: "block", minHeight: chartHeight }}>
          {featured ? (
            <defs>
              <linearGradient id="forecastAreaLight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(42,157,143,0.2)" />
                <stop offset="100%" stopColor="rgba(42,157,143,0.02)" />
              </linearGradient>
              <linearGradient id="forecastAreaDark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(110,231,183,0.16)" />
                <stop offset="100%" stopColor="rgba(110,231,183,0.02)" />
              </linearGradient>
            </defs>
          ) : null}

          {yTicks.map((tick) => {
            const y = yAt(tick);
            return (
              <g key={tick}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={grid} strokeWidth={1} />
                <text x={pad.left - 10} y={y + 4} textAnchor="end" fill={subtle} fontSize={featured ? 11 : 10}>
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

          {alignedSeries.map((s, si) => {
            const stroke = s.color || colors[si % colors.length];
            const isPrimary = si === 0;
            return (
              <g key={s.label}>
                {isPrimary && !executive ? <path d={areaFor(s.points)} fill={areaFill} stroke="none" /> : null}
                <path
                  d={pathFor(s.points)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={executive ? (isPrimary ? 3 : 1.75) : isPrimary ? 2.75 : 2}
                  strokeDasharray={isPrimary ? undefined : executive ? "5 5" : "6 5"}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={executive && !isPrimary ? 0.85 : 1}
                />
                {!executive &&
                  s.points.map((p, i) =>
                    isCloseDatePoint(s.points, i) ? (
                      <circle
                        key={`${s.label}-${i}`}
                        cx={xAt(i)}
                        cy={yAt(p.value)}
                        r={featured ? 2.5 : 2}
                        fill={stroke}
                        stroke={isDark ? "#141414" : "#fff"}
                        strokeWidth={1}
                        style={{ pointerEvents: "none" }}
                      />
                    ) : null
                  )}
              </g>
            );
          })}

          {trendPoints?.length ? (
            <path
              d={pathFor(trendPoints)}
              fill="none"
              stroke={forecastTrendColor(isDark)}
              strokeWidth={1.75}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {hasQuarterDomain
            ? quarterAxisTicks.map((tick) => (
                <text
                  key={tick.t}
                  x={xAtTime(tick.t)}
                  y={chartHeight - 10}
                  textAnchor={tick.anchor === "start" ? "start" : tick.anchor === "end" ? "end" : "middle"}
                  fill={title}
                  fontSize={featured ? 11 : 10}
                  fontWeight={tick.anchor === "middle" ? 600 : 700}
                  style={{ pointerEvents: "none" }}
                >
                  {tick.label}
                </text>
              ))
            : labels.map((label, i) =>
                showAxisLabel(i) ? (
                  <text
                    key={`${label}-${i}`}
                    x={xAt(i)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill={title}
                    fontSize={featured ? 11 : 10}
                    fontWeight={600}
                    style={{ pointerEvents: "none" }}
                  >
                    {label}
                  </text>
                ) : null
              )}

          {labels.map((label, i) => (
            <rect
              key={`hit-${label}-${i}`}
              x={hitX(i)}
              y={pad.top}
              width={hitWidth(i)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}
        </svg>
      </div>

      {hoverIndex != null ? (
        <div
          style={{
            position: "absolute",
            left: `${tooltipLeftPct}%`,
            top: `${(tooltipTopPx / chartHeight) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
            pointerEvents: "none",
            zIndex: 2,
            minWidth: 120,
            padding: "8px 10px",
            borderRadius: 8,
            background: isDark ? "#1A1A1A" : "#FFFFFF",
            border: `1px solid ${isDark ? "#404040" : "#D5DCE4"}`,
            boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 4px 14px rgba(47,59,76,0.12)",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, color: title, marginBottom: 4 }}>
            {executive && labelOrder[hoverIndex]?.key
              ? formatDateLabel(labelOrder[hoverIndex].key)
              : labels[hoverIndex]}
          </div>
          {alignedSeries.map((s) => {
            const stroke = s.color || colors[0];
            const value = s.points[hoverIndex]?.value ?? 0;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, color: subtle }}>
                <span
                  style={{
                    width: 10,
                    height: 3,
                    borderRadius: 999,
                    background: stroke,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: title }}>{formatValue(value)}</span>
              </div>
            );
          })}
          {executive ? (
            <div style={{ marginTop: 4, fontSize: 10, color: subtle }}>Expected close value this day</div>
          ) : null}
        </div>
      ) : null}

      {!featured && alignedSeries.length > 1 ? (
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: subtle }}>
          {alignedSeries.map((s, i) => (
            <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: 999,
                  background: s.color || colors[i % colors.length],
                  display: "inline-block",
                }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Pipeline flow — connected stage nodes sized by revenue (not bars or pie). */
export function StageRevenueFlowChart({ items, isDark, formatValue = (v) => String(v), height = 300, width = 960 }) {
  const { title, subtle, grid } = chartText(isDark);
  const [hoverIndex, setHoverIndex] = useState(null);
  if (!items.some((d) => d.value > 0)) return <EmptyChart isDark={isDark} message="No data" />;

  const pad = { top: 40, right: 24, bottom: 68, left: 24 };
  const trackY = pad.top + (height - pad.top - pad.bottom) * 0.42;
  const innerW = width - pad.left - pad.right;
  const n = items.length;
  const maxVal = Math.max(...items.map((d) => d.value), 1);
  const zeroFill = isDark ? "#1A1A1A" : "#F4F6F8";
  const labelSize = n > 8 ? 8.5 : n > 6 ? 9 : 10;

  const STAGE_SHORT = {
    proposal_created: "Created",
    drafting_proposal: "Drafting",
    proposal_approved: "Approved",
    proposal_revision: "Revision",
    proposal_sent: "Sent",
    proposal_negotiation: "Negotiation",
    needs_follow_up: "Follow-up",
    signed: "Signed",
    lead_lost: "Lost",
    unset: "Unset",
  };

  const nodes = items.map((item, i) => {
    const cx = n <= 1 ? pad.left + innerW / 2 : pad.left + (i / (n - 1)) * innerW;
    const t = item.value > 0 ? Math.sqrt(item.value / maxVal) : 0;
    const r = item.value > 0 ? 16 + t * 28 : 8;
    return { ...item, cx, cy: trackY, r, i };
  });

  function flowPath() {
    if (nodes.length < 2) return "";
    let d = `M ${nodes[0].cx} ${nodes[0].cy}`;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const mx = (prev.cx + curr.cx) / 2;
      d += ` C ${mx} ${prev.cy}, ${mx} ${curr.cy}, ${curr.cx} ${curr.cy}`;
    }
    return d;
  }

  function shortLabel(item) {
    if (item.stageKey && STAGE_SHORT[item.stageKey]) return STAGE_SHORT[item.stageKey];
    return String(item.label)
      .replace(/^Proposal /, "")
      .replace("Needs follow-up", "Follow-up")
      .replace("Drafting proposal", "Drafting")
      .replace("Proposal revision", "Revision")
      .replace("Proposal negotiation", "Negotiation")
      .replace("Lead lost", "Lost");
  }

  const hoverNode = hoverIndex != null ? nodes[hoverIndex] : null;
  const tooltipLeftPct = hoverNode ? (hoverNode.cx / width) * 100 : 0;
  const tooltipTopPct = hoverNode ? (hoverNode.cy / height) * 100 : 0;

  return (
    <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", minHeight: height }}>
        <defs>
          <linearGradient id="stageFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isDark ? "#404040" : "#CBD5E1"} />
            <stop offset="100%" stopColor={isDark ? "#737373" : "#94A3B8"} />
          </linearGradient>
          {nodes
            .filter((node) => node.value > 0)
            .map((node) => (
              <radialGradient key={`glow-${node.label}`} id={`stageGlow-${node.i}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={node.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={node.color} stopOpacity={0} />
              </radialGradient>
            ))}
        </defs>

        <line
          x1={pad.left}
          y1={trackY}
          x2={width - pad.right}
          y2={trackY}
          stroke={grid}
          strokeWidth={1.5}
          strokeDasharray="5 7"
          opacity={0.55}
        />

        {nodes.length > 1 ? (
          <>
            <path d={flowPath()} fill="none" stroke="url(#stageFlowGrad)" strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
            {nodes.slice(0, -1).map((node, i) => {
              const next = nodes[i + 1];
              const ax = (node.cx + next.cx) / 2;
              return (
                <polygon
                  key={`arrow-${node.label}`}
                  points={`${ax - 5},${trackY - 4} ${ax + 5},${trackY} ${ax - 5},${trackY + 4}`}
                  fill={subtle}
                  opacity={0.45}
                />
              );
            })}
          </>
        ) : null}

        {nodes.map((node, i) => (
          <g key={node.stageKey || node.label}>
            {node.value > 0 ? (
              <>
                <circle cx={node.cx} cy={node.cy} r={node.r + 14} fill={`url(#stageGlow-${node.i})`} />
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r}
                  fill={node.color}
                  stroke={isDark ? "#111111" : "#FFFFFF"}
                  strokeWidth={2.5}
                  style={{ pointerEvents: "none" }}
                />
                <text
                  x={node.cx}
                  y={node.cy + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={node.r > 28 ? 11 : 9}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {formatValue(node.value)}
                </text>
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={Math.max(node.r + 10, 22)}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              </>
            ) : (
              <circle cx={node.cx} cy={node.cy} r={node.r} fill={zeroFill} stroke={grid} strokeWidth={2} />
            )}
            <text
              x={node.cx}
              y={height - 14}
              textAnchor="middle"
              fill={node.value > 0 ? title : subtle}
              fontSize={labelSize}
              fontWeight={node.value > 0 ? 600 : 500}
              style={{ pointerEvents: "none" }}
            >
              {shortLabel(node)}
            </text>
          </g>
        ))}
      </svg>

      {hoverNode && hoverNode.value > 0 ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: `${tooltipLeftPct}%`,
            top: `${tooltipTopPct}%`,
            transform: "translate(-50%, calc(-100% - 16px))",
            pointerEvents: "none",
            zIndex: 4,
            minWidth: 180,
            maxWidth: 280,
            padding: "10px 12px",
            borderRadius: 8,
            background: isDark ? "#1A1A1A" : "#FFFFFF",
            border: `1px solid ${isDark ? "#404040" : "#D5DCE4"}`,
            boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 4px 14px rgba(47,59,76,0.12)",
            fontSize: 11,
            lineHeight: 1.45,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ fontWeight: 700, color: title, marginBottom: 4 }}>{hoverNode.label}</div>
          <div style={{ color: subtle, marginBottom: 8 }}>
            {formatValue(hoverNode.value)} unweighted
            {hoverNode.count ? ` · ${hoverNode.count} deal${hoverNode.count === 1 ? "" : "s"}` : ""}
          </div>
          {hoverNode.contributors?.length ? (
            <>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: subtle,
                  marginBottom: 6,
                }}
              >
                Top contributors
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hoverNode.contributors.map((row, idx) => (
                  <div key={`${row.title}-${idx}`}>
                    <div style={{ color: title, fontWeight: 600, wordBreak: "break-word" }}>{row.title}</div>
                    <div style={{ color: subtle, fontSize: 10, marginTop: 1 }}>
                      {formatValue(row.revenue)}
                      {row.owner ? ` · ${row.owner}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: subtle, fontStyle: "italic" }}>No deals in this stage.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function DonutChart({ segments, isDark, size = 160, formatValue, valueLabel = "pipeline" }) {
  const colors = chartPalette(isDark);
  const { title, subtle } = chartText(isDark);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) return <EmptyChart isDark={isDark} message="No data" />;

  const fmt = formatValue || ((v) => String(v));
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -90;

  const arcs = segments.map((seg, i) => {
    const sweep = (seg.value / total) * 360;
    const start = angle;
    angle += sweep;
    const end = angle;
    const large = sweep > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos((Math.PI * start) / 180);
    const y1 = cy + r * Math.sin((Math.PI * start) / 180);
    const x2 = cx + r * Math.cos((Math.PI * end) / 180);
    const y2 = cy + r * Math.sin((Math.PI * end) / 180);
    const d = sweep >= 359.9
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...seg, d, color: seg.color || colors[i % colors.length] };
  });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.d} fill={arc.color} stroke={isDark ? "#141414" : "#fff"} strokeWidth={1.5} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.55} fill={isDark ? "#141414" : "#fff"} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={title} fontSize={17} fontWeight={700}>
          {fmt(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={subtle} fontSize={10}>
          {valueLabel}
        </text>
      </svg>
      <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map((seg, i) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: arcs[i]?.color || colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ color: title, flex: 1, minWidth: 0 }}>{seg.label}</span>
            <span style={{ color: subtle, fontWeight: 600, whiteSpace: "nowrap" }} title={String(seg.value)}>
              {fmt(seg.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ isDark, message }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: isDark ? "#9CA3AF" : "#6F8096",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      {message}
    </div>
  );
}

export function formatMonthLabel(yyyyMm) {
  const [y, m] = String(yyyyMm).split("-").map(Number);
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function formatDateLabel(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function toDateKey(value) {
  return String(value || "").slice(0, 10);
}

function parseChartUtcTime(value) {
  const dateKey = toDateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NaN;
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0, 0);
}

function buildQuarterAxisTicks(domainMinTime, domainMaxTime, { executive = false } = {}) {
  const ticks = [];
  const seen = new Set();
  const dateLabel = (t) => formatDateLabel(toDateKey(new Date(t).toISOString()));
  const add = (t, anchor, label) => {
    if (!Number.isFinite(t) || t < domainMinTime || t > domainMaxTime || seen.has(t)) return;
    seen.add(t);
    ticks.push({ t, anchor, label });
  };

  // Always pin quarter bounds so the axis reads Jul 1 … Sep 30 (etc.).
  add(domainMinTime, "start", dateLabel(domainMinTime));
  let y = new Date(domainMinTime).getUTCFullYear();
  let m = new Date(domainMinTime).getUTCMonth() + 1;
  for (let i = 0; i < 6; i++) {
    if (m > 11) {
      m = 0;
      y += 1;
    }
    const t = Date.UTC(y, m, 1, 12, 0, 0, 0);
    if (t >= domainMaxTime) break;
    add(t, "middle", executive ? formatMonthShortUtc(t) : dateLabel(t));
    m += 1;
  }
  add(domainMaxTime, "end", dateLabel(domainMaxTime));
  return ticks;
}

function formatMonthShortUtc(t) {
  return new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function chartPointKey(point) {
  return point.date || point.month || point.label;
}

function isIsoDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key));
}
