import { useState, useEffect, useMemo, useRef, useId } from "react";
import { createPortal, flushSync } from "react-dom";
import { applyProposalSnapshot, buildProposalSnapshot } from "./src/jantaProposalPersistence.js";
import {
  activeEquipmentItems,
  collapseEquipmentForStorage,
  createEmptyEquipment,
  ensureEquipmentEditorRows,
  equipmentHasContent,
  equipmentLineTotal,
  equipmentQuantity,
  equipmentRowsOfKind,
  equipmentSummaryLine,
  formatEquipmentLabel,
  parseEquipmentUnitCost,
  patchEquipmentItem,
  presetCostForEquipment,
  sortEquipmentForEditor,
} from "./src/optionalEquipment.js";
import { readSessionDraft } from "./src/proposalStorage.js";
import {
  DEFAULT_PRICING_PER_KW,
  formatUsd,
  formatUsdRange,
  formatUsdPerW,
  formatUsdPerWFromTotal,
  formatUsdPerWRange,
  formatUsdPerWRangeFromTotals,
  usdPerWatt,
  resolveSolarPricePerKw,
  solarGrossForKw,
} from "./src/solarPricing.js";

/** Same-origin absolute URL so image loads are unambiguous for canvas/PDF. */
function jantaPublicAssetUrl(relativePath) {
  if (typeof window === "undefined") return relativePath;
  const base = (import.meta.env?.BASE_URL || "/").replace(/\/$/, "");
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${window.location.origin}${base}${path}`;
}

async function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 10000);
        })
    )
  );
}

/**
 * html2canvas (used by html2pdf.js) does not reliably honor CSS filters and often
 * drops cross-origin images. Bake each <img> to an inline PNG data URL first.
 * The Adam Boudissa signature asset is white-on-black — always invert when baking
 * so it prints as dark ink on white paper.
 */
async function rasterizeImagesForHtml2Pdf(root) {
  const imgs = Array.from(root.querySelectorAll("img"));
  const revert = imgs.map((img) => [img, img.getAttribute("src"), img.style.filter]);

  await waitForImages(root);

  await Promise.all(
    imgs.map(async (img) => {
      try {
        await img.decode();
      } catch (_) {
        /* ignore */
      }
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;

      const isSignature = img.alt === "Adam Boudissa signature";
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (isSignature) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.filter = "invert(1)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        const filter = window.getComputedStyle(img).filter;
        if (filter && filter !== "none") ctx.filter = filter;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      img.src = canvas.toDataURL("image/png");
      img.style.filter = "none";
      try {
        await img.decode();
      } catch (_) {
        /* ignore */
      }
    })
  );

  return () => {
    for (const [img, src, filter] of revert) {
      if (src != null) img.setAttribute("src", src);
      else img.removeAttribute("src");
      img.style.filter = filter || "";
    }
  };
}

/*
 ══════════════════════════════════════════════════════════════════════
  JANTA POWER — Solar Proposal Generator
  
  Workflow: Upload/paste bill → Auto-extract customer + usage →
            Set system & capacity factor → Generate proposal
 ══════════════════════════════════════════════════════════════════════
*/

/** Janta produces ~1.5× the kWh/kW of conventional fixed-tilt PV at the same site. */
const JANTA_VS_TRADITIONAL_CF_RATIO = 1.5;

/** Switch volume displays from kWh to MWh when any relevant value exceeds 99,999 kWh. */
const ENERGY_MWH_THRESHOLD_KWH = 100000;

function shouldUseMwhDisplay(kwhValues) {
  const vals = (Array.isArray(kwhValues) ? kwhValues : [kwhValues]).flat();
  return Math.max(0, ...vals.map((v) => Math.abs(Number(v) || 0))) >= ENERGY_MWH_THRESHOLD_KWH;
}

function scaleEnergySeriesForDisplay(series, useMwh) {
  if (!useMwh || !series) return series;
  return series.map((v) => (v == null ? v : (Number(v) || 0) / 1000));
}

function formatMwhNumber(mwh) {
  const n = Number(mwh) || 0;
  const maxFrac = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
}

function formatEnergyKwh(kwh, useMwh) {
  const n = Number(kwh) || 0;
  if (!useMwh) return Math.round(n).toLocaleString();
  return formatMwhNumber(n / 1000);
}

function energyUnitLabel(useMwh, { perYear = false } = {}) {
  if (useMwh) return perYear ? "MWh/yr" : "MWh";
  return perYear ? "kWh/yr" : "kWh";
}

function energySeriesLegendLabel(name, useMwh) {
  return `${name} (${energyUnitLabel(useMwh)})`;
}

function formatEnergyWithUnit(kwh, useMwh, { perYear = false } = {}) {
  return `${formatEnergyKwh(kwh, useMwh)} ${energyUnitLabel(useMwh, { perYear })}`;
}

// ─── Regional production curves (kWh per kW-DC per month) ───────────
// When "Use NREL PVWatts API" is on, monthly/annual values come from NREL's PVWatts v8 instead.
const REGIONS = {
  illinois: {
    label: "Illinois",
    lat: 38.59,
    lon: -89.65,
    monthlyPerKW: [130, 140, 175, 190, 210, 215, 205, 195, 180, 165, 140, 123],
    capacityFactor: 0.231,
    credits: ["itc", "il_shines", "ameren_rebate"],
  },
  california: {
    label: "California",
    lat: 35.5,
    lon: -119.3,
    monthlyPerKW: [175, 185, 230, 245, 265, 270, 260, 250, 230, 210, 180, 160],
    capacityFactor: 0.275,
    credits: ["itc"],
  },
  texas: {
    label: "Texas (Dallas area)",
    lat: 32.7767,
    lon: -96.797,
    monthlyPerKW: [155, 165, 210, 225, 245, 250, 240, 230, 210, 190, 160, 142],
    capacityFactor: 2422 / 8760,
    credits: ["itc"],
  },
  arizona: {
    label: "Arizona / Southwest",
    lat: 33.45,
    lon: -112.07,
    monthlyPerKW: [190, 200, 250, 265, 290, 295, 280, 270, 250, 225, 195, 175],
    capacityFactor: 0.305,
    credits: ["itc"],
  },
  florida: {
    label: "Florida / Southeast",
    lat: 28.54,
    lon: -81.38,
    monthlyPerKW: [160, 170, 210, 225, 240, 235, 225, 220, 200, 180, 160, 145],
    capacityFactor: 0.238,
    credits: ["itc"],
  },
  northeast: {
    label: "Northeast (NY/NJ/PA)",
    lat: 40.71,
    lon: -74.0,
    monthlyPerKW: [110, 120, 160, 180, 200, 210, 205, 190, 170, 145, 115, 100],
    capacityFactor: 0.185,
    credits: ["itc"],
  },
  midwest: {
    label: "Midwest (OH/MN/MO)",
    lat: 39.10,
    lon: -84.5,
    monthlyPerKW: [120, 135, 170, 190, 215, 220, 210, 200, 180, 155, 125, 110],
    capacityFactor: 0.210,
    credits: ["itc"],
  },
  usvi: {
    label: "U.S. Virgin Islands",
    lat: 18.34,
    lon: -64.93,
    monthlyPerKW: [168, 175, 215, 230, 245, 240, 235, 230, 215, 200, 178, 162],
    capacityFactor: 0.258,
    credits: ["itc"],
  },
};

for (const region of Object.values(REGIONS)) {
  region.traditionalCF = region.capacityFactor / JANTA_VS_TRADITIONAL_CF_RATIO;
}

/** Janta tower increments — system kW is always an integer multiple of this value. */
const SYSTEM_SIZE_STEP_KW = 5.6;
const SQFT_PER_ACRE = 43560;
const THEME_KEY = "janta_dark_mode_v1";

function snapSystemSizeKw(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return SYSTEM_SIZE_STEP_KW;
  const steps = Math.max(1, Math.round(kw / SYSTEM_SIZE_STEP_KW));
  return Math.round(steps * SYSTEM_SIZE_STEP_KW * 10) / 10;
}

function formatKw(kw) {
  if (!Number.isFinite(kw)) return "0.0";
  return (Math.round(kw * 10) / 10).toFixed(1);
}

/** Switch capacity displays from kW to MW at this scale and above. */
const SYSTEM_MW_DISPLAY_THRESHOLD_KW = 1000;

function shouldUseMwDisplay(kwValues) {
  const vals = (Array.isArray(kwValues) ? kwValues : [kwValues]).flat();
  return Math.max(0, ...vals.map((v) => Math.abs(Number(v) || 0))) >= SYSTEM_MW_DISPLAY_THRESHOLD_KW;
}

function formatSystemKw(kw, useMw) {
  const n = Number(kw) || 0;
  if (!useMw) return formatKw(n);
  return formatMwhNumber(n / 1000);
}

function systemUnitLabel(useMw) {
  return useMw ? "MW" : "kW";
}

function formatSystemWithUnit(kw, useMw) {
  return `${formatSystemKw(kw, useMw)} ${systemUnitLabel(useMw)}`;
}

/** Show the meter label exactly as entered — no extra "Meter" prefix in the UI. */
function formatMeterDisplayName(name, meterNumber = "") {
  const n = String(name || "").trim();
  if (n) return n;
  const num = String(meterNumber || "").trim();
  if (num) return num;
  return "Untitled meter";
}

function isAutoMeterName(name, meterNumber) {
  const n = String(name || "").trim();
  if (!n) return true;
  const fromNum = autoMeterNameFromNumber(meterNumber);
  if (fromNum && n === fromNum) return true;
  if (/^Meter [A-Z]$/i.test(n)) return true;
  return false;
}

function createMeter(index = 0) {
  return {
    id: `meter-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    account: "",
    billText: "",
    billFileName: "",
    billFileNames: [],
    billUploadError: "",
    billUploadLoading: false,
    extracted: false,
    monthlyKWh: new Array(12).fill(null),
    systemSizeKw: "",
    usageSavedAt: null,
    meterNumber: "",
  };
}

/** Maximum meters per project (manual add or bill extract). */
const MAX_PROJECT_METERS = 25;

function sumMonthlyKWh(monthly) {
  return (monthly || []).reduce((sum, v) => sum + (v == null ? 0 : Number(v)), 0);
}

function normalizeExtractedMonthly(d) {
  if (d.monthlyKWh?.some((v) => v > 0)) {
    return d.monthlyKWh.map((v) => (v > 0 ? v : null));
  }
  if (d.currentKWh > 0) {
    const avg = Math.round(d.currentKWh / 12);
    return new Array(12).fill(avg);
  }
  return new Array(12).fill(null);
}

function splitBillByMeterSections(text) {
  const re = /(?:^|\n)\s*(?:Meter\s*(?:Number|No|#)?|Service\s*Point(?:\s*ID)?|Premise\s*ID|ESI\s*ID)\s*[:\-]?\s*([A-Z0-9\-]{4,})/gi;
  const matches = [...text.matchAll(re)];
  if (matches.length < 2) return [];
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    sections.push({
      meterNumber: matches[i][1].trim(),
      text: text.slice(start, end),
    });
  }
  return sections;
}

function findAllMeterNumbers(text) {
  const re = /(?:Meter\s*(?:Number|No|#)?|Service\s*Point(?:\s*ID)?|Premise\s*ID|ESI\s*ID)\s*[:\-]?\s*([A-Z0-9\-]{4,})/gi;
  const ids = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1].trim();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function findMonthlyUsageBlocks(text) {
  const blocks = [];
  const usageChunks = text.split(/(?:Usage History|Usage comparison|Monthly\s+Usage|kWh\s+Usage)/i).slice(1);
  const scan = usageChunks.length > 0 ? usageChunks : [text];
  for (const chunk of scan) {
    const nums = [];
    const numberPattern = /\b(\d{3,6})\b/g;
    let match;
    while ((match = numberPattern.exec(chunk)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 100 && n <= 200000) nums.push(n);
    }
    if (nums.length >= 12) {
      blocks.push(nums.slice(0, 12).map((v) => v));
    }
  }
  if (blocks.length === 0) {
    const nums = [];
    const numberPattern = /\b(\d{3,6})\b/g;
    let match;
    while ((match = numberPattern.exec(text)) !== null) {
      const n = parseInt(match[1], 10);
      if (n >= 100 && n <= 200000) nums.push(n);
    }
    for (let i = 0; i + 12 <= nums.length; i++) {
      blocks.push(nums.slice(i, i + 12));
    }
  }
  return blocks;
}

/** Detect one or more meters from a combined utility bill. */
function extractMetersFromBill(text) {
  if (!text || text.trim().length < 20) return { meters: [] };

  const base = extractBillData(text);
  const sections = splitBillByMeterSections(text);
  let raw = [];

  if (sections.length > 1) {
    raw = sections.map((sec) => {
      const d = extractBillData(sec.text);
      const monthlyKWh = normalizeExtractedMonthly(d);
      return {
        meterNumber: sec.meterNumber || d.meterNumber || "",
        account: d.account || base.account || "",
        monthlyKWh,
      };
    });
  } else {
    const blocks = findMonthlyUsageBlocks(text);
    const meterIds = findAllMeterNumbers(text);
    if (blocks.length > 1) {
      raw = blocks.map((block, i) => ({
        meterNumber: meterIds[i] || meterIds[0] || base.meterNumber || "",
        account: base.account || "",
        monthlyKWh: block.map((v) => v),
      }));
    } else {
      const monthlyKWh = normalizeExtractedMonthly(base);
      raw = [{
        meterNumber: meterIds[0] || base.meterNumber || "",
        account: base.account || "",
        monthlyKWh,
      }];
    }
  }

  const withAnnual = raw.map((m) => ({ ...m, annualKWh: sumMonthlyKWh(m.monthlyKWh) }));
  return { meters: withAnnual };
}

function meterRecordFromExtracted(data, index = 0) {
  const name = data.meterNumber
    ? autoMeterNameFromNumber(data.meterNumber)
    : data.account && data.account.length >= 4
      ? `Meter …${data.account.slice(-4)}`
      : "";
  return {
    ...createMeter(index),
    name,
    meterNumber: data.meterNumber || "",
    account: data.account || "",
    monthlyKWh: [...(data.monthlyKWh || new Array(12).fill(null))],
    usageSavedAt: Date.now(),
    extracted: true,
  };
}

function suggestMeterName(parsed, fallbackName) {
  if (parsed.meterNumber) return autoMeterNameFromNumber(parsed.meterNumber);
  if (parsed.account && parsed.account.length >= 4) return `Meter …${parsed.account.slice(-4)}`;
  return fallbackName;
}

function autoMeterNameFromNumber(meterNumber) {
  const raw = String(meterNumber || "").trim();
  return raw ? `Meter ${raw}` : "";
}

/** How complete a meter's manual monthly usage grid is. */
function summarizeMeterUsage(meter) {
  const monthly = meter?.monthlyKWh || [];
  const filled = monthly.filter((v) => v != null).length;
  const annual = monthly.reduce((sum, v) => sum + (v == null ? 0 : Number(v)), 0);
  return { filled, annual, complete: filled === 12, hasData: filled > 0 };
}

function formatUsageSavedAt(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function monthlyTraditionalProd(monthlyJantaProd, effectiveCF, traditionalCF) {
  if (!effectiveCF || !traditionalCF) return monthlyJantaProd.map(() => 0);
  const ratio = traditionalCF / effectiveCF;
  return monthlyJantaProd.map((v) => Math.round(Number(v) * ratio));
}

function formatCreditPerW(amount, amountHigh, capacityKw, useRange) {
  if (!capacityKw || capacityKw <= 0 || !amount) return "—";
  if (useRange && amountHigh != null && Math.round(amount) !== Math.round(amountHigh)) {
    const lo = usdPerWatt(amount, capacityKw);
    const hi = usdPerWatt(amountHigh, capacityKw);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "—";
    if (Math.abs(lo - hi) < 0.005) return formatUsdPerW(lo);
    return `$${Math.min(lo, hi).toFixed(2)} – $${Math.max(lo, hi).toFixed(2)}/W`;
  }
  return formatUsdPerWFromTotal(amount, capacityKw);
}

function buildProductionChartConfig({
  salesShowcase,
  hasUsage,
  monthlyProd,
  monthlyTradProd,
  monthlyKWhNumeric,
  usageMissingMask = [],
  forPdf = false,
  chartProdColor,
  chartUsageColor,
  chartTradColor,
  screenDark,
  useMwh = false,
}) {
  const tradColor = forPdf ? C.g700 : chartTradColor;
  const prodColor = forPdf ? C.gold : chartProdColor;
  const usageColor = forPdf ? C.navy : chartUsageColor;
  const missingColor = screenDark ? "#E85D5D" : "#D64545";
  const usageMissingLegend = usageMissingMask.some(Boolean)
    ? [{ label: "Usage not provided", color: missingColor }]
    : [];
  const scale = (arr) => scaleEnergySeriesForDisplay(arr, useMwh);
  const valueUnit = useMwh ? "MWh" : "kWh";

  if (salesShowcase) {
    if (hasUsage) {
      return {
        title: "Janta Power Comparative Analysis",
        chart: {
          data: scale(monthlyProd),
          data2: scale(monthlyTradProd),
          data3: scale(monthlyKWhNumeric),
          rawData: monthlyProd,
          rawData2: monthlyTradProd,
          rawData3: monthlyKWhNumeric,
          missingMask3: usageMissingMask,
          color1: prodColor,
          color2: tradColor,
          color3: usageColor,
          valueUnit,
          legend: [
            { label: energySeriesLegendLabel("Janta Production", useMwh), color: prodColor },
            { label: energySeriesLegendLabel("Traditional Solar", useMwh), color: tradColor },
            { label: energySeriesLegendLabel("Usage", useMwh), color: usageColor },
            ...usageMissingLegend,
          ],
        },
      };
    }
    return {
      title: "Janta Power Comparative Analysis",
      chart: {
        data: scale(monthlyProd),
        data2: scale(monthlyTradProd),
        rawData: monthlyProd,
        rawData2: monthlyTradProd,
        color1: prodColor,
        color2: tradColor,
        valueUnit,
        legend: [
          { label: energySeriesLegendLabel("Janta Production", useMwh), color: prodColor },
          { label: energySeriesLegendLabel("Traditional Solar", useMwh), color: tradColor },
        ],
      },
    };
  }

  if (hasUsage) {
    return {
      title: "Janta Power Comparative Analysis",
      chart: {
        data: scale(monthlyProd),
        data2: scale(monthlyKWhNumeric),
        rawData: monthlyProd,
        rawData2: monthlyKWhNumeric,
        missingMask2: usageMissingMask,
        color1: prodColor,
        color2: usageColor,
        valueUnit,
        legend: [
          { label: energySeriesLegendLabel("Janta Energy Production", useMwh), color: prodColor },
          { label: energySeriesLegendLabel("Current Energy Usage", useMwh), color: usageColor },
          ...usageMissingLegend,
        ],
      },
    };
  }

  return {
    title: "Janta Power Month-Month Production",
    chart: {
      data: scale(monthlyProd),
      rawData: monthlyProd,
      color1: prodColor,
      valueUnit,
      legend: [{ label: energySeriesLegendLabel("Janta Energy Production", useMwh), color: prodColor }],
    },
  };
}

function computeMeterBundle(meter, ctx) {
  const monthlyKWh = meter.monthlyKWh || new Array(12).fill(null);
  const monthlyKWhNumeric = monthlyKWh.map((v) => (v == null ? 0 : Number(v)));
  const annualKWh = monthlyKWh.reduce((a, b) => a + (b == null ? 0 : Number(b)), 0);
  const usageMissingMask = monthlyKWh.map((v) => v === null);
  const monthlyUsageProvidedCount = monthlyKWh.filter((v) => v != null).length;
  const optimalStep =
    annualKWh > 0 && ctx.effectiveAnnualPerKW > 0
      ? Math.max(1, Math.round((0.6 * annualKWh) / ctx.effectiveAnnualPerKW / SYSTEM_SIZE_STEP_KW))
      : 1;
  const optimalKw = Math.round(optimalStep * SYSTEM_SIZE_STEP_KW * 10) / 10;
  const t = String(meter.systemSizeKw || "").trim();
  const p = parseFloat(t.replace(/kw/gi, "").replace(/,/g, ""));
  const effectiveSize = t === "" ? optimalKw : (Number.isFinite(p) ? snapSystemSizeKw(p) : optimalKw);
  const monthlyProd = ctx.effectiveMonthlyPerKW.map((m) => Math.round(m * effectiveSize));
  const monthlyTradProd = monthlyTraditionalProd(monthlyProd, ctx.effectiveCF, ctx.traditionalCF);
  const annualProd = Math.round(ctx.effectiveAnnualPerKW * effectiveSize);
  const requiredKw = ctx.effectiveAnnualPerKW > 0 ? annualKWh / ctx.effectiveAnnualPerKW : 0;
  const offsetPct = requiredKw > 0 ? (effectiveSize / requiredKw) * 100 : 0;
  return {
    id: meter.id,
    name: meter.name || "",
    meterNumber: meter.meterNumber || "",
    account: meter.account || "",
    monthlyKWh,
    monthlyKWhNumeric,
    annualKWh,
    usageMissingMask,
    monthlyUsageProvidedCount,
    effectiveSize,
    optimalKw,
    monthlyProd,
    monthlyTradProd,
    annualProd,
    offsetPct,
    hasMonthlyUsageData: monthlyKWh.some((v) => v != null && Number(v) > 0),
  };
}

/** Catalog suggestions (datalist). Choosing an exact label fills suggested cost; both name and $ stay editable. */
const BATTERY_PRESETS = [
  { label: "Tesla Powerwall 2 (13.5 kWh)", cost: 11500 },
  { label: "Enphase IQ Battery 5P", cost: 12000 },
  { label: "Generac PWRcell (17.1 kWh)", cost: 14000 },
];
const GENERATOR_PRESETS = [
  { label: "Standby ~22 kW", cost: 6500 },
  { label: "Portable 7.5–9 kW", cost: 1200 },
];

const STATE_TO_REGION = {
  IL: "illinois",
  CA: "california",
  TX: "texas",
  AZ: "arizona",
  FL: "florida",
  VI: "usvi",
  NY: "northeast", NJ: "northeast", PA: "northeast", CT: "northeast", MA: "northeast", RI: "northeast", VT: "northeast", NH: "northeast", ME: "northeast",
  OH: "midwest", MI: "midwest", MN: "midwest", MO: "midwest", WI: "midwest", IA: "midwest", IN: "midwest", KS: "midwest", NE: "midwest", ND: "midwest", SD: "midwest",
};

const REGION_LAND_VALUE_PER_ACRE = {
  illinois: 12000,
  california: 18000,
  texas: 9000,
  arizona: 7000,
  florida: 11000,
  northeast: 14000,
  midwest: 9500,
  usvi: 18000,
};

const STATE_LAND_VALUE_PER_ACRE = {
  IL: 12000, CA: 18000, TX: 9000, AZ: 7000, FL: 11000,
  NY: 14500, NJ: 15000, PA: 12000, CT: 14000, MA: 14500, RI: 14000, VT: 9000, NH: 10000, ME: 8500,
  OH: 9000, MI: 8500, MN: 8000, MO: 7500, WI: 8000, IA: 9000, IN: 8500, KS: 6500, NE: 6000, ND: 5000, SD: 5500,
  CO: 7000, OR: 8500, WA: 12000, NC: 8500, SC: 7000, GA: 8000, VA: 9000, MD: 11500, DE: 10000,
  OK: 6000, NM: 4500, NV: 5000, ID: 6500, UT: 6000, MT: 4500, WY: 3500, AK: 2500, HI: 26000, LA: 6500, MS: 5500,
  AL: 6500, AR: 6000, KY: 6000, TN: 7000, WV: 5000, DC: 20000, VI: 18000,
};

const COUNTY_LAND_VALUE_PER_ACRE = {
  "madison,il": 13000,
  "st. clair,il": 11500,
  "st clair,il": 11500,
  "cook,il": 20000,
  "dupage,il": 18000,
  "will,il": 15000,
  "kane,il": 14000,
  "lake,il": 17000,
  "los angeles,ca": 22000,
  "orange,ca": 23000,
  "san diego,ca": 21000,
  "harris,tx": 9500,
  "dallas,tx": 10000,
  "maricopa,az": 7500,
  "miami-dade,fl": 14000,
  "broward,fl": 13500,
  "new york,ny": 26000,
};

const STATE_NAME_TO_ABBR = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN",
  iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

function regionFromCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat >= 36 && lat <= 43 && lon >= -92 && lon <= -87) return "illinois";
  if (lat >= 32 && lat <= 42 && lon >= -125 && lon <= -114) return "california";
  if (lat >= 25 && lat <= 37 && lon >= -107 && lon <= -93) return "texas";
  if (lat >= 31 && lat <= 38 && lon >= -115 && lon <= -109) return "arizona";
  if (lat >= 24 && lat <= 31 && lon >= -88 && lon <= -79) return "florida";
  if (lat >= 17.5 && lat <= 18.6 && lon >= -65.1 && lon <= -64.2) return "usvi";
  if (lat >= 39 && lon >= -80) return "northeast";
  if (lat >= 36 && lon <= -80 && lon >= -104) return "midwest";
  return null;
}

function parseAddressHints(address = "") {
  const out = { stateAbbr: "", zip: "", lat: null, lon: null };
  if (!address) return out;
  const txt = String(address);

  const coordMatch = txt.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (coordMatch) {
    out.lat = parseFloat(coordMatch[1]);
    out.lon = parseFloat(coordMatch[2]);
  }

  const zipMatch = txt.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) out.zip = zipMatch[1];

  const stateCodeMatch = txt.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i);
  if (stateCodeMatch) out.stateAbbr = stateCodeMatch[1].toUpperCase();

  if (!out.stateAbbr) {
    const lower = txt.toLowerCase();
    if (/u\.?s\.?\s*virgin\s*islands|\busvi\b|st\.?\s*thomas|st\.?\s*croix|st\.?\s*john/.test(lower)) {
      out.stateAbbr = "VI";
    } else {
      const stateName = Object.keys(STATE_NAME_TO_ABBR).find((s) => lower.includes(s));
      if (stateName) out.stateAbbr = STATE_NAME_TO_ABBR[stateName];
    }
  }

  return out;
}

function regionFromZip(zip = "") {
  if (!zip) return null;
  const first = Number(zip[0]);
  if (!Number.isFinite(first)) return null;
  if (first === 9) return "california";
  if (first === 7) return "texas";
  if (first === 8) return "arizona";
  if (first === 3) return "florida";
  if (zip.startsWith("008")) return "usvi";
  if (first <= 2) return "northeast";
  if (first >= 4 && first <= 6) return "midwest";
  return null;
}

function detectRegionFromLocation({ address, lat, lon, utilityName }) {
  const byCoord = regionFromCoordinates(lat, lon);
  if (byCoord) return byCoord;

  const hints = parseAddressHints(address);
  const byAddrCoord = regionFromCoordinates(hints.lat, hints.lon);
  if (byAddrCoord) return byAddrCoord;

  const byState = hints.stateAbbr ? STATE_TO_REGION[hints.stateAbbr] : null;
  if (byState) return byState;

  const byZip = regionFromZip(hints.zip);
  if (byZip) return byZip;

  const util = (utilityName || "").toLowerCase();
  if (util.includes("ameren")) return "illinois";
  if (util.includes("edison") || util.includes("sce")) return "california";
  if (util.includes("oncor") || util.includes("ercot") || util.includes("txu")) return "texas";
  if (util.includes("wapa") || util.includes("virgin islands")) return "usvi";
  return "texas";
}

function detectStateFromLocation({ address, utilityName }) {
  const hints = parseAddressHints(address);
  if (hints.stateAbbr && STATE_INCENTIVES[hints.stateAbbr]) return hints.stateAbbr;
  const util = (utilityName || "").toLowerCase();
  if (util.includes("ameren")) return "IL";
  if (util.includes("edison") || util.includes("sce")) return "CA";
  if (util.includes("oncor") || util.includes("ercot") || util.includes("txu")) return "TX";
  if (util.includes("wapa") || util.includes("virgin islands")) return "VI";
  return "TX";
}

// ─── NREL PVWatts v8 API (SAM-style production data) ─────────────────
const PVWATTS_BASE = "https://developer.nrel.gov/api/pvwatts/v8.json";

const ARRAY_TYPES = [
  { value: 0, label: "Fixed (open rack)" },
  { value: 1, label: "Fixed (roof)" },
  { value: 2, label: "1-axis" },
  { value: 3, label: "1-axis backtracking" },
  { value: 4, label: "Azimuthal axis (2-axis)" },
];
const MODULE_TYPES = [
  { value: 0, label: "Standard" },
  { value: 1, label: "Premium" },
  { value: 2, label: "Thin film" },
];

async function fetchPVWatts(apiKey, lat, lon, systemCapacityKw = 1, options = {}) {
  const {
    tilt = 60,
    azimuth = 180,
    arrayType = 4,
    moduleType = 0,
    losses = 2,
    dcAcRatio = 1.0,
  } = options;
  const params = new URLSearchParams({
    api_key: apiKey,
    system_capacity: String(systemCapacityKw),
    module_type: String(moduleType),
    array_type: String(arrayType),
    azimuth: String(azimuth),
    tilt: String(tilt),
    dataset: "nsrdb",
    timeframe: "monthly",
    lat: String(lat),
    lon: String(lon),
  });
  const lossPct = Number.isFinite(Number(losses)) ? Math.max(-5, Math.min(99, Number(losses))) : 2;
  params.set("losses", String(lossPct)); // required by API, range -5 to 99
  if (dcAcRatio != null && dcAcRatio > 0) params.set("dc_ac_ratio", String(dcAcRatio));
  const res = await fetch(`${PVWATTS_BASE}?${params}`);
  const data = await res.json();
  if (data.errors && data.errors.length) {
    throw new Error(data.errors.join(" ") || "PVWatts API error");
  }
  const out = data.outputs || {};
  const acMonthly = out.ac_monthly || [];
  const acAnnual = out.ac_annual != null ? out.ac_annual : acMonthly.reduce((a, b) => a + b, 0);
  const scale = 1 / systemCapacityKw;
  const monthlyPerKW = acMonthly.length === 12
    ? acMonthly.map((v) => Math.round(Number(v) * scale))
    : null;
  const annualPerKW = acAnnual * scale;
  const cf = annualPerKW / 8760;
  return {
    monthlyPerKW: monthlyPerKW || Array(12).fill(Math.round(annualPerKW / 12)),
    annualPerKW,
    capacityFactor: cf,
  };
}

// ─── Geocode address to lat/lon (OpenStreetMap Nominatim) ────────────
async function geocodeAddress(address) {
  const q = encodeURIComponent(address.trim());
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { "Accept-Language": "en", "User-Agent": "JantaProposalGenerator/1.0" } }
  );
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Address not found. Try including city and state.");
  }
  const { lat, lon } = data[0];
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

async function reverseGeocodeCountyState(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=jsonv2&addressdetails=1&zoom=10`,
    { headers: { "Accept-Language": "en", "User-Agent": "JantaProposalGenerator/1.0" } }
  );
  const data = await res.json();
  const addr = data?.address || {};
  const countyRaw = addr.county || addr.city_district || "";
  const county = String(countyRaw).replace(/\s+county$/i, "").trim();
  const stateName = String(addr.state || "").toLowerCase().trim();
  const stateAbbr = STATE_NAME_TO_ABBR[stateName] || String(addr.state_code || "").toUpperCase() || "";
  return { county, stateAbbr };
}

function estimateSavedLandValuePerAcre({ county, stateAbbr, region }) {
  const countyKey = `${String(county || "").toLowerCase().replace(/\s+/g, " ").trim()},${String(stateAbbr || "").toLowerCase()}`;
  if (countyKey && COUNTY_LAND_VALUE_PER_ACRE[countyKey] != null) {
    return { value: COUNTY_LAND_VALUE_PER_ACRE[countyKey], source: `County estimate (${county}, ${stateAbbr})` };
  }
  if (stateAbbr && STATE_LAND_VALUE_PER_ACRE[stateAbbr] != null) {
    return { value: STATE_LAND_VALUE_PER_ACRE[stateAbbr], source: `State estimate (${stateAbbr})` };
  }
  const regionValue = REGION_LAND_VALUE_PER_ACRE[region] ?? REGION_LAND_VALUE_PER_ACRE.texas;
  return { value: regionValue, source: `Region fallback (${region || "texas"})` };
}

async function extractTextFromPdfFile(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => (it.str || "")).join(" ");
    pages.push(pageText);
  }
  return pages.join("\n");
}

// ─── State Incentive Database (2026) ────────────────────────────────
// Federal residential ITC expired Dec 31, 2025 (One Big Beautiful Bill).
// Commercial ITC (Section 48E) still available for third-party / business-owned.
// State incentives auto-populate when state is selected.
const STATE_INCENTIVES = {
  AL: { name: "Alabama", tax: 0, propExempt: false, salesExempt: false, netMetering: "Limited", srec: null, rebates: [], notes: "No state solar incentives. Some TVA programs available." },
  AK: { name: "Alaska", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Limited state incentives." },
  AZ: { name: "Arizona", tax: 0.25, taxCap: 1000, propExempt: true, salesExempt: false, netMetering: "Export rate", srec: null, rebates: [{ name: "APS/SRP Utility Rebates", type: "varies" }], notes: "25% state tax credit up to $1,000. Property tax exemption." },
  AR: { name: "Arkansas", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering available. Limited state incentives." },
  CA: { name: "California", tax: 0, propExempt: true, salesExempt: false, netMetering: "NEM 3.0", srec: null, rebates: [{ name: "SGIP Battery Rebate", type: "battery" }, { name: "DAC-SASH Low-Income", type: "low-income" }], notes: "NEM 3.0 (Net Billing). Property tax exemption. SGIP for batteries. Self-Generation Incentive Program." },
  CO: { name: "Colorado", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [{ name: "Xcel Solar*Rewards", type: "performance" }], notes: "Property & sales tax exempt. Xcel rebate programs." },
  CT: { name: "Connecticut", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [{ name: "RSIP Rebate", type: "upfront" }], notes: "Residential Solar Investment Program. Sales & property tax exempt." },
  DE: { name: "Delaware", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: { perMWh: 25, years: 15 }, rebates: [{ name: "Green Energy Fund", type: "rebate", perW: 0.55 }], notes: "SREC market active. Green Energy Fund rebate." },
  FL: { name: "Florida", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "Property & sales tax exemption. Strong net metering." },
  GA: { name: "Georgia", tax: 0.25, taxCap: 2500, propExempt: false, salesExempt: false, netMetering: "Limited", srec: null, rebates: [], notes: "25% state tax credit up to $2,500." },
  HI: { name: "Hawaii", tax: 0.35, taxCap: 5000, propExempt: true, salesExempt: false, netMetering: "Export rate", srec: null, rebates: [], notes: "35% state tax credit up to $5,000. Excellent solar resource." },
  ID: { name: "Idaho", tax: 0.40, taxCap: 5000, propExempt: false, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "40% state tax credit (max $5K first yr, remainder over 3 yrs). Sales tax exempt." },
  IL: { name: "Illinois", tax: 0, propExempt: true, salesExempt: true, netMetering: "NEM 2.0 (Smart Solar)", srec: { perMWh: 75.48, years: 15, label: "IL Shines SREC (0-10kW)" }, rebates: [{ name: "ComEd/Ameren DG Rebate", type: "upfront", perKW: 300 }], notes: "Illinois Shines (ABP) SREC program — upfront lump sum for 15 yrs of RECs. $75.48/REC for <10kW (Group A). Smart Solar Billing (NEM 2.0) since Jan 2025. Property & sales tax exempt." },
  IN: { name: "Indiana", tax: 0, propExempt: true, salesExempt: false, netMetering: "Reduced rate", srec: null, rebates: [], notes: "Property tax exempt. Net metering at reduced rate." },
  IA: { name: "Iowa", tax: 0.15, taxCap: 5000, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "15% state tax credit up to $5,000. Property & sales tax exempt." },
  KS: { name: "Kansas", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption." },
  KY: { name: "Kentucky", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering. Limited state incentives." },
  LA: { name: "Louisiana", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering available." },
  ME: { name: "Maine", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "Property & sales tax exempt. Strong net metering." },
  MD: { name: "Maryland", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: { perMWh: 50, years: 15 }, rebates: [{ name: "MD Energy Admin Grant", type: "grant" }], notes: "SREC market. Sales & property tax exempt. County property tax credits up to $5K/yr." },
  MA: { name: "Massachusetts", tax: 0.15, taxCap: 1000, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [{ name: "SMART Program", type: "performance" }], notes: "15% state tax credit (max $1,000). SMART performance payments. Sales & property tax exempt." },
  MI: { name: "Michigan", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering. Limited state incentives." },
  MN: { name: "Minnesota", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [{ name: "Xcel Solar*Rewards", type: "performance" }], notes: "Property tax exempt. Utility rebate programs." },
  MS: { name: "Mississippi", tax: 0, propExempt: false, salesExempt: false, netMetering: "Limited", srec: null, rebates: [], notes: "Minimal state incentives." },
  MO: { name: "Missouri", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [{ name: "Ameren MO Rebate", type: "rebate" }], notes: "Property tax exempt. Utility rebates through Ameren MO and Empire District." },
  MT: { name: "Montana", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exempt. NorthWestern Energy credits." },
  NE: { name: "Nebraska", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering. Public power utilities." },
  NV: { name: "Nevada", tax: 0, propExempt: true, salesExempt: false, netMetering: "Net billing", srec: null, rebates: [], notes: "Property tax abatement (up to 20 yrs). Net billing." },
  NH: { name: "New Hampshire", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption. Net metering up to 1 MW." },
  NJ: { name: "New Jersey", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: { perMWh: 85, years: 15, label: "SuSI SREC-II" }, rebates: [], notes: "Successor Solar Incentive (SuSI) — SREC-IIs at $85/MWh for 15 yrs. Sales & property tax exempt. Among best state incentives." },
  NM: { name: "New Mexico", tax: 0.10, taxCap: 6000, propExempt: false, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "10% state tax credit. Sustainable building tax credit. Sales tax exempt." },
  NY: { name: "New York", tax: 0.25, taxCap: 5000, propExempt: true, salesExempt: true, netMetering: "VDER", srec: null, rebates: [{ name: "NY-Sun Megawatt Block", type: "upfront", perW: 0.20 }], notes: "25% state tax credit (max $5,000). NY-Sun upfront incentive. NYC property tax abatement. Sales & property tax exempt." },
  NC: { name: "North Carolina", tax: 0, propExempt: true, salesExempt: false, netMetering: "Reduced rate", srec: null, rebates: [{ name: "Duke Energy Rebate", type: "rebate" }], notes: "Property tax exemption. Duke Energy rebate programs up to $9,000." },
  ND: { name: "North Dakota", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption for 5 years." },
  OH: { name: "Ohio", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: { perMWh: 6, years: 15 }, rebates: [], notes: "SREC market (lower value). Property tax exempt." },
  OK: { name: "Oklahoma", tax: 0, propExempt: false, salesExempt: false, netMetering: "Varies", srec: null, rebates: [], notes: "No state income tax credit. Some local net metering." },
  OR: { name: "Oregon", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [{ name: "Energy Trust of Oregon", type: "rebate", perW: 0.40 }], notes: "Energy Trust rebates ($0.40/W). Property tax exempt. PGE/Pacific Power rebates." },
  PA: { name: "Pennsylvania", tax: 0, propExempt: false, salesExempt: true, netMetering: "Yes", srec: { perMWh: 31, years: 15 }, rebates: [{ name: "PECO Rebate", type: "rebate", flat: 500 }], notes: "SREC market. Sales tax exempt. PECO $500 rebate." },
  RI: { name: "Rhode Island", tax: 0.25, taxCap: 7000, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [{ name: "RE Growth Program", type: "performance", perKWh: 0.2875 }], notes: "25% state tax credit (max $7,000). RE Growth pays $0.2875/kWh for 15 yrs. Sales & property tax exempt." },
  SC: { name: "South Carolina", tax: 0.25, taxCap: 3500, propExempt: false, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "25% state tax credit (max $3,500 or 50% of liability). Sales tax exempt." },
  SD: { name: "South Dakota", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption. No state income tax." },
  TN: { name: "Tennessee", tax: 0, propExempt: false, salesExempt: true, netMetering: "Varies (TVA)", srec: null, rebates: [], notes: "No state income tax. Sales tax exempt. TVA programs." },
  TX: { name: "Texas", tax: 0, propExempt: true, salesExempt: false, netMetering: "Varies by utility", srec: null, rebates: [{ name: "Oncor/AE/CPS Utility Rebates", type: "varies" }], notes: "Property tax exempt. No state income tax. Utility-level rebates (Oncor, Austin Energy, CPS Energy). Buyback rates vary by REP." },
  UT: { name: "Utah", tax: 0, propExempt: false, salesExempt: false, netMetering: "Export credit", srec: null, rebates: [], notes: "Export credit program. Limited state incentives." },
  VT: { name: "Vermont", tax: 0, propExempt: true, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "Property & sales tax exempt. Net metering." },
  VI: { name: "U.S. Virgin Islands", tax: 0, propExempt: false, salesExempt: false, netMetering: "Varies", srec: null, rebates: [], notes: "Federal commercial ITC may apply. WAPA utility. Grid power averages ~$0.41/kWh." },
  VA: { name: "Virginia", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: { perMWh: 15, years: 15 }, rebates: [], notes: "SREC market. Property tax exemption." },
  WA: { name: "Washington", tax: 0, propExempt: false, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "Sales tax exemption. Net metering. No state income tax." },
  WV: { name: "West Virginia", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering. Limited incentives." },
  WI: { name: "Wisconsin", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [{ name: "Focus on Energy", type: "rebate" }], notes: "Property tax exempt. Focus on Energy rebates." },
  WY: { name: "Wyoming", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption. Net metering." },
  DC: { name: "Washington D.C.", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: { perMWh: 350, years: 15, label: "DC SREC" }, rebates: [], notes: "Highest SREC value in the nation (~$350/MWh). Property tax exempt." },
};

// Default project pricing ($/kW). User-editable in Step 2.

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const HOURS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((d) => d * 24);

const MONTH_MAP = {
  jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
  january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
};

// ─── Bill Text Parser ───────────────────────────────────────────────
function extractBillData(text) {
  const result = {
    customerName: "", address: "", city: "", state: "", zip: "",
    account: "", email: "", phone: "",
    meterNumber: "",
    monthlyKWh: new Array(12).fill(0),
    currentKWh: 0, totalCharge: 0, ratePerKWh: 0,
    utilityName: "", billDate: "",
    raw: text,
  };

  if (!text || text.trim().length < 20) return result;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const fullText = text.toUpperCase();
  const compactText = text.replace(/\s+/g, " ").trim();

  // ── Detect utility ──
  if (fullText.includes("AMEREN")) result.utilityName = "Ameren Illinois";
  else if (fullText.includes("EDISON") || fullText.includes("SCE")) result.utilityName = "Southern California Edison";
  else if (fullText.includes("ONCOR") || fullText.includes("TXU") || fullText.includes("ERCOT")) result.utilityName = "Texas Utility";
  else if (fullText.includes("APS") || fullText.includes("SRP")) result.utilityName = "Arizona Utility";
  else if (fullText.includes("FPL") || fullText.includes("DUKE")) result.utilityName = "Southeast Utility";
  else if (fullText.includes("CONED") || fullText.includes("PSEG")) result.utilityName = "Northeast Utility";

  // ── Customer Name ──
  for (const line of lines) {
    const nameMatch = line.match(/Customer\s*Name\s*[:\-]?\s*(.+)/i);
    if (nameMatch) { result.customerName = nameMatch[1].trim(); break; }
  }
  // Fallback: label-style match in compacted text (works when PDF text has few line breaks)
  if (!result.customerName) {
    const m = compactText.match(/Customer\s*Name\s*[:\-]?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3})/i);
    if (m) result.customerName = m[1].trim();
  }
  // Fallback: look for ALL CAPS name patterns (2-3 words)
  if (!result.customerName) {
    for (const line of lines) {
      if (/^[A-Z][A-Z\s]{4,30}$/.test(line) && !/(ILLINOIS|EDISON|AMEREN|ACCOUNT|SERVICE|CUSTOMER|ELECTRIC|CHARGE|SUMMARY|BILLING|IMPORTANT|PAYMENT|TOTAL|USAGE)/.test(line)) {
        result.customerName = line;
        break;
      }
    }
  }
  // Fallback: title-case human-name lines (e.g., "Kerry E Turk")
  if (!result.customerName) {
    for (const line of lines.slice(0, 40)) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (/\d/.test(clean)) continue;
      if (/(account|service|address|usage|bill|summary|amount|payment|meter|electric|statement|due)/i.test(clean)) continue;
      if (/^[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+){1,3}$/.test(clean)) {
        result.customerName = clean;
        break;
      }
    }
  }

  // ── Address ──
  for (const line of lines) {
    const addrMatch = line.match(/Service\s*Address\s*[:\-]?\s*(.+)/i);
    if (addrMatch) {
      result.address = addrMatch[1].trim();
      // Look for city/state/zip on next lines
      const idx = lines.indexOf(line);
      for (let j = idx + 1; j < Math.min(idx + 3, lines.length); j++) {
        const csz = lines[j].match(/([A-Z\s]+),?\s*([A-Z]{2})\s*(\d{5})/i);
        if (csz) {
          result.city = csz[1].trim();
          result.state = csz[2].trim();
          result.zip = csz[3].trim();
          result.address += `, ${result.city}, ${result.state} ${result.zip}`;
          break;
        }
      }
      break;
    }
  }
  // If no explicit "Service Address", look for street pattern near customer name
  if (!result.address) {
    for (const line of lines) {
      if (/^\d+\s+[A-Z]/.test(line) && /\b(ST|CT|AVE|DR|RD|LN|BLVD|WAY|PL|CIR|PLANT)\b/i.test(line)) {
        result.address = line;
        break;
      }
    }
  }

  // ── Account Number ──
  for (const line of lines) {
    const acctMatch = line.match(/Account\s*(?:Number|#|No)?\s*[:\-]?\s*([\d\-]+)/i);
    if (acctMatch && acctMatch[1].length >= 6) { result.account = acctMatch[1]; break; }
  }
  for (const line of lines) {
    const meterMatch = line.match(/(?:Meter\s*(?:Number|No|#)|Service\s*Point|Premise|ESI\s*ID|POD\s*ID)\s*[:\-]?\s*([A-Z0-9\-]+)/i);
    if (meterMatch && meterMatch[1]) { result.meterNumber = meterMatch[1].trim(); break; }
  }

  // ── Email & Phone ──
  const emailMatch = compactText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch) result.email = emailMatch[0].trim();

  const phoneMatch = compactText.match(/(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  // ── Current Usage ──
  // Look for "Total kWh" with a number
  for (const line of lines) {
    const kwhMatch = line.match(/Total\s*(?:kWh|electricity)[^\d]*(\d[\d,]+\.?\d*)/i);
    if (kwhMatch) { result.currentKWh = parseFloat(kwhMatch[1].replace(/,/g, "")); break; }
  }
  // Also try "USAGE" field
  if (!result.currentKWh) {
    for (const line of lines) {
      const m = line.match(/(?:USAGE|used this month)[^\d]*(\d[\d,]+\.?\d*)\s*(?:kWh)?/i);
      if (m) { result.currentKWh = parseFloat(m[1].replace(/,/g, "")); break; }
    }
  }

  // ── Total Charge ──
  for (const line of lines) {
    const chargeMatch = line.match(/Total\s*(?:Electric|Amount\s*Due|Charge)[^\$]*\$\s*([\d,]+\.?\d*)/i);
    if (chargeMatch) { result.totalCharge = parseFloat(chargeMatch[1].replace(/,/g, "")); break; }
  }
  if (!result.totalCharge) {
    const amtMatch = fullText.match(/AMOUNT\s*DUE[^\$]*\$([\d,]+\.?\d*)/);
    if (amtMatch) result.totalCharge = parseFloat(amtMatch[1].replace(/,/g, ""));
  }

  // ── Rate ──
  if (result.currentKWh > 0 && result.totalCharge > 0) {
    result.ratePerKWh = result.totalCharge / result.currentKWh;
  }
  // Also look for explicit rate
  for (const line of lines) {
    const rateMatch = line.match(/(?:price to compare|cents per kwh|rate)[^\d]*\$?(0\.\d+)/i);
    if (rateMatch) { result.ratePerKWh = parseFloat(rateMatch[1]); break; }
  }

  // ── Monthly Usage History ──
  // Strategy 1: Look for usage comparison tables (SCE style)
  // Strategy 2: Look for bar chart values (Ameren style) - sequential numbers with month context
  // Strategy 3: Parse comma/tab separated month,kwh pairs
  
  // Try to find 12 sequential kWh values near month labels
  const kwhValues = [];
  const numberPattern = /\b(\d{3,5})\b/g;
  let match;
  
  // For Ameren: the usage history shows numbers like 1963, 1613, 1316...
  // For SCE: usage comparison shows monthly totals
  
  // Look for a section with monthly kWh data
  const usageSection = text.match(/(?:Usage History|Usage comparison|kWh)[^]*?(?=\n\n|\bGas\b|Average Daily)/i);
  if (usageSection) {
    const nums = [];
    while ((match = numberPattern.exec(usageSection[0])) !== null) {
      const n = parseInt(match[1]);
      if (n >= 100 && n <= 100000) nums.push(n);
    }
    if (nums.length >= 12) {
      // Take first 12 that look like monthly totals
      for (let i = 0; i < Math.min(12, nums.length); i++) {
        kwhValues.push(nums[i]);
      }
    }
  }

  // Fallback: scan entire text for month+number patterns
  if (kwhValues.length < 12) {
    for (const line of lines) {
      const monthNum = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s*'?\d{0,2}\s*[,\t:|\s]+(\d[\d,]+)/i);
      if (monthNum) {
        const mo = monthNum[1].toLowerCase().slice(0, 3);
        const val = parseFloat(monthNum[2].replace(/,/g, ""));
        if (MONTH_MAP[mo] !== undefined && val >= 50 && val < 200000) {
          result.monthlyKWh[MONTH_MAP[mo]] = val;
        }
      }
    }
  }

  // If we got values from the section scan, assign them
  if (kwhValues.length >= 12 && result.monthlyKWh.every(v => v === 0)) {
    for (let i = 0; i < 12; i++) result.monthlyKWh[i] = kwhValues[i];
  }

  return result;
}

// ─── Colors ─────────────────────────────────────────────────────────
const C = {
  navy: "#2F3B4C", navyLight: "#43566D", gold: "#F3B664", goldLight: "#F7C983",
  white: "#FFFFFF", offWhite: "#F3F4F6", cream: "#F9FAFB",
  g100: "#ECEEF1", g200: "#DDE2E8", g300: "#C7CFD8", g500: "#6F8096", g700: "#354356",
  green: "#2A9D8F", red: "#F55A5A", blue: "#87A9C4",
};
const LIGHT_C = { ...C };
const DARK_C = {
  navy: "#15100C",
  navyLight: "#1D1611",
  gold: "#C9933E",
  goldLight: "#E4BE72",
  white: "#14100D",
  offWhite: "#0C0907",
  cream: "#17120E",
  g100: "#1F1813",
  g200: "#2C221A",
  g300: "#3B2D21",
  g500: "#C1B5A5",
  g700: "#F0E8DF",
  green: "#80C29A",
  red: "#E08C7E",
  blue: "#D4A15A",
};

// ─── Micro Components ───────────────────────────────────────────────
const fontSans = "'Inter', system-ui, -apple-system, sans-serif";
const fontSerif = "'Inter', system-ui, -apple-system, sans-serif";

function systemSizeStepControlStyle(pressed) {
  return {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: `1px solid ${C.g200}`,
    background: pressed ? C.blue : C.g300,
    color: "#F8F2E8",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    padding: 0,
    fontFamily: fontSans,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: pressed ? "pointer" : "default",
    opacity: pressed ? 1 : 0.45,
  };
}

function Pill({ children, active, onClick }) {
  return <button onClick={onClick} style={{
    padding: "8px 18px", borderRadius: 14, border: `1px solid ${active ? C.blue : C.g200}`,
    background: active ? C.blue : C.white, color: active ? C.white : C.g700,
    cursor: "pointer", fontSize: 12, fontFamily: fontSans, fontWeight: active ? 600 : 500,
    transition: "all 0.15s",
  }}>{children}</button>;
}

function Field({ label, value, onChange, type = "text", unit, placeholder, disabled, wide, rows, endSlot, shrink, list, step, min, max, beforeUnit, inlineUnit }) {
  const El = rows ? "textarea" : "input";
  const numProps = !rows && type === "number" ? {
    ...(step !== undefined ? { step } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  } : {};
  const hasTrailingUnitPill = Boolean(unit && !inlineUnit);
  const hasRightSegments = Boolean(beforeUnit || hasTrailingUnitPill);
  const segmentTail = (
    <>
      {beforeUnit && (
        <div style={{
          padding: "8px 10px", background: C.g100, color: C.g700, fontSize: 11, fontWeight: 600,
          border: `1px solid ${C.g200}`, borderLeft: "none", fontFamily: fontSans, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", borderRadius: hasTrailingUnitPill ? 0 : "0 8px 8px 0",
        }}>
          {beforeUnit}
        </div>
      )}
      {hasTrailingUnitPill && (
        <div style={{
          padding: "8px 8px", background: C.g100, color: C.g500, fontSize: 11,
          borderRadius: "0 8px 8px 0", border: `1px solid ${C.g200}`, borderLeft: "none",
          fontFamily: fontSans, whiteSpace: "nowrap", display: "flex", alignItems: "center",
        }}>{unit}</div>
      )}
    </>
  );
  const useInlineUnit = Boolean(!rows && inlineUnit);
  const inputRow = useInlineUnit ? (
    <>
      <div style={{
        display: "flex", alignItems: "center", flex: 1, minWidth: shrink ? 0 : undefined,
        background: disabled ? C.g100 : C.cream, border: `1px solid ${C.g200}`,
        borderRadius: hasRightSegments ? "8px 0 0 8px" : 8, boxSizing: "border-box",
      }}>
        <El type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          disabled={disabled} list={list || undefined}
          {...numProps}
          style={{
            flex: 1, minWidth: 0, padding: "8px 6px 8px 10px", background: "transparent",
            border: "none", borderRadius: 0, color: C.g700, fontSize: 13, outline: "none", fontFamily: fontSans,
            boxSizing: "border-box",
          }}
        />
        <span style={{ color: C.g500, fontSize: 12, paddingRight: 10, fontFamily: fontSans, flexShrink: 0, userSelect: "none" }}>{inlineUnit}</span>
      </div>
      {segmentTail}
    </>
  ) : (
    <>
      <El type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        disabled={disabled} rows={rows} list={!rows && list ? list : undefined}
        {...numProps}
        style={{
          flex: 1, minWidth: shrink ? 0 : undefined, padding: rows ? 10 : "8px 10px", background: disabled ? C.g100 : C.cream,
          border: `1px solid ${C.g200}`, borderRadius: hasRightSegments ? "8px 0 0 8px" : 8,
          color: C.g700, fontSize: 13, outline: "none", fontFamily: rows ? "monospace" : fontSans,
          resize: rows ? "vertical" : undefined, boxSizing: "border-box", width: "100%",
        }}
      />
      {!rows && segmentTail}
    </>
  );
  return (
    <div style={{
      marginBottom: 8,
      flex: wide ? "1 1 100%" : "1 1 auto",
      minWidth: wide ? "100%" : shrink ? 0 : 140,
      width: shrink ? "100%" : undefined,
      maxWidth: shrink ? "100%" : undefined,
    }}
    >
      {label && <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>{label}</label>}
      {endSlot ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", flex: 1, minWidth: 0 }}>{inputRow}</div>
          {endSlot}
        </div>
      ) : (
        <div style={{ display: "flex", minWidth: shrink ? 0 : undefined }}>{inputRow}</div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, color = C.navy, highlight }) {
  return (
    <div style={{
      background: highlight ? `${color}12` : C.cream, borderRadius: 12, padding: "12px 14px",
      flex: 1, minWidth: 100, border: `1px solid ${highlight ? color + "22" : C.g200}`,
    }}>
      <div style={{ color: C.g500, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2, fontFamily: fontSans }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: fontSerif, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: C.g500, fontSize: 10, marginTop: 1, fontFamily: fontSans }}>{sub}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled = false, style }) {
  const canClick = !disabled;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canClick ? "pointer" : "not-allowed", marginBottom: 0, userSelect: "none", opacity: disabled ? 0.55 : 1, ...style }}>
      <div
        role="presentation"
        onClick={() => canClick && onChange(!checked)}
        style={{
          width: 34,
          height: 18,
          borderRadius: 9,
          background: disabled ? C.g300 : checked ? C.blue : C.g300,
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: C.white,
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            transition: "left 0.15s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </div>
      <span style={{ color: C.g700, fontSize: 12, fontFamily: fontSans }}>{label}</span>
    </label>
  );
}

function formatBarChartEnergyValue(displayVal, valueUnit) {
  const n = Number(displayVal) || 0;
  if (valueUnit === "kW") return n.toFixed(1);
  if (valueUnit === "MWh") return formatMwhNumber(n);
  return Math.round(n).toLocaleString();
}

function formatBarChartEnergyTooltip(rawKwh, valueUnit) {
  const n = Number(rawKwh) || 0;
  if (valueUnit === "MWh") return `${formatMwhNumber(n / 1000)} MWh`;
  return `${Math.round(n).toLocaleString()} kWh`;
}

function BarChart({ data, data2, data3, labels, color1 = C.navy, color2 = C.gold, color3 = C.g700, height = 170, legend, showBarValues = false, missingMask1, missingMask2, missingMask3, missingBarColor = "#D64545", maxScale, valueUnit = "kWh", rawData, rawData2, rawData3 }) {
  const eff1 = data.map((v, i) => (missingMask1?.[i] ? 0 : Number(v) || 0));
  const eff2 = (data2 || []).map((v, i) => (missingMask2?.[i] ? 0 : Number(v) || 0));
  const eff3 = (data3 || []).map((v, i) => (missingMask3?.[i] ? 0 : Number(v) || 0));
  const max = maxScale ?? Math.max(...eff1, ...eff2, ...eff3, 1);
  const tooltipRaw1 = rawData ?? data;
  const tooltipRaw2 = rawData2 ?? data2;
  const tooltipRaw3 = rawData3 ?? data3;
  const [hoverBar, setHoverBar] = useState(null); // { idx, series: 1 | 2 | 3 }
  const seriesMissing = (series, idx) => {
    if (series === 3) return missingMask3?.[idx];
    if (series === 2) return missingMask2?.[idx];
    return missingMask1?.[idx];
  };
  const seriesColor = (series, idx) => {
    if (seriesMissing(series, idx)) return missingBarColor;
    if (series === 3) return color3;
    if (series === 2) return color2;
    return color1;
  };
  const seriesValue = (series, idx) => {
    if (series === 3) return Number(data3?.[idx] || 0);
    if (series === 2) return Number(data2?.[idx] || 0);
    return Number(data[idx] || 0);
  };
  const seriesTooltipValue = (series, idx) => {
    if (series === 3) return Number(tooltipRaw3?.[idx] || 0);
    if (series === 2) return Number(tooltipRaw2?.[idx] || 0);
    return Number(tooltipRaw1[idx] || 0);
  };
  return (
    <div style={{ position: "relative" }}>
      {hoverBar != null && (
        <div style={{
          position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
          background: seriesColor(hoverBar.series, hoverBar.idx),
          color: "#F8F2E8", borderRadius: 6, padding: "6px 8px",
          fontSize: 10, fontFamily: fontSans, zIndex: 2, pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{labels[hoverBar.idx]}</div>
          {seriesMissing(hoverBar.series, hoverBar.idx) ? (
            <div>Not provided</div>
          ) : valueUnit === "kW" ? (
            <>
              <div>{seriesValue(hoverBar.series, hoverBar.idx).toFixed(2)} avg kW</div>
              <div>{formatBarChartEnergyTooltip(seriesTooltipValue(hoverBar.series, hoverBar.idx), "kWh")}</div>
            </>
          ) : (
            <div>{formatBarChartEnergyTooltip(seriesTooltipValue(hoverBar.series, hoverBar.idx), valueUnit)}</div>
          )}
        </div>
      )}
      {legend && <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
        {legend.map((l, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 4, borderRadius: 2, background: l.color }} />
          <span style={{ color: C.g500, fontSize: 10, fontFamily: fontSans }}>{l.label}</span>
        </div>)}
      </div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, position: "relative", paddingTop: showBarValues ? 16 : 0 }} onMouseLeave={() => setHoverBar(null)}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 1, alignItems: "flex-end", width: "100%", flex: 1, minHeight: 20, paddingBottom: 2 }}>
              <div
                onMouseEnter={() => setHoverBar({ idx: i, series: 1 })}
                style={{
                  flex: 1,
                  height: `${Math.max(((missingMask1?.[i] ? 0 : v) / max) * 100, 1)}%`,
                  background: missingMask1?.[i] ? missingBarColor : color1,
                  borderRadius: "2px 2px 0 0",
                  transition: "height 0.3s",
                  position: "relative",
                }}
              >
                {showBarValues && Number(v) > 0 && !missingMask1?.[i] && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: "calc(100% + 2px)",
                      transform: "translateX(-50%)",
                      color: C.g500,
                      fontSize: 9,
                      fontFamily: fontSans,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {formatBarChartEnergyValue(v, valueUnit)}
                  </span>
                )}
              </div>
              {data2 && (
                <div
                  onMouseEnter={() => setHoverBar({ idx: i, series: 2 })}
                  style={{
                    flex: 1,
                    height: `${Math.max(((missingMask2?.[i] ? 0 : (data2[i] || 0)) / max) * 100, 1)}%`,
                    background: missingMask2?.[i] ? missingBarColor : color2,
                    borderRadius: "2px 2px 0 0",
                    transition: "height 0.3s",
                    position: "relative",
                  }}
                >
                  {showBarValues && Number(data2[i] || 0) > 0 && !missingMask2?.[i] && (
                    <span
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: "calc(100% + 2px)",
                        transform: "translateX(-50%)",
                        color: C.g500,
                        fontSize: 9,
                        fontFamily: fontSans,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}
                    >
                      {formatBarChartEnergyValue(data2[i] || 0, valueUnit)}
                    </span>
                  )}
                </div>
              )}
              {data3 && (
                <div
                  onMouseEnter={() => setHoverBar({ idx: i, series: 3 })}
                  style={{
                    flex: 1,
                    height: `${Math.max(((missingMask3?.[i] ? 0 : (data3[i] || 0)) / max) * 100, 1)}%`,
                    background: missingMask3?.[i] ? missingBarColor : color3,
                    borderRadius: "2px 2px 0 0",
                    transition: "height 0.3s",
                    position: "relative",
                  }}
                >
                  {showBarValues && Number(data3[i] || 0) > 0 && !missingMask3?.[i] && (
                    <span
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: "calc(100% + 2px)",
                        transform: "translateX(-50%)",
                        color: C.g500,
                        fontSize: 9,
                        fontFamily: fontSans,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}
                    >
                      {formatBarChartEnergyValue(data3[i] || 0, valueUnit)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <span style={{ color: C.g500, fontSize: 8, marginTop: 6, lineHeight: 1, minHeight: 10, fontFamily: fontSans }}>{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Seasonal production: month (time) vs average kW — from monthly kWh output
function SeasonalChart({ monthlyKWh, labels = MONTHS, color = C.gold, height = 200, title, maxKw: maxKwOverride, compact: compactOverride, useMwh = false }) {
  const gradId = useId().replace(/:/g, "");
  const avgKwByMonth = monthlyKWh.map((kwh, i) => (Number(kwh) || 0) / (HOURS_PER_MONTH[i] || 744));
  const maxKw = maxKwOverride ?? Math.max(...avgKwByMonth, 0.1);
  const [hoverIdx, setHoverIdx] = useState(null);

  const compact = compactOverride ?? height < 130;
  const pad = compact
    ? { top: 10, right: 8, bottom: 22, left: 40 }
    : { top: 20, right: 12, bottom: 28, left: 64 };
  const minPlotH = compact ? 56 : 80;
  const h = Math.max(height, pad.top + pad.bottom + minPlotH);
  const chartH = h - pad.top - pad.bottom;
  const w = compact ? 500 : 560;
  const chartW = w - pad.left - pad.right;
  const yTicks = compact ? [0, 1] : [0, 0.5, 1];
  const yLabelX = compact ? pad.left - 26 : pad.left - 48;
  const tickFontSize = compact ? 8 : 9;
  const xFontSize = compact ? 8 : 9;

  const points = avgKwByMonth.map((kw, i) => {
    const x = pad.left + (i + 0.5) * (chartW / 12);
    const y = pad.top + chartH - (kw / maxKw) * chartH;
    return { x, y, kw };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = pathD + ` L ${points[points.length - 1].x} ${pad.top + chartH} L ${points[0].x} ${pad.top + chartH} Z`;

  return (
    <div style={{ position: "relative" }}>
      {hoverIdx != null && (
        <div style={{
          position: "absolute", top: 4, right: 8,
          background: C.navy, color: "#F8F2E8", borderRadius: 6, padding: "6px 8px",
          fontSize: 10, fontFamily: fontSans, zIndex: 2, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontWeight: 700 }}>{labels[hoverIdx]}</div>
          <div>{formatEnergyWithUnit(monthlyKWh[hoverIdx], useMwh)}</div>
          <div>{avgKwByMonth[hoverIdx].toFixed(2)} avg kW</div>
        </div>
      )}
      {title && <div style={{ color: C.g700, fontSize: 12, fontWeight: 600, fontFamily: fontSans, marginBottom: 8 }}>{title}</div>}
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id={`seasonalGrad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.left} y1={pad.top + chartH - f * chartH} x2={pad.left + chartW} y2={pad.top + chartH - f * chartH} stroke={C.g200} strokeWidth={0.5} strokeDasharray="4,2" />
        ))}
        {[2, 5, 8, 11].map((i) => (
          <line key={i} x1={pad.left + (i + 0.5) * (chartW / 12)} y1={pad.top} x2={pad.left + (i + 0.5) * (chartW / 12)} y2={pad.top + chartH} stroke={C.g200} strokeWidth={0.5} strokeDasharray="4,2" />
        ))}
        <text x={yLabelX} y={pad.top + chartH / 2} textAnchor="middle" fill={C.g500} fontSize={compact ? 6 : 7} fontFamily={fontSans} transform={`rotate(-90 ${yLabelX} ${pad.top + chartH / 2})`}>Avg kW</text>
        {yTicks.map((f) => (
          <text key={f} x={pad.left - 8} y={pad.top + chartH - f * chartH + 3} textAnchor="end" fill={C.g500} fontSize={tickFontSize} fontFamily={fontSans}>{(maxKw * f).toFixed(1)}</text>
        ))}
        <path d={areaD} fill={`url(#seasonalGrad-${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={compact ? 2 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={compact ? 2.5 : 3} fill={color} stroke={C.white} strokeWidth={1} />
        ))}
        {points.map((p, i) => (
          <rect
            key={`hover-zone-${i}`}
            x={pad.left + i * (chartW / 12)}
            y={pad.top}
            width={chartW / 12}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        {labels.map((label, i) => (
          <text key={i} x={pad.left + (i + 0.5) * (chartW / 12)} y={h - 6} textAnchor="middle" fill={C.g500} fontSize={xFontSize} fontFamily={fontSans}>{label}</text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 4, fontSize: compact ? 10 : 11, color: C.g500, fontFamily: fontSans }}>
        <span>Time (month)</span>
      </div>
    </div>
  );
}

// ─── Shadow Engine ──────────────────────────────────────────────────
function calcShadow(lat, month, hour, obstH, obstD) {
  const doy = [15,46,74,105,135,166,196,227,258,288,319,349][month];
  const dec = 23.45 * Math.sin((2 * Math.PI / 365) * (284 + doy));
  const dR = dec * Math.PI / 180, lR = lat * Math.PI / 180;
  const hA = (hour - 12) * 15, hR = hA * Math.PI / 180;
  const sinA = Math.sin(lR) * Math.sin(dR) + Math.cos(lR) * Math.cos(dR) * Math.cos(hR);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinA))) * 180 / Math.PI;
  if (alt <= 0) return { alt: 0, az: 0, shadow: Infinity, shaded: true };
  const cosAz = (Math.sin(dR) - Math.sin(lR) * sinA) / (Math.cos(lR) * Math.cos(Math.asin(sinA)));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
  if (hA > 0) az = 360 - az;
  const shadow = obstH / Math.tan(alt * Math.PI / 180);
  return { alt, az, shadow, shaded: shadow > obstD };
}


// ═════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═════════════════════════════════════════════════════════════════════
export default function JantaProposal({
  onOpenSettings,
  onSignOut,
  initialDarkMode = false,
  onDarkModeChange,
  currentUserId = "",
  initialSnapshot = null,
  savedProposalId = null,
  savedProposalTitle = "",
  onOpenProposals,
  onAutosaveProposal,
  autoDownloadPdf = false,
  onAutoDownloadPdfDone,
}) {
  const [step, setStep] = useState(0); // 0=bill, 1=system, 2=pricing, 3=financials, 4=shadow, 5=proposal

  // ── Extracted / editable customer data ──
  const [custName, setCustName] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [account, setAccount] = useState("");
  const [utilityName, setUtilityName] = useState("");
  const [prepBy, setPrepBy] = useState("Sean Simmons");
  const [prepEmail, setPrepEmail] = useState("seansimmons@jantaus.com");
  const [prepPhone, setPrepPhone] = useState("(214) 842-0659");

  // ── Bill data ──
  const [billText, setBillText] = useState("");
  const [billFileName, setBillFileName] = useState("");
  const [billFileNames, setBillFileNames] = useState([]);
  const [billUploadError, setBillUploadError] = useState("");
  const [billUploadLoading, setBillUploadLoading] = useState(false);
  const [billExtractNotice, setBillExtractNotice] = useState("");
  const billInputRef = useRef(null);
  const proposalPdfRef = useRef(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showProposalPageBreaks, setShowProposalPageBreaks] = useState(true);
  const [startPermissionsOnNewPage, setStartPermissionsOnNewPage] = useState(false);
  const [proposalBreakGuides, setProposalBreakGuides] = useState([]);
  /** `null` = no bill / not provided for that month (excluded from averages; red bar). */
  const [monthlyKWh, setMonthlyKWh] = useState(() => new Array(12).fill(null));
  const [ratePerKWh, setRatePerKWh] = useState("0.12");
  const [rateEsc, setRateEsc] = useState("3");
  const [productionOnlyMode, setProductionOnlyMode] = useState(false);
  /** Compare production to monthly usage kWh without utility $ / escalation (charts + usage still required). */
  const [usageComparisonMode, setUsageComparisonMode] = useState(false);
  /** Dollar savings + usage offset %; no break-even, ROI, or 25-year projection table. */
  const [savingsOnlyMode, setSavingsOnlyMode] = useState(false);
  /** Pitch mode: $/W is the headline price; totals shown smaller. Incentive savings in $/W. */
  const [salesShowcaseMode, setSalesShowcaseMode] = useState(false);
  const [multiMeterMode, setMultiMeterMode] = useState(false);
  const [meters, setMeters] = useState([createMeter(0)]);
  const [activeMeterIdx, setActiveMeterIdx] = useState(0);
  /** Which meter the monthly usage grid is editing (multi-meter). */
  const [usageMeterIdx, setUsageMeterIdx] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch (_err) {
      // ignore storage read failures
    }
    return Boolean(initialDarkMode);
  });
  const [pdfLightMode, setPdfLightMode] = useState(false);
  useEffect(() => {
    if (typeof initialDarkMode === "boolean") {
      setIsDarkMode(initialDarkMode);
    }
  }, [initialDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, isDarkMode ? "1" : "0");
    } catch (_err) {
      // ignore storage write failures
    }
    if (typeof onDarkModeChange === "function") {
      onDarkModeChange(isDarkMode);
    }
  }, [isDarkMode, onDarkModeChange]);

  const [extracted, setExtracted] = useState(false);

  // ── Region & System ──
  const [region, setRegion] = useState("texas");
  /** Empty = auto (~60% offset); otherwise kW string, snapped to 5.6 kW steps for math. */
  const [systemSizeKw, setSystemSizeKw] = useState("");
  const [pricingPerKW, setPricingPerKW] = useState(String(DEFAULT_PRICING_PER_KW));
  const [pricingUseRange, setPricingUseRange] = useState(false);
  const [pricingPerKWHigh, setPricingPerKWHigh] = useState("");
  const [optionalEquipment, setOptionalEquipment] = useState([]);
  /** When false, battery + generator rows are collapsed; use “Add Battery or Generator” to expand. */
  const [optionalEquipmentOpen, setOptionalEquipmentOpen] = useState(false);

  // ── NREL PVWatts (SAM-style) API ──
  const [useNrelApi, setUseNrelApi] = useState(false);
  const [nrelApiKey, setNrelApiKey] = useState(typeof import.meta !== "undefined" && import.meta.env?.VITE_NREL_API_KEY ? import.meta.env.VITE_NREL_API_KEY : "");
  const [samData, setSamData] = useState(null);
  const [samLoading, setSamLoading] = useState(false);
  const [samError, setSamError] = useState(null);
  // Address-based location (geocode → lat/lon for SAM)
  const [siteAddress, setSiteAddress] = useState("");
  const [siteLat, setSiteLat] = useState(null);
  const [siteLon, setSiteLon] = useState(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState(null);
  // SAM/PVWatts parameters (match SAM: tilt 60°, azimuthal axis, DC:AC 1.0, losses 2%)
  const [samTilt, setSamTilt] = useState("60");
  const [samAzimuth, setSamAzimuth] = useState("180");
  const [samArrayType, setSamArrayType] = useState(4);
  const [samModuleType, setSamModuleType] = useState(0);
  const [samLosses, setSamLosses] = useState("2");
  const [samDcAcRatio, setSamDcAcRatio] = useState("1.0");
  /** Empty = use PVWatts or regional default; otherwise percent (e.g. 23.1) */
  const [capacityFactorPct, setCapacityFactorPct] = useState("");

  // ── Project Financials (Excel-guided) ──
  const [finPricePerMw, setFinPricePerMw] = useState("1624000");
  const [finMaintenancePerMwYear, setFinMaintenancePerMwYear] = useState("15000");
  const [finEnergyValuePerMWh, setFinEnergyValuePerMWh] = useState("60");
  const [finSavedLandValuePerAcre, setFinSavedLandValuePerAcre] = useState("0");
  const [finSavedLandValueAuto, setFinSavedLandValueAuto] = useState(true);
  const [finSavedLandValueSource, setFinSavedLandValueSource] = useState("Manual");
  const [includeFinancialsInProposal, setIncludeFinancialsInProposal] = useState(false);
  /** Project Financials needs room on page 2; Permissions must start page 3. */
  useEffect(() => {
    if (includeFinancialsInProposal) setStartPermissionsOnNewPage(true);
  }, [includeFinancialsInProposal]);
  const [includeCapitalLessSavedLand, setIncludeCapitalLessSavedLand] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  // ── Credits (state-based) ──
  const [selState, setSelState] = useState("TX");
  const [stateManuallySet, setStateManuallySet] = useState(false);
  const [itcPct, setItcPct] = useState(30); // 0, 30, 40, 50, 60 — commercial can still get ITC
  const [ecOn, setEcOn] = useState(false);
  const [extraCreditName, setExtraCreditName] = useState("");
  const [extraCreditAmt, setExtraCreditAmt] = useState("");
  const [extraCredits, setExtraCredits] = useState([]);
  const [removedCreditKeys, setRemovedCreditKeys] = useState({});

  const darkThemeActive = isDarkMode && !pdfLightMode;
  const pageScale = Math.min(1.35, Math.max(1, (viewportWidth - 24) / 960));
  const titleColor = darkThemeActive ? "#F8F2E8" : C.navy;
  const proposalScreenDark = darkThemeActive && step === 5;
  const chartProdColor = darkThemeActive ? "#F0C36A" : C.gold;
  const chartUsageColor = darkThemeActive ? "#F8F2E8" : C.navy;
  const chartTradColor = darkThemeActive ? "#6B7789" : C.g700;
  Object.assign(C, darkThemeActive ? DARK_C : LIGHT_C);


  // ── Shadow ──
  const [obstH, setObstH] = useState("8");
  const [obstD, setObstD] = useState("15");
  const [shMonth, setShMonth] = useState(6);
  const [shHour, setShHour] = useState(12);
  const [saveBusy, setSaveBusy] = useState(false);

  const proposalStateRef = useRef({});
  const proposalHydratedRef = useRef(false);
  const autoDownloadStartedRef = useRef(false);
  const onAutosaveRef = useRef(onAutosaveProposal);
  const savedProposalIdRef = useRef(savedProposalId);
  onAutosaveRef.current = onAutosaveProposal;
  savedProposalIdRef.current = savedProposalId;

  proposalStateRef.current = {
    step,
    custName,
    custAddress,
    custEmail,
    custPhone,
    account,
    utilityName,
    prepBy,
    prepEmail,
    prepPhone,
    billText,
    billFileName,
    billFileNames,
    billExtractNotice,
    monthlyKWh,
    ratePerKWh,
    rateEsc,
    productionOnlyMode,
    usageComparisonMode,
    savingsOnlyMode,
    salesShowcaseMode,
    multiMeterMode,
    meters,
    activeMeterIdx,
    usageMeterIdx,
    extracted,
    region,
    systemSizeKw,
    pricingPerKW,
    pricingUseRange,
    pricingPerKWHigh,
    optionalEquipment,
    optionalEquipmentOpen,
    useNrelApi,
    nrelApiKey,
    samData,
    siteAddress,
    siteLat,
    siteLon,
    samTilt,
    samAzimuth,
    samArrayType,
    samModuleType,
    samLosses,
    samDcAcRatio,
    capacityFactorPct,
    finPricePerMw,
    finMaintenancePerMwYear,
    finEnergyValuePerMWh,
    finSavedLandValuePerAcre,
    finSavedLandValueAuto,
    finSavedLandValueSource,
    includeFinancialsInProposal,
    includeCapitalLessSavedLand,
    selState,
    stateManuallySet,
    itcPct,
    ecOn,
    extraCreditName,
    extraCreditAmt,
    extraCredits,
    removedCreditKeys,
    obstH,
    obstD,
    shMonth,
    shHour,
    showProposalPageBreaks,
    startPermissionsOnNewPage,
  };

  const proposalSettersRef = useRef(null);
  if (!proposalSettersRef.current) {
    proposalSettersRef.current = {
      setStep,
      setCustName,
      setCustAddress,
      setCustEmail,
      setCustPhone,
      setAccount,
      setUtilityName,
      setPrepBy,
      setPrepEmail,
      setPrepPhone,
      setBillText,
      setBillFileName,
      setBillFileNames,
      setBillExtractNotice,
      setMonthlyKWh,
      setRatePerKWh,
      setRateEsc,
      setProductionOnlyMode,
      setUsageComparisonMode,
      setSavingsOnlyMode,
      setSalesShowcaseMode,
      setMultiMeterMode,
      setMeters,
      setActiveMeterIdx,
      setUsageMeterIdx,
      setExtracted,
      setRegion,
      setSystemSizeKw,
      setPricingPerKW,
      setPricingUseRange,
      setPricingPerKWHigh,
      setOptionalEquipment,
      setOptionalEquipmentOpen,
      setUseNrelApi,
      setNrelApiKey,
      setSamData,
      setSiteAddress,
      setSiteLat,
      setSiteLon,
      setSamTilt,
      setSamAzimuth,
      setSamArrayType,
      setSamModuleType,
      setSamLosses,
      setSamDcAcRatio,
      setCapacityFactorPct,
      setFinPricePerMw,
      setFinMaintenancePerMwYear,
      setFinEnergyValuePerMWh,
      setFinSavedLandValuePerAcre,
      setFinSavedLandValueAuto,
      setFinSavedLandValueSource,
      setIncludeFinancialsInProposal,
      setIncludeCapitalLessSavedLand,
      setSelState,
      setStateManuallySet,
      setItcPct,
      setEcOn,
      setExtraCreditName,
      setExtraCreditAmt,
      setExtraCredits,
      setRemovedCreditKeys,
      setObstH,
      setObstD,
      setShMonth,
      setShHour,
      setShowProposalPageBreaks,
      setStartPermissionsOnNewPage,
    };
  }

  useEffect(() => {
    if (proposalHydratedRef.current) return undefined;
    let cancelled = false;
    (async () => {
      if (initialSnapshot) {
        applyProposalSnapshot(initialSnapshot, proposalSettersRef.current);
      } else if (currentUserId && !savedProposalId) {
        const draft = await readSessionDraft(currentUserId);
        if (!cancelled && draft?.snapshot) {
          applyProposalSnapshot(draft.snapshot, proposalSettersRef.current);
        }
      }
      if (!cancelled) proposalHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, initialSnapshot, savedProposalId]);

  useEffect(() => {
    if (!savedProposalId || !proposalHydratedRef.current || typeof onAutosaveProposal !== "function") {
      return undefined;
    }
    const AUTOSAVE_MS = 60_000;
    const runAutosave = async () => {
      if (!savedProposalIdRef.current || !proposalHydratedRef.current) return;
      const snapshot = buildProposalSnapshot(proposalStateRef.current);
      try {
        await onAutosaveRef.current({ snapshot });
      } catch (_err) {
        // silent background autosave
      }
    };
    const timer = setInterval(runAutosave, AUTOSAVE_MS);
    const onUnload = () => {
      if (!savedProposalIdRef.current) return;
      const snapshot = buildProposalSnapshot(proposalStateRef.current);
      onAutosaveRef.current({ snapshot }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [savedProposalId, onAutosaveProposal]);

  useEffect(() => {
    return () => {
      if (!savedProposalIdRef.current || typeof onAutosaveRef.current !== "function") return;
      const snapshot = buildProposalSnapshot(proposalStateRef.current);
      onAutosaveRef.current({ snapshot }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!autoDownloadPdf || !proposalHydratedRef.current || autoDownloadStartedRef.current) return undefined;
    autoDownloadStartedRef.current = true;
    setStep(5);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      await downloadProposalPdf();
      if (!cancelled && typeof onAutoDownloadPdfDone === "function") onAutoDownloadPdfDone();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoDownloadPdf, onAutoDownloadPdfDone]);

  async function saveProposalNow() {
    if (!savedProposalId || typeof onAutosaveProposal !== "function") return true;
    setSaveBusy(true);
    try {
      const snapshot = buildProposalSnapshot(proposalStateRef.current);
      await onAutosaveProposal({ snapshot });
      return true;
    } catch (err) {
      window.alert(err.message || "Save failed");
      return false;
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleBackToProposals() {
    if (!(await saveProposalNow())) return;
    if (typeof onOpenProposals === "function") onOpenProposals();
  }

  async function handleSignOutWithSave() {
    if (!window.confirm("Sign out? Your proposal will be saved before you leave.")) return;
    if (!(await saveProposalNow())) return;
    if (typeof onSignOut === "function") onSignOut();
  }

  // Auto-detect region from location/address instead of manual picker.
  useEffect(() => {
    const detected = detectRegionFromLocation({
      address: custAddress || siteAddress,
      lat: siteLat,
      lon: siteLon,
      utilityName,
    });
    if (detected && detected !== region) setRegion(detected);
  }, [custAddress, siteAddress, siteLat, siteLon, utilityName, region]);

  useEffect(() => {
    if (stateManuallySet) return;
    const detectedState = detectStateFromLocation({
      address: custAddress || siteAddress,
      utilityName,
    });
    if (detectedState && detectedState !== selState) setSelState(detectedState);
  }, [custAddress, siteAddress, utilityName, selState, stateManuallySet]);

  useEffect(() => {
    if (!finSavedLandValueAuto) return;
    let cancelled = false;
    (async () => {
      let county = "";
      let stateAbbr = selState;
      const hints = parseAddressHints(custAddress || siteAddress);
      const lat = Number.isFinite(siteLat) ? siteLat : hints.lat;
      const lon = Number.isFinite(siteLon) ? siteLon : hints.lon;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        try {
          const rev = await reverseGeocodeCountyState(lat, lon);
          county = rev.county || "";
          stateAbbr = rev.stateAbbr || stateAbbr;
        } catch (_err) {
          // fall through to state/region fallback
        }
      }
      const est = estimateSavedLandValuePerAcre({ county, stateAbbr, region });
      if (!cancelled) {
        setFinSavedLandValuePerAcre(String(est.value));
        setFinSavedLandValueSource(est.source);
      }
    })();
    return () => { cancelled = true; };
  }, [finSavedLandValueAuto, siteLat, siteLon, custAddress, siteAddress, selState, region]);

  useEffect(() => {
    const { midpoint } = resolveSolarPricePerKw({ pricingPerKW, pricingPerKWHigh, pricingUseRange });
    setFinPricePerMw(String(Math.round(midpoint * 1000)));
  }, [pricingPerKW, pricingPerKWHigh, pricingUseRange]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch NREL PVWatts when API is on and we have a location (address coords or region)
  useEffect(() => {
    if (!useNrelApi || !nrelApiKey?.trim()) {
      setSamData(null);
      setSamError(null);
      return;
    }
    const lat = siteLat != null ? siteLat : REGIONS[region]?.lat;
    const lon = siteLon != null ? siteLon : REGIONS[region]?.lon;
    if (lat == null || lon == null) return;
    let cancelled = false;
    setSamLoading(true);
    setSamError(null);
    const opts = {
      tilt: parseFloat(samTilt) || 60,
      azimuth: parseFloat(samAzimuth) || 180,
      arrayType: samArrayType,
      moduleType: samModuleType,
      losses: parseFloat(samLosses),
      dcAcRatio: parseFloat(samDcAcRatio) || 1.0,
    };
    fetchPVWatts(nrelApiKey.trim(), lat, lon, 1, opts)
      .then((data) => {
        if (!cancelled) {
          setSamData(data);
          setSamError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSamError(err?.message || "Failed to fetch PVWatts");
          setSamData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSamLoading(false);
      });
    return () => { cancelled = true; };
  }, [useNrelApi, nrelApiKey, region, siteLat, siteLon, samTilt, samAzimuth, samArrayType, samModuleType, samLosses, samDcAcRatio]);

  function handleGeocode() {
    if (!siteAddress?.trim()) {
      setGeocodeError("Enter an address first.");
      return;
    }
    setGeocodeLoading(true);
    setGeocodeError(null);
    geocodeAddress(siteAddress)
      .then(({ lat, lon }) => {
        setSiteLat(lat);
        setSiteLon(lon);
        setGeocodeError(null);
      })
      .catch((err) => {
        setGeocodeError(err?.message || "Geocode failed");
        setSiteLat(null);
        setSiteLon(null);
      })
      .finally(() => setGeocodeLoading(false));
  }

  function applyBillCustomerFields(d) {
    if (d.customerName) setCustName(d.customerName);
    if (d.address) {
      setCustAddress(d.address);
      setSiteAddress(d.address);
    }
    if (d.email) setCustEmail(d.email);
    if (d.phone) setCustPhone(d.phone);
    if (d.account) setAccount(d.account);
    if (d.utilityName) setUtilityName(d.utilityName);
    if (d.ratePerKWh > 0) setRatePerKWh(d.ratePerKWh.toFixed(4));
    setRegion(detectRegionFromLocation({
      address: d.address || custAddress,
      lat: siteLat,
      lon: siteLon,
      utilityName: d.utilityName || utilityName,
    }));
    setStateManuallySet(false);
    setSelState(detectStateFromLocation({
      address: d.address || custAddress,
      utilityName: d.utilityName || utilityName,
    }));
  }

  // ── Bill Extraction ──
  function handleExtract() {
    const d = extractBillData(billText);
    applyBillCustomerFields(d);
    setBillExtractNotice("");

    const { meters: detected } = extractMetersFromBill(billText);

    if (detected.length >= 2) {
      setMultiMeterMode(true);
      const capped = detected.length > MAX_PROJECT_METERS;
      const toLoad = capped ? detected.slice(0, MAX_PROJECT_METERS) : detected;
      setMeters(toLoad.map((m, i) => meterRecordFromExtracted(m, i)));
      setActiveMeterIdx(0);
      setUsageMeterIdx(0);
      const parts = [`Found ${detected.length} meters on this bill.`];
      if (capped) {
        parts.push(`Loaded the first ${MAX_PROJECT_METERS} — add more manually if needed.`);
      }
      setBillExtractNotice(parts.join(" "));
    } else if (detected.length === 1) {
      const one = detected[0];
      setMultiMeterMode(false);
      setMonthlyKWh(one.monthlyKWh.map((v) => (v == null ? null : Number(v))));
    } else if (d.monthlyKWh.some((v) => v > 0)) {
      setMultiMeterMode(false);
      setMonthlyKWh(d.monthlyKWh.map((v) => (v > 0 ? v : null)));
    }

    setExtracted(true);
  }

  async function readBillFile(file) {
    if (!file) return "";
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      return extractTextFromPdfFile(file);
    }
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      return file.text();
    }
    throw new Error(`Unsupported file "${file.name}". Please upload PDF or TXT only.`);
  }

  async function handleBillFiles(filesLike) {
    const files = Array.from(filesLike || []).filter(Boolean);
    if (files.length === 0) return;
    setBillUploadError("");
    setBillUploadLoading(true);
    try {
      const parts = [];
      const names = [];
      for (const f of files) {
        const text = await readBillFile(f);
        if (!text || text.trim().length < 20) {
          throw new Error(`Could not extract enough text from "${f.name}".`);
        }
        parts.push(text.trim());
        names.push(f.name);
      }
      const merged = parts.join("\n\n--- NEXT BILL ---\n\n");
      setBillText(merged);
      setBillFileNames(names);
      setBillFileName(names.length === 1 ? names[0] : `${names.length} files merged`);
    } catch (err) {
      setBillUploadError(err?.message || "Failed to read bill file(s).");
    } finally {
      setBillUploadLoading(false);
    }
  }

  function clearBillFile() {
    setBillFileName("");
    setBillFileNames([]);
    setBillUploadError("");
    if (billInputRef.current) billInputRef.current.value = "";
  }

  async function downloadProposalPdf() {
    const el = proposalPdfRef.current;
    if (!el) return;
    let revertRaster = null;
    try {
      // Paint dark overlay first so isDarkMode + pdfLightMode swap does not visibly flash chrome/proposal preview.
      flushSync(() => {
        setPdfExporting(true);
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // Always export proposal PDF in light palette (temporary; hidden under overlay when dark).
      flushSync(() => {
        setPdfLightMode(true);
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      await waitForImages(el);
      revertRaster = await rasterizeImagesForHtml2Pdf(el);

      const mod = await import("html2pdf.js");
      const html2pdf = mod.default || mod;
      const raw = (custName || custAddress || "proposal").trim();
      const slug = raw.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "proposal";
      const filename = `Janta-Proposal-${slug}.pdf`;
      await html2pdf()
        .set({
          margin: [10, 10, 14, 10],
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: false, logging: false, letterRendering: true },
          pagebreak: { mode: ["css", "legacy"] },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (err) {
      window.alert(err?.message || "Could not generate PDF. Try again or use Print to PDF.");
    } finally {
      if (revertRaster) revertRaster();
      setPdfLightMode(false);
      setPdfExporting(false);
    }
  }

  function onProductionOnlyToggle(checked) {
    setProductionOnlyMode(checked);
    if (checked) {
      setUsageComparisonMode(false);
      setSavingsOnlyMode(false);
    }
  }
  function onUsageComparisonToggle(checked) {
    setUsageComparisonMode(checked);
    if (checked) {
      setProductionOnlyMode(false);
      setSavingsOnlyMode(false);
    }
  }
  function onSavingsOnlyToggle(checked) {
    setSavingsOnlyMode(checked);
    if (checked) {
      setProductionOnlyMode(false);
      setUsageComparisonMode(false);
    }
  }

  function onMultiMeterToggle(checked) {
    setMultiMeterMode(checked);
    if (checked) {
      setMeters((prev) => {
        const first = prev[0] || createMeter(0);
        if (first.billText || first.monthlyKWh.some((v) => v != null)) return prev;
        return [{
          ...first,
          billText,
          billFileName,
          billFileNames: [...billFileNames],
          monthlyKWh: [...monthlyKWh],
          extracted,
        }];
      });
    }
  }

  function setMeterCount(nextCount) {
    const count = Math.max(1, Math.min(MAX_PROJECT_METERS, Number(nextCount) || 1));
    setMeters((prev) => {
      if (count === prev.length) return prev;
      if (count < prev.length) return prev.slice(0, count);
      const next = [...prev];
      for (let i = prev.length; i < count; i++) next.push(createMeter(i));
      return next;
    });
    setActiveMeterIdx((idx) => Math.min(idx, count - 1));
    setUsageMeterIdx((idx) => Math.min(idx, count - 1));
  }

  function updateMeter(idx, patch) {
    setMeters((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function updateMeterNumber(idx, meterNumber) {
    setMeters((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const nameWasAuto = isAutoMeterName(m.name, m.meterNumber);
        const autoName = autoMeterNameFromNumber(meterNumber);
        return {
          ...m,
          meterNumber,
          ...(autoName && nameWasAuto ? { name: autoName } : {}),
        };
      })
    );
  }

  const activeMeter = meters[activeMeterIdx] || meters[0];

  async function handleBillFilesForMeter(filesLike, meterIdx = activeMeterIdx) {
    const files = Array.from(filesLike || []).filter(Boolean);
    if (files.length === 0) return;
    updateMeter(meterIdx, { billUploadError: "", billUploadLoading: true });
    try {
      const parts = [];
      const names = [];
      for (const f of files) {
        const text = await readBillFile(f);
        if (!text || text.trim().length < 20) throw new Error(`Could not extract enough text from "${f.name}".`);
        parts.push(text.trim());
        names.push(f.name);
      }
      updateMeter(meterIdx, {
        billText: parts.join("\n\n--- NEXT BILL ---\n\n"),
        billFileName: names.length === 1 ? names[0] : `${names.length} files merged`,
        billFileNames: names,
        billUploadError: "",
      });
    } catch (err) {
      updateMeter(meterIdx, { billUploadError: err?.message || "Failed to read bill file(s)." });
    } finally {
      updateMeter(meterIdx, { billUploadLoading: false });
    }
  }

  function handleExtractMeter(meterIdx = activeMeterIdx) {
    const meter = meters[meterIdx];
    if (!meter) return;
    const d = extractBillData(meter.billText);
    if (d.customerName) setCustName(d.customerName);
    if (d.address && meterIdx === 0) {
      setCustAddress(d.address);
      setSiteAddress(d.address);
    }
    if (d.email) setCustEmail(d.email);
    if (d.phone) setCustPhone(d.phone);
    if (d.utilityName) setUtilityName(d.utilityName);
    if (d.ratePerKWh > 0) setRatePerKWh(d.ratePerKWh.toFixed(4));
    const nextMonthly = d.monthlyKWh.some((v) => v > 0)
      ? d.monthlyKWh.map((v) => (v > 0 ? v : null))
      : meter.monthlyKWh;
    updateMeter(meterIdx, {
      name: suggestMeterName(d, meter.name),
      account: d.account || meter.account,
      monthlyKWh: nextMonthly,
      extracted: true,
    });
    setRegion(detectRegionFromLocation({
      address: d.address || custAddress,
      lat: siteLat,
      lon: siteLon,
      utilityName: d.utilityName || utilityName,
    }));
    setStateManuallySet(false);
    setSelState(detectStateFromLocation({
      address: d.address || custAddress,
      utilityName: d.utilityName || utilityName,
    }));
    setExtracted(true);
  }

  function handleManualKWhMeter(idx, val, meterIdx = usageMeterIdx) {
    const meter = meters[meterIdx];
    if (!meter) return;
    const next = [...meter.monthlyKWh];
    const t = String(val).trim();
    next[idx] = t === "" ? null : (Number.isFinite(parseFloat(t)) ? parseFloat(t) : null);
    updateMeter(meterIdx, { monthlyKWh: next });
  }

  function selectUsageMeter(idx) {
    const i = Math.max(0, Math.min(idx, meters.length - 1));
    setUsageMeterIdx(i);
    setActiveMeterIdx(i);
  }

  function saveMeterUsageAndNext(meterIdx = usageMeterIdx) {
    const meter = meters[meterIdx];
    if (!meter) return;
    const summary = summarizeMeterUsage(meter);
    if (!summary.hasData) return;
    updateMeter(meterIdx, { usageSavedAt: Date.now() });
    if (meterIdx < meters.length - 1) selectUsageMeter(meterIdx + 1);
  }

  function deleteMeter(meterIdx = usageMeterIdx) {
    if (meters.length <= 1) return;
    setMeters((prev) => prev.filter((_, i) => i !== meterIdx));
    const nextIdx = Math.max(0, Math.min(meterIdx, meters.length - 2));
    setActiveMeterIdx(nextIdx);
    setUsageMeterIdx(nextIdx);
  }

  function handleManualKWh(idx, val) {
    const next = [...monthlyKWh];
    const t = String(val).trim();
    if (t === "") next[idx] = null;
    else {
      const n = parseFloat(t);
      next[idx] = Number.isFinite(n) ? n : null;
    }
    setMonthlyKWh(next);
  }

  // ── Computed values ──
  const monthlyKWhNumeric = monthlyKWh.map((v) => (v == null ? 0 : Number(v)));
  const monthlyUsageProvidedCount = monthlyKWh.filter((v) => v != null).length;
  const annualKWh = monthlyKWh.reduce((a, b) => a + (b == null ? 0 : Number(b)), 0);
  const monthlyAvgKWh = monthlyUsageProvidedCount > 0 ? Math.round(annualKWh / monthlyUsageProvidedCount) : 0;
  const usageMissingMask = monthlyKWh.map((v) => v === null);
  const reg = REGIONS[region];
  const baseMonthly = samData?.monthlyPerKW ?? reg.monthlyPerKW;
  const baseAnnualPerKW =
    samData?.annualPerKW != null
      ? samData.annualPerKW
      : baseMonthly.reduce((a, b) => a + Number(b), 0);
  const baseCF = baseAnnualPerKW > 0 ? baseAnnualPerKW / 8760 : reg.capacityFactor;
  const cfInput = parseFloat(String(capacityFactorPct).replace(/%/g, "").trim());
  const hasManualCf = String(capacityFactorPct).trim() !== "" && Number.isFinite(cfInput);
  const effectiveCF = hasManualCf ? Math.min(99.9, Math.max(0, cfInput)) / 100 : baseCF;
  const traditionalCF = effectiveCF / JANTA_VS_TRADITIONAL_CF_RATIO;
  const effectiveAnnualPerKW = hasManualCf ? effectiveCF * 8760 : baseAnnualPerKW;
  const monthScale = hasManualCf && baseAnnualPerKW > 0 ? effectiveAnnualPerKW / baseAnnualPerKW : 1;
  const effectiveMonthlyPerKW = hasManualCf
    ? baseMonthly.map((m) => Math.round(Number(m) * monthScale))
    : baseMonthly;
  const cfSourceSummaryText = hasManualCf
    ? "Source: Custom (manual override)"
    : samData
      ? "Source: NREL PVWatts (SAM)"
      : `Source: Auto — ${reg.label} curve`;
  /** Step count closest to 60% offset (may be slightly above or below 60% once snapped to 5.6 kW). */
  const optimalSystemStep = useMemo(() => {
    if (!annualKWh || !effectiveAnnualPerKW || effectiveAnnualPerKW <= 0) return 1;
    const targetKw = (0.6 * annualKWh) / effectiveAnnualPerKW;
    return Math.max(1, Math.round(targetKw / SYSTEM_SIZE_STEP_KW));
  }, [annualKWh, effectiveAnnualPerKW]);

  const optimalSystemKw = Math.round(optimalSystemStep * SYSTEM_SIZE_STEP_KW * 10) / 10;
  const effectiveSize = useMemo(() => {
    const t = String(systemSizeKw).trim();
    const p = parseFloat(t.replace(/kw/gi, "").replace(/,/g, ""));
    if (t === "") return optimalSystemKw;
    if (Number.isFinite(p)) return snapSystemSizeKw(p);
    return optimalSystemKw;
  }, [systemSizeKw, optimalSystemKw]);
  const systemSizeAtMinStep = effectiveSize <= SYSTEM_SIZE_STEP_KW + 0.001;
  const solarPricing = resolveSolarPricePerKw({ pricingPerKW, pricingPerKWHigh, pricingUseRange });
  const costPerKW = solarPricing.midpoint;
  const costPerKWLow = solarPricing.low;
  const costPerKWHigh = solarPricing.high;
  const solarPriceRange = solarPricing.useRange;
  const activeEquipment = activeEquipmentItems(optionalEquipment);
  const batteryEquipment = activeEquipment.filter((item) => item.kind === "battery");
  const generatorEquipment = activeEquipment.filter((item) => item.kind === "generator");
  const batteryAdd = batteryEquipment.reduce((sum, item) => sum + equipmentLineTotal(item), 0);
  const generatorAdd = generatorEquipment.reduce((sum, item) => sum + equipmentLineTotal(item), 0);
  const hasOptionalAdditions = activeEquipment.length > 0;

  const openEquipmentEditor = () => {
    setOptionalEquipment((prev) => ensureEquipmentEditorRows(prev.length ? prev : []));
    setOptionalEquipmentOpen(true);
  };

  const saveEquipmentEditor = () => {
    setOptionalEquipment((prev) => collapseEquipmentForStorage(prev));
    setOptionalEquipmentOpen(false);
  };

  const clearAllEquipment = () => {
    setOptionalEquipment(ensureEquipmentEditorRows([]));
  };

  const removeOrClearEquipmentRow = (item) => {
    const ofKind = equipmentRowsOfKind(optionalEquipment, item.kind);
    if (ofKind.length > 1) {
      setOptionalEquipment((prev) => prev.filter((row) => row.id !== item.id));
      return;
    }
    setOptionalEquipment((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, name: "", unitCost: "", quantity: 1 } : row))
    );
  };

  const equipmentRowClearStyle = (enabled) => ({
    flexShrink: 0,
    alignSelf: "center",
    width: 28,
    height: 28,
    border: "none",
    background: "transparent",
    color: enabled ? "#2f3e4d" : C.g300,
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1,
    padding: 0,
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: fontSans,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.4,
  });

  const renderEquipmentEditorRow = (item) => {
    const presets = item.kind === "generator" ? GENERATOR_PRESETS : BATTERY_PRESETS;
    const listId = item.kind === "generator" ? "janta-generator-presets" : "janta-battery-presets";
    const rowLabel = item.kind === "generator" ? "Generator" : "Battery storage";
    const ofKind = equipmentRowsOfKind(optionalEquipment, item.kind);
    const rowFilled = equipmentHasContent(item);
    const clearEnabled = rowFilled || ofKind.length > 1;
    return (
      <div
        key={item.id}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 52px auto",
          gap: 8,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <Field
          label={rowLabel}
          value={item.name}
          onChange={(v) => {
            const patch = { name: v };
            if (!v.trim()) {
              patch.unitCost = "";
            } else {
              const preset = presetCostForEquipment(v, presets);
              if (preset != null) patch.unitCost = preset;
            }
            setOptionalEquipment((prev) => patchEquipmentItem(prev, item.id, patch));
          }}
          placeholder="Type or select…"
          shrink
          list={listId}
        />
        <Field
          label="Amount"
          value={item.unitCost}
          onChange={(v) => setOptionalEquipment((prev) => patchEquipmentItem(prev, item.id, { unitCost: v }))}
          type="number"
          unit="$"
          placeholder="0"
          shrink
        />
        <Field
          label="Qty"
          value={String(item.quantity)}
          onChange={(v) => {
            const quantity = equipmentQuantity(v);
            setOptionalEquipment((prev) => patchEquipmentItem(prev, item.id, { quantity }));
          }}
          type="number"
          min={1}
          placeholder="1"
          shrink
        />
        <button
          type="button"
          onClick={() => removeOrClearEquipmentRow(item)}
          disabled={!clearEnabled}
          aria-label={ofKind.length > 1 ? `Remove ${rowLabel.toLowerCase()}` : `Clear ${rowLabel.toLowerCase()}`}
          title={ofKind.length > 1 ? `Remove ${rowLabel.toLowerCase()}` : `Clear ${rowLabel.toLowerCase()}`}
          style={equipmentRowClearStyle(clearEnabled)}
        >
          ×
        </button>
      </div>
    );
  };

  const prodCtx = useMemo(
    () => ({ effectiveMonthlyPerKW, effectiveAnnualPerKW, effectiveCF, traditionalCF }),
    [effectiveMonthlyPerKW, effectiveAnnualPerKW, effectiveCF, traditionalCF]
  );
  const meterBundles = useMemo(() => {
    if (!multiMeterMode) return [];
    return meters.map((m) => computeMeterBundle(m, prodCtx));
  }, [multiMeterMode, meters, prodCtx]);

  const activeMeterBundle = useMemo(
    () => meterBundles[activeMeterIdx] || null,
    [meterBundles, activeMeterIdx]
  );

  const effectiveSizeProject = multiMeterMode
    ? Math.round(meterBundles.reduce((sum, b) => sum + b.effectiveSize, 0) * 10) / 10
    : effectiveSize;
  const annualKWhProject = multiMeterMode
    ? meterBundles.reduce((sum, b) => sum + b.annualKWh, 0)
    : annualKWh;
  const monthlyProdProject = multiMeterMode
    ? MONTHS.map((_, i) => meterBundles.reduce((sum, b) => sum + (Number(b.monthlyProd[i]) || 0), 0))
    : effectiveMonthlyPerKW.map((m) => Math.round(m * effectiveSize));
  const annualProdProject = multiMeterMode
    ? meterBundles.reduce((sum, b) => sum + b.annualProd, 0)
    : Math.round(effectiveAnnualPerKW * effectiveSize);
  const monthlyKWhNumericProject = multiMeterMode
    ? MONTHS.map((_, i) => meterBundles.reduce((sum, b) => sum + (Number(b.monthlyKWhNumeric[i]) || 0), 0))
    : monthlyKWhNumeric;
  const usageMissingMaskProject = multiMeterMode
    ? MONTHS.map((_, i) => !meterBundles.some((b) => b.monthlyKWh[i] != null))
    : usageMissingMask;
  const hasMonthlyUsageDataSingle = monthlyKWh.some((v) => v != null && Number(v) > 0);
  const hasMonthlyUsageDataProject = multiMeterMode
    ? meterBundles.some((b) => b.hasMonthlyUsageData)
    : hasMonthlyUsageDataSingle;
  const requiredKwForFullOffsetProject = effectiveAnnualPerKW > 0 ? annualKWhProject / effectiveAnnualPerKW : 0;
  const offsetPctProject = requiredKwForFullOffsetProject > 0
    ? (effectiveSizeProject / requiredKwForFullOffsetProject) * 100
    : 0;

  const solarGrossLow = solarGrossForKw(effectiveSizeProject, costPerKWLow);
  const solarGrossHigh = solarGrossForKw(effectiveSizeProject, costPerKWHigh);
  const solarGross = (solarGrossLow + solarGrossHigh) / 2;
  const grossCostLow = solarGrossLow + batteryAdd + generatorAdd;
  const grossCostHigh = solarGrossHigh + batteryAdd + generatorAdd;
  const grossCost = (grossCostLow + grossCostHigh) / 2;
  const monthlyProd = monthlyProdProject;
  const monthlyTradProd = useMemo(
    () => monthlyTraditionalProd(monthlyProd, effectiveCF, traditionalCF),
    [monthlyProd, effectiveCF, traditionalCF]
  );
  const useMwhDisplay = useMemo(
    () =>
      shouldUseMwhDisplay([
        annualProdProject,
        annualKWhProject,
        ...monthlyProdProject,
        ...monthlyTradProd,
        ...monthlyKWhNumericProject,
      ]),
    [annualProdProject, annualKWhProject, monthlyProdProject, monthlyTradProd, monthlyKWhNumericProject]
  );
  const useMwDisplay = useMemo(
    () =>
      shouldUseMwDisplay([
        effectiveSizeProject,
        ...(multiMeterMode ? meterBundles.map((b) => b.effectiveSize) : [effectiveSize]),
      ]),
    [effectiveSizeProject, multiMeterMode, meterBundles, effectiveSize]
  );
  const step1ProdChart = useMemo(
    () =>
      buildProductionChartConfig({
        salesShowcase: salesShowcaseMode,
        hasUsage: hasMonthlyUsageDataProject,
        monthlyProd: monthlyProdProject,
        monthlyTradProd,
        monthlyKWhNumeric: monthlyKWhNumericProject,
        usageMissingMask: usageMissingMaskProject,
        forPdf: false,
        chartProdColor,
        chartUsageColor,
        chartTradColor,
        screenDark: darkThemeActive,
        useMwh: useMwhDisplay,
      }),
    [
      salesShowcaseMode,
      hasMonthlyUsageDataProject,
      monthlyProdProject,
      monthlyTradProd,
      monthlyKWhNumericProject,
      usageMissingMaskProject,
      chartProdColor,
      chartUsageColor,
      chartTradColor,
      darkThemeActive,
      useMwhDisplay,
    ]
  );
  const proposalProdChart = useMemo(
    () =>
      buildProductionChartConfig({
        salesShowcase: salesShowcaseMode,
        hasUsage: hasMonthlyUsageDataProject,
        monthlyProd: monthlyProdProject,
        monthlyTradProd,
        monthlyKWhNumeric: monthlyKWhNumericProject,
        usageMissingMask: usageMissingMaskProject,
        forPdf: true,
        chartProdColor,
        chartUsageColor,
        chartTradColor,
        screenDark: proposalScreenDark,
        useMwh: useMwhDisplay,
      }),
    [
      salesShowcaseMode,
      hasMonthlyUsageDataProject,
      monthlyProdProject,
      monthlyTradProd,
      monthlyKWhNumericProject,
      usageMissingMaskProject,
      chartProdColor,
      chartUsageColor,
      chartTradColor,
      proposalScreenDark,
      useMwhDisplay,
    ]
  );
  const annualProd = annualProdProject;
  const requiredKwForFullOffset = requiredKwForFullOffsetProject;
  const offsetPct = offsetPctProject;
  const offsetChipTone = (pct) => (pct > 50 ? C.green : pct < 50 ? C.red : C.navy);
  const hasMonthlyUsageData = hasMonthlyUsageDataProject;
  const noUtilityEconomics = productionOnlyMode || usageComparisonMode;
  const includeUtilityBillEconomics = !noUtilityEconomics;
  const includeRoiMetrics = includeUtilityBillEconomics && !savingsOnlyMode;
  const parsedRate = parseFloat(ratePerKWh);
  const rate = noUtilityEconomics ? 0 : (Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0.12);
  const annualSavings = noUtilityEconomics
    ? 0
    : multiMeterMode
      ? meterBundles.reduce((sum, b) => sum + Math.min(b.annualProd, b.annualKWh) * rate, 0)
      : (Math.min(annualProd, annualKWh) * rate);

  // Credits - auto-populated from state
  const stInc = STATE_INCENTIVES[selState] || STATE_INCENTIVES.TX;
  const srecAmt = stInc.srec ? (annualProd / 1000) * stInc.srec.perMWh * stInc.srec.years : 0;
  let utilRebateAmt = 0;
  let utilRebateLabel = "";
  stInc.rebates.forEach(r => {
    if (r.perKW) { utilRebateAmt += effectiveSizeProject * r.perKW; utilRebateLabel = r.name; }
    else if (r.perW) { utilRebateAmt += effectiveSizeProject * 1000 * r.perW; utilRebateLabel = r.name; }
    else if (r.flat) { utilRebateAmt += r.flat; utilRebateLabel = r.name; }
    else { utilRebateLabel = r.name; }
  });
  const buildCreditItemsForGross = (gross) => {
    const itcAmt = gross * (itcPct / 100);
    const ecAmt = gross * 0.10;
    const stateTaxAmt = stInc.tax > 0 ? Math.min(gross * stInc.tax, stInc.taxCap || Infinity) : 0;
    return [
      itcPct > 0 && { key: "itc", label: `Federal ITC (${itcPct}%)`, detailLabel: `Federal ITC — Section 48E (${itcPct}%)`, amount: Math.round(itcAmt) },
      stateTaxAmt > 0 && { key: "stateTax", label: `${stInc.name} Tax Credit (${(stInc.tax * 100).toFixed(0)}%)`, detailLabel: `${stInc.name} State Tax Credit (${(stInc.tax * 100).toFixed(0)}%)`, amount: Math.round(stateTaxAmt) },
      srecAmt > 0 && { key: "srec", label: `${stInc.srec.label || "SREC"} (${stInc.srec.years}yr)`, detailLabel: `${stInc.srec.label || "SREC"} ($${stInc.srec.perMWh}/MWh × ${stInc.srec.years}yr)`, amount: Math.round(srecAmt) },
      utilRebateAmt > 0 && { key: "utility", label: utilRebateLabel || "Utility Rebate", detailLabel: utilRebateLabel || "Utility Rebate", amount: Math.round(utilRebateAmt) },
      ecOn && { key: "energyCommunity", label: "Energy Community", detailLabel: "Energy Community Bonus (10%)", amount: Math.round(ecAmt) },
      ...extraCredits.map((c) => ({ key: `extra:${c.id}`, label: c.name || "Other Credit", detailLabel: c.name || "Other Credit", amount: Math.round(c.amount || 0) })),
    ].filter(Boolean).filter((item) => !removedCreditKeys[item.key]);
  };
  const creditItemsLow = buildCreditItemsForGross(grossCostLow);
  const creditItemsHigh = buildCreditItemsForGross(grossCostHigh);
  const activeCreditItems = creditItemsLow.map((lowItem) => {
    const highItem = creditItemsHigh.find((h) => h.key === lowItem.key);
    const amountHigh = highItem?.amount ?? lowItem.amount;
    const displayAmount =
      solarPriceRange && Math.round(lowItem.amount) !== Math.round(amountHigh)
        ? formatUsdRange(lowItem.amount, amountHigh)
        : formatUsd(lowItem.amount);
    return { ...lowItem, amountHigh, displayAmount };
  });
  const totalCreditsLow = creditItemsLow.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalCreditsHigh = creditItemsHigh.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalCredits = (totalCreditsLow + totalCreditsHigh) / 2;
  const netCostLow = grossCostLow - totalCreditsLow;
  const netCostHigh = grossCostHigh - totalCreditsHigh;
  const netCost = (netCostLow + netCostHigh) / 2;
  // ROI / break-even / 25yr: solar PV only — batteries & generators excluded from net cost; incentives on solar gross
  const utilityCreditItemsLow = buildCreditItemsForGross(solarGrossLow);
  const utilityCreditItemsHigh = buildCreditItemsForGross(solarGrossHigh);
  const utilityTotalCreditsLow = utilityCreditItemsLow.reduce((sum, item) => sum + (item.amount || 0), 0);
  const utilityTotalCreditsHigh = utilityCreditItemsHigh.reduce((sum, item) => sum + (item.amount || 0), 0);
  const utilityNetCostLow = solarGrossLow - utilityTotalCreditsLow;
  const utilityNetCostHigh = solarGrossHigh - utilityTotalCreditsHigh;
  const utilityNetCost = (utilityNetCostLow + utilityNetCostHigh) / 2;
  const autoFinIncentivePct = grossCost > 0 ? (totalCredits / grossCost) * 100 : 0;
  const stateTaxCreditLow = creditItemsLow.find((i) => i.key === "stateTax")?.amount ?? 0;
  const stateTaxCreditHigh = creditItemsHigh.find((i) => i.key === "stateTax")?.amount ?? 0;
  const stateTaxCreditDisplay =
    solarPriceRange && Math.round(stateTaxCreditLow) !== Math.round(stateTaxCreditHigh)
      ? formatUsdRange(stateTaxCreditLow, stateTaxCreditHigh)
      : formatUsd(stateTaxCreditLow);
  const grossCostDisplay = solarPriceRange ? formatUsdRange(grossCostLow, grossCostHigh) : formatUsd(grossCost);
  const netCostDisplay = solarPriceRange ? formatUsdRange(netCostLow, netCostHigh) : formatUsd(netCost);
  const kw = effectiveSizeProject;
  const projectGrossPerWDisplay = solarPriceRange
    ? formatUsdPerWRangeFromTotals(grossCostLow, grossCostHigh, kw)
    : formatUsdPerWFromTotal(grossCost, kw);
  const projectNetPerWDisplay = solarPriceRange
    ? formatUsdPerWRangeFromTotals(netCostLow, netCostHigh, kw)
    : formatUsdPerWFromTotal(netCost, kw);
  const solarGrossDisplay = solarPriceRange ? formatUsdRange(solarGrossLow, solarGrossHigh) : formatUsd(solarGrossLow);
  const solarNetDisplay = solarPriceRange ? formatUsdRange(utilityNetCostLow, utilityNetCostHigh) : formatUsd(utilityNetCost);
  const costPerKWDisplay = solarPriceRange ? formatUsdRange(costPerKWLow, costPerKWHigh) : formatUsd(costPerKWLow);
  const grossPerWDisplay = solarPriceRange
    ? formatUsdPerWRangeFromTotals(solarGrossLow, solarGrossHigh, kw)
    : formatUsdPerWFromTotal(solarGrossLow, kw);
  const netPerWDisplay = solarPriceRange
    ? formatUsdPerWRangeFromTotals(utilityNetCostLow, utilityNetCostHigh, kw)
    : formatUsdPerWFromTotal(utilityNetCost, kw);
  const incentivePerWDisplay = solarPriceRange
    ? formatUsdPerWRangeFromTotals(totalCreditsLow, totalCreditsHigh, kw)
    : formatUsdPerWFromTotal(totalCredits, kw);
  const totalCreditsDisplay =
    solarPriceRange && Math.round(totalCreditsLow) !== Math.round(totalCreditsHigh)
      ? formatUsdRange(totalCreditsLow, totalCreditsHigh)
      : formatUsd(totalCreditsLow);

  const itcCreditRemoved = !!removedCreditKeys.itc;
  const ecCreditRemoved = !!removedCreditKeys.energyCommunity;

  function clearRemovedCreditKey(key) {
    setRemovedCreditKeys((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addExtraCredit() {
    const amount = parseFloat(extraCreditAmt);
    if (!extraCreditName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setExtraCredits((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: extraCreditName.trim(), amount }]);
    setExtraCreditName("");
    setExtraCreditAmt("");
  }

  function removeCreditItem(key) {
    if (key.startsWith("extra:")) {
      const id = key.split(":")[1];
      setExtraCredits((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    setRemovedCreditKeys((prev) => ({ ...prev, [key]: true }));
  }

  function toggleCreditItem(key) {
    if (key.startsWith("extra:")) {
      removeCreditItem(key);
      return;
    }
    setRemovedCreditKeys((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  }

  function restoreAllAutoCredits() {
    setRemovedCreditKeys({});
  }

  // 25yr savings projection ($); full table + net column only in ROI mode
  const esc = noUtilityEconomics ? 0 : (parseFloat(rateEsc) || 3);
  const projection = useMemo(() => {
    if (!includeUtilityBillEconomics) return [];
    const rows = [];
    let cum = 0;
    for (let y = 1; y <= 25; y++) {
      const prod = annualProd * Math.pow(0.995, y);
      const r = rate * Math.pow(1 + esc / 100, y);
      const usageCap = multiMeterMode ? annualKWhProject : annualKWh;
      const sav = Math.min(prod, usageCap) * r;
      cum += sav;
      rows.push({
        y,
        prod: Math.round(prod),
        sav: Math.round(sav),
        cum: Math.round(cum),
        net: includeRoiMetrics ? Math.round(cum - utilityNetCost) : 0,
      });
    }
    return rows;
  }, [annualProd, annualKWhProject, rate, esc, utilityNetCost, includeUtilityBillEconomics, includeRoiMetrics, multiMeterMode, annualKWh]);

  const breakEven = !includeRoiMetrics ? "N/A" : (projection.find(r => r.net >= 0)?.y || "25+");
  const savings25 = includeUtilityBillEconomics ? (projection[24]?.cum || 0) : 0;
  const roi = !includeRoiMetrics ? 0 : (utilityNetCost > 0 ? ((annualSavings / utilityNetCost) * 100) : 0);
  const proposalFinancialSectionTitle = productionOnlyMode
    ? "Production Breakdown"
    : usageComparisonMode
      ? "Production & Usage Comparison"
      : savingsOnlyMode
        ? "Production & Utility Savings"
        : "Financial Breakdown";

  useEffect(() => {
    if (step !== 5) return;
    const root = proposalPdfRef.current;
    if (!root) return;
    const usablePdfWidthMm = 210 - 10 - 10;
    const usablePdfHeightMm = 297 - 10 - 14;
    const pageHeightPx = root.clientWidth * (usablePdfHeightMm / usablePdfWidthMm);
    if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return;

    let pageStart = 0;
    const breaks = [];
    const forcedBreakIndices = [];
    const kids = Array.from(root.children || []);
    // Clear only previously script-applied forced page breaks before recomputing.
    kids.forEach((child) => {
      if (child.dataset.jantaForcedBreak === "1") {
        child.style.breakBefore = "";
        child.style.pageBreakBefore = "";
        delete child.dataset.jantaForcedBreak;
      }
    });
    kids.forEach((child, idx) => {
      const top = child.offsetTop;
      const bottom = top + child.offsetHeight;
      const childStyle = window.getComputedStyle(child);
      const breakBeforeVal = (childStyle.getPropertyValue("break-before") || "").trim().toLowerCase();
      const pageBreakBeforeVal = (childStyle.getPropertyValue("page-break-before") || "").trim().toLowerCase();
      const hasExplicitBreakBefore =
        ["page", "always", "left", "right"].includes(breakBeforeVal) ||
        ["always", "left", "right"].includes(pageBreakBeforeVal);
      if (hasExplicitBreakBefore && top > pageStart + 1) {
        pageStart = top;
        breaks.push(pageStart);
      }
      const avoid =
        child.style.breakInside === "avoid" ||
        child.style.pageBreakInside === "avoid" ||
        childStyle.getPropertyValue("break-inside") === "avoid" ||
        childStyle.getPropertyValue("page-break-inside") === "avoid";

      if (avoid && bottom - pageStart > pageHeightPx && top > pageStart + 1) {
        pageStart = top;
        breaks.push(pageStart);
        forcedBreakIndices.push(idx);
      }
      while (bottom - pageStart > pageHeightPx) {
        pageStart += pageHeightPx;
        breaks.push(pageStart);
      }
    });
    // Apply explicit breaks so PDF output follows the exact same break points.
    forcedBreakIndices.forEach((idx) => {
      if (idx <= 0 || !kids[idx]) return;
      kids[idx].style.breakBefore = "page";
      kids[idx].style.pageBreakBefore = "always";
      kids[idx].dataset.jantaForcedBreak = "1";
    });
    setProposalBreakGuides(breaks);
    return () => {
      kids.forEach((child) => {
        if (child.dataset.jantaForcedBreak === "1") {
          child.style.breakBefore = "";
          child.style.pageBreakBefore = "";
          delete child.dataset.jantaForcedBreak;
        }
      });
    };
  }, [step, includeFinancialsInProposal, includeCapitalLessSavedLand, includeUtilityBillEconomics, includeRoiMetrics, productionOnlyMode, usageComparisonMode, savingsOnlyMode, pdfExporting, startPermissionsOnNewPage, multiMeterMode, meters.length, meterBundles.length]);
  // Excel-based land model:
  // Space Required by Janta (acres) = (X MW * 1000) / 450
  // Space Required by Fixed Tilt (acres) = (X MW * 1000) / 150
  // Space Conserved (acres) = Fixed Tilt acres - Janta acres
  const capacityMw = effectiveSizeProject / 1000;
  const jantaAcres = (capacityMw * 1000) / 450;
  const fixedTiltAcres = (capacityMw * 1000) / 150;
  const conservedAcres = Math.max(0, fixedTiltAcres - jantaAcres);
  const landReq = Math.round(jantaAcres * SQFT_PER_ACRE);
  const landCons = Math.round(conservedAcres * SQFT_PER_ACRE);
  const sqftPerAcre = SQFT_PER_ACRE;
  const formatArea = (sqft) => (
    sqft > sqftPerAcre
      ? `${(sqft / sqftPerAcre).toFixed(2)} Acres`
      : `${sqft.toLocaleString()} Sq Ft`
  );
  const finCapacityMw = effectiveSizeProject / 1000;
  const finCapacityFactor = effectiveCF;
  const finAnnualMWh = finCapacityMw * 8760 * finCapacityFactor;
  const finMonthlyMWh = finAnnualMWh / 12;
  const finPricePerMwNum = parseFloat(finPricePerMw) || 0;
  const finIncentivePctNum = autoFinIncentivePct;
  const finMaintenancePerMwYearNum = parseFloat(finMaintenancePerMwYear) || 0;
  const finEnergyValuePerMWhNum = parseFloat(finEnergyValuePerMWh) || 0;
  const finProjectCost = finPricePerMwNum * finCapacityMw;
  const finDeveloperCapitalCost = finProjectCost * (1 - (finIncentivePctNum / 100));
  const finAnnualMaintenance = finMaintenancePerMwYearNum * finCapacityMw;
  const finAnnualRevenue = finAnnualMWh * finEnergyValuePerMWhNum;
  const finAnnualProfit = finAnnualRevenue - finAnnualMaintenance;
  const finLifetimeRevenue = finAnnualRevenue * 25;
  const finLifetimeProfit = finAnnualProfit * 25;
  const finLifetimeRoiPct = finDeveloperCapitalCost > 0 ? (finLifetimeProfit / finDeveloperCapitalCost) * 100 : 0;
  const finBreakEvenYears = finAnnualProfit > 0 ? (finDeveloperCapitalCost / finAnnualProfit) : null;
  const finSavedLandValuePerAcreNum = parseFloat(finSavedLandValuePerAcre) || 0;
  const finSavedLandValueTotal = conservedAcres * finSavedLandValuePerAcreNum;
  const finCapitalLessSavedLand = Math.max(0, finDeveloperCapitalCost - finSavedLandValueTotal);
  const finScenarioStart = Math.max(0, finEnergyValuePerMWhNum - 10);
  const finScenarioPrices = Array.from({ length: 6 }, (_, i) => finScenarioStart + (i * 10));
  const finScenarios = finScenarioPrices.map((price) => {
    const annualRevenue = finAnnualMWh * price;
    const annualProfit = annualRevenue - finAnnualMaintenance;
    const lifetimeProfit = annualProfit * 25;
    const yearsToBreakeven = annualProfit > 0 ? finDeveloperCapitalCost / annualProfit : null;
    const annualRoiPct = finDeveloperCapitalCost > 0 ? (annualProfit / finDeveloperCapitalCost) * 100 : 0;
    const yearsToBreakevenLessLand = annualProfit > 0 ? finCapitalLessSavedLand / annualProfit : null;
    const annualRoiPctLessLand = finCapitalLessSavedLand > 0 ? (annualProfit / finCapitalLessSavedLand) * 100 : 0;
    return {
      price,
      annualRevenue,
      annualProfit,
      lifetimeProfit,
      yearsToBreakeven,
      annualRoiPct,
      yearsToBreakevenLessLand,
      annualRoiPctLessLand,
    };
  });
  const finFmtInt = (v) => Math.round(v || 0).toLocaleString();
  const finFmtYears = (v) => (v == null || !Number.isFinite(v) ? "N/A" : v.toFixed(2));
  const finFmtPct = (v) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;
  const money = (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const finProposalCell = { textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: C.navy, fontFamily: fontSans };

  // Shadow
  const lat = reg.lat;
  const shData = calcShadow(lat, shMonth, shHour, parseFloat(obstH) || 8, parseFloat(obstD) || 15);
  const hourly = [];
  for (let h = 5; h <= 20; h++) hourly.push({ h, ...calcShadow(lat, shMonth, h, parseFloat(obstH) || 8, parseFloat(obstD) || 15) });
  const shadedH = hourly.filter(h => h.shaded && h.alt > 0).length;
  const dayH = hourly.filter(h => h.alt > 0).length;
  const shadeLoss = dayH > 0 ? (shadedH / dayH * 100) : 0;

  // ── Step titles ──
  const steps = [
    { label: "Bill Analysis", icon: "1" },
    { label: "System", icon: "2" },
    { label: "Project Pricing", icon: "3" },
    { label: "Project Financials", icon: "4" },
    { label: "Shadow Calc", icon: "5" },
    { label: "Proposal", icon: "6" },
  ];

  const pdfAvoid = { breakInside: "avoid", pageBreakInside: "avoid" };
  const renderSystemCostsSection = (pdfMode, compactMode = false) => {
    const avoid = pdfMode ? pdfAvoid : {};
    const pad = pdfMode ? (compactMode ? 12 : 24) : 20;
    const h3Size = pdfMode ? (compactMode ? 14 : 16) : 15;
    const h3Mb = pdfMode && compactMode ? 10 : 14;
    const blockPad = pdfMode && compactMode ? 8 : 12;
    const blockGap = pdfMode && compactMode ? 8 : 12;
    const title = pdfMode ? "System Costs" : "System Costs (Preview)";
    const summaryDark = darkThemeActive && (!pdfMode || proposalScreenDark);
    const showcasePy = 8;
    const showcaseRowPad = `${showcasePy}px 0`;
    const showcaseNetColor = darkThemeActive ? "#7EB8DC" : C.blue;
    const showcaseNetBoxBg = summaryDark ? "#1A3044" : "#E8F2F8";
    const showcaseNetBoxBorder = summaryDark ? "#3D6280" : "#B8D4E8";
    const showcasePerW = (perW, color = C.navy) => (
      <div style={{ textAlign: "right", color, fontWeight: 600, fontSize: 14, lineHeight: 1, fontFamily: fontSans }}>{perW}</div>
    );
    const showcaseCostRow = (label, perW, color, borderTop = false, key) => (
      <div
        key={key}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
          padding: showcaseRowPad,
          borderTop: borderTop ? `1px solid ${C.g200}` : undefined,
        }}
      >
        <span style={{ color: C.g500, fontSize: 11 }}>{label}</span>
        {showcasePerW(perW, color)}
      </div>
    );
    const equipmentList =
      (batteryAdd > 0 || generatorAdd > 0) && (
        <div style={{ marginTop: blockGap, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 8, padding: blockPad, ...avoid }}>
          <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
            Battery & Generator
          </div>
          {[...batteryEquipment, ...generatorEquipment].map((item, i, rows) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: i < rows.length - 1 ? `1px dashed ${C.g200}` : "none",
                fontSize: 12,
              }}
            >
              <span style={{ color: C.g700 }}>{formatEquipmentLabel(item)}</span>
              <span style={{ color: C.navy, fontFamily: fontSans, fontWeight: 700 }}>${Math.round(equipmentLineTotal(item)).toLocaleString()}</span>
            </div>
          ))}
        </div>
      );
    const inner = (
      <div
        style={{
          background: C.white,
          borderRadius: 10,
          padding: pad,
          border: `1px solid ${C.g200}`,
          ...avoid,
        }}
      >
        <h3 style={{ margin: `0 0 ${h3Mb}px 0`, fontSize: h3Size, fontWeight: 700, color: titleColor }}>{title}</h3>

        {salesShowcaseMode ? (
          <>
            <div style={{ background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: `0 ${blockPad}px`, ...avoid }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: showcaseRowPad,
                }}
              >
                <span style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>Solar PV</span>
                <span style={{ color: C.navy, fontWeight: 700, fontFamily: fontSans, fontSize: 12 }}>{formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}</span>
              </div>
              <div style={{ fontFamily: fontSans }}>
                {showcaseCostRow("Gross", grossPerWDisplay, C.navy, true)}
                {activeCreditItems.map((item, i) =>
                  showcaseCostRow(
                    item.label,
                    formatCreditPerW(item.amount, item.amountHigh, kw, solarPriceRange),
                    C.green,
                    true,
                    `${item.key}-${i}`
                  )
                )}
                {showcaseCostRow("Net", netPerWDisplay, showcaseNetColor, true)}
              </div>
            </div>

            {equipmentList}

            <div style={{ marginTop: blockGap, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: pdfMode && compactMode ? 6 : 8, ...avoid }}>
              <div style={{ background: summaryDark ? "#22180F" : C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Project gross</div>
                <div style={{ color: summaryDark ? "#F8F2E8" : C.navy, fontWeight: 700, fontFamily: fontSans, marginTop: 2, fontSize: 18, lineHeight: 1.15 }}>
                  {projectGrossPerWDisplay}
                </div>
                <div style={{ color: C.g500, fontSize: 10, fontFamily: fontSans, marginTop: 3 }}>{grossCostDisplay}</div>
              </div>
              <div style={{ background: summaryDark ? "#1A2A1F" : "#EEF8F0", border: `1px solid ${summaryDark ? "#2D4A38" : "#C8E6CF"}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: summaryDark ? "#8FB89A" : C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>
                  Incentives
                </div>
                <div style={{ color: C.green, fontWeight: 700, fontFamily: fontSans, marginTop: 2, fontSize: 18, lineHeight: 1 }}>
                  {incentivePerWDisplay}
                </div>
                <div style={{ color: summaryDark ? "#8FB89A" : C.g500, fontSize: 10, fontFamily: fontSans, marginTop: 2 }}>
                  {totalCreditsDisplay}
                </div>
              </div>
              <div style={{ background: showcaseNetBoxBg, border: `1px solid ${showcaseNetBoxBorder}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: summaryDark ? "#8FB0C8" : C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Project net</div>
                <div style={{ color: showcaseNetColor, fontWeight: 700, fontFamily: fontSans, marginTop: 2, fontSize: 18, lineHeight: 1.15 }}>
                  {projectNetPerWDisplay}
                </div>
                <div style={{ color: summaryDark ? "#8FB0C8" : C.g500, fontSize: 10, fontFamily: fontSans, marginTop: 3 }}>
                  {netCostDisplay}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: blockPad, ...avoid }}>
              <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: pdfMode && compactMode ? 6 : 8 }}>
                Base System Price
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontFamily: fontSans }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.g500 }}>{multiMeterMode && meterBundles.length > 0 ? "Total system size" : "System Size"}</span>
                  <span style={{ color: C.navy, fontWeight: 700 }}>{formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.g500 }}>Price per kW</span>
                  <span style={{ color: C.navy, fontWeight: 700 }}>{costPerKWDisplay}</span>
                </div>
                <div style={{ borderTop: `1px dashed ${C.g200}`, marginTop: 2, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.blue, fontWeight: 700 }}>System Total (Solar PV)</span>
                  <span style={{ color: C.blue, fontWeight: 700, fontFamily: fontSans }}>{solarGrossDisplay}</span>
                </div>
              </div>
            </div>

            {equipmentList}

            <div style={{ marginTop: blockGap, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 8, padding: blockPad, ...avoid }}>
              <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
                Applied Credits & Incentives
              </div>
              {activeCreditItems.length === 0 ? (
                <div style={{ color: C.g500, fontSize: 12, fontFamily: fontSans }}>No credits currently applied.</div>
              ) : (
                activeCreditItems.map((item, i) => (
                  <div key={`${item.key}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < activeCreditItems.length - 1 ? `1px dashed ${C.g200}` : "none", fontSize: 12 }}>
                    <span style={{ color: C.g700 }}>{item.detailLabel}</span>
                    <span style={{ color: C.green, fontFamily: fontSans, fontWeight: 700 }}>{item.displayAmount || formatUsd(item.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: blockGap, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: pdfMode && compactMode ? 6 : 8, ...avoid }}>
              <div style={{ background: summaryDark ? "#22180F" : C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Gross</div>
                <div style={{ color: summaryDark ? "#F8F2E8" : C.navy, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>{grossCostDisplay}</div>
              </div>
              <div style={{ background: summaryDark ? "#1E2A20" : "#ECF8F5", border: summaryDark ? `1px solid ${C.g200}` : "1px solid #CBECE4", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Credits</div>
                <div style={{ color: C.green, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>{totalCreditsDisplay}</div>
              </div>
              <div style={{ background: summaryDark ? C.gold : C.navy, border: `1px solid ${summaryDark ? C.goldLight : C.navy}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: summaryDark ? "#3A2A15" : "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Net Cost</div>
                <div style={{ color: summaryDark ? "#1D130A" : "#F8F2E8", fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>{netCostDisplay}</div>
              </div>
            </div>
          </>
        )}
      </div>
    );
    if (pdfMode) return inner;
    return (
      <div
        style={{
          borderRadius: 12,
          border: `2px dashed ${C.blue}`,
          background: darkThemeActive
            ? "linear-gradient(180deg, #19140F 0%, #110D0A 100%)"
            : "linear-gradient(180deg, #E8F2F8 0%, #F5F9FC 100%)",
          padding: 14,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: `1px dashed ${C.blue}55` }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: titleColor, fontFamily: fontSans, background: darkThemeActive ? "#16110D" : C.white, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.blue}66` }}>
            Proposal preview
          </span>
          <span style={{ fontSize: 11, color: C.g500, fontFamily: fontSans, lineHeight: 1.4, maxWidth: 320, textAlign: "right" }}>
            This block mirrors the <strong style={{ color: titleColor }}>System Costs</strong> section on the PDF.
          </span>
        </div>
        {inner}
      </div>
    );
  };

  const renderMeterChartsBlock = (bundle, { chartH = 155, seasonalH = 155, compact = false, forPdf = false, pairPage = false, firstPageMeter = false } = {}) => {
    const meterHasUsage = bundle.hasMonthlyUsageData;
    const screenDark = forPdf ? false : proposalScreenDark;
    const prodChart = buildProductionChartConfig({
      salesShowcase: salesShowcaseMode,
      hasUsage: meterHasUsage,
      monthlyProd: bundle.monthlyProd,
      monthlyTradProd: bundle.monthlyTradProd,
      monthlyKWhNumeric: bundle.monthlyKWhNumeric,
      usageMissingMask: bundle.usageMissingMask,
      forPdf,
      chartProdColor,
      chartUsageColor,
      chartTradColor,
      screenDark,
      useMwh: useMwhDisplay,
    });
    const metricsGap = forPdf ? (firstPageMeter ? 6 : pairPage ? 8 : compact ? 14 : 22) : (compact ? 8 : 12);
    const chartTopGap = forPdf ? (firstPageMeter ? 2 : pairPage ? 4 : compact ? 6 : 8) : 0;
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: metricsGap }}>
          <Metric label="System size" value={formatSystemKw(bundle.effectiveSize, useMwDisplay)} sub={systemUnitLabel(useMwDisplay)} highlight />
          <Metric label="Annual production" value={formatEnergyKwh(bundle.annualProd, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay, { perYear: true })} color={C.blue} highlight />
          {meterHasUsage && <Metric label="Annual usage" value={formatEnergyKwh(bundle.annualKWh, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay, { perYear: true })} />}
        </div>
        <h4 style={{ margin: `${chartTopGap}px 0 ${compact ? 8 : 10}px 0`, fontSize: compact ? 14 : 16, fontWeight: 700, color: titleColor }}>{prodChart.title}</h4>
        <BarChart
          {...prodChart.chart}
          missingBarColor={screenDark ? "#E85D5D" : "#D64545"}
          labels={MONTHS}
          height={chartH}
          showBarValues={forPdf}
        />
        <h4 style={{ margin: firstPageMeter ? "6px 0 3px 0" : pairPage ? "8px 0 4px 0" : compact ? "12px 0 6px 0" : "16px 0 6px 0", fontSize: firstPageMeter ? 12 : compact || pairPage ? 13 : 16, fontWeight: 700, color: titleColor }}>Seasonal Production</h4>
        <p style={{ color: C.g500, fontSize: firstPageMeter ? 9 : pairPage ? 9 : compact ? 10 : 11, fontFamily: fontSans, margin: firstPageMeter ? "0 0 4px 0" : pairPage ? "0 0 6px 0" : "0 0 10px 0" }}>
          Average power (kW) by month for the {formatSystemWithUnit(bundle.effectiveSize, useMwDisplay)} system{samData ? " — from NREL PVWatts" : ""}.
        </p>
        <SeasonalChart
          monthlyKWh={bundle.monthlyProd}
          color={C.gold}
          height={seasonalH}
          title=""
          compact={forPdf && seasonalH < 130}
          useMwh={useMwhDisplay}
        />
      </>
    );
  };

  const renderProposalPreviewShell = (mirrorLabel, content) => (
    <div
      style={{
        borderRadius: 12,
        border: `2px dashed ${C.blue}`,
        background: darkThemeActive
          ? "linear-gradient(180deg, #19140F 0%, #110D0A 100%)"
          : "linear-gradient(180deg, #E8F2F8 0%, #F5F9FC 100%)",
        padding: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: `1px dashed ${C.blue}55` }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: titleColor, fontFamily: fontSans, background: darkThemeActive ? "#16110D" : C.white, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.blue}66` }}>
          Proposal preview
        </span>
        <span style={{ fontSize: 11, color: C.g500, fontFamily: fontSans, lineHeight: 1.4, maxWidth: 340, textAlign: "right" }}>
          This block mirrors the <strong style={{ color: titleColor }}>{mirrorLabel}</strong> section on the PDF.
        </span>
      </div>
      {content}
    </div>
  );

  const pdfPrepOverlay =
    pdfExporting && isDarkMode && typeof document !== "undefined"
      ? createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2147483646,
              background: "#000000",
              display: "grid",
              placeItems: "center",
              fontFamily: fontSans,
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "#F8F2E8",
                padding: 24,
                maxWidth: 320,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Preparing PDF…</div>
              <div style={{ fontSize: 13, color: "#D8C6AE", lineHeight: 1.5 }}>
                Proposal exports in standard light formatting. Dark mode resumes when finished.
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {pdfPrepOverlay}
      <div
        className="janta-app-root"
        style={{
          fontFamily: fontSerif,
          background: darkThemeActive ? "#000000" : C.offWhite,
          minHeight: "100vh",
          width: 960,
          maxWidth: "calc(100vw - 24px)",
          margin: "0 auto",
          zoom: pageScale,
        }}
      >
      <style>{`
        .janta-app-root,
        .janta-app-root * {
          transition:
            background-color 280ms ease,
            color 280ms ease,
            border-color 280ms ease,
            box-shadow 280ms ease,
            fill 280ms ease,
            stroke 280ms ease;
        }

        @media (prefers-reduced-motion: reduce) {
          .janta-app-root,
          .janta-app-root * {
            transition: none !important;
          }
        }

        .janta-app-root input::placeholder,
        .janta-app-root textarea::placeholder {
          color: ${darkThemeActive ? "#D8C6AE" : C.g500};
          opacity: 1;
        }
      `}</style>
      {/* HEADER */}
      <div
        style={{
          background: C.navy,
          padding: "14px 24px 12px",
          boxShadow: `0 0 0 100vmax ${C.navy}`,
          clipPath: "inset(0 -100vmax)",
        }}
      >
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img
            src="/assets/janta-logo-cropped.svg"
            alt="Janta Power"
            style={{ height: 42, width: "auto", display: "block", objectFit: "contain" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {savedProposalId && savedProposalTitle && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: fontSans,
                  color: "rgba(255,255,255,0.55)",
                  marginTop: 8,
                  maxWidth: 160,
                  textAlign: "right",
                  lineHeight: 1.3,
                }}
                title={savedProposalTitle}
              >
                {savedProposalTitle.length > 28 ? `${savedProposalTitle.slice(0, 28)}…` : savedProposalTitle}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsDarkMode((v) => !v)}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={isDarkMode ? "Dark mode" : "Light mode"}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? "rgba(211,161,74,0.8)" : "rgba(255,255,255,0.28)"}`,
                background: isDarkMode
                  ? "linear-gradient(180deg, #1A1711 0%, #0F0F0F 100%)"
                  : "rgba(255,255,255,0.08)",
                boxShadow: isDarkMode
                  ? "0 0 0 1px rgba(211,161,74,0.2) inset, 0 0 12px rgba(211,161,74,0.18)"
                  : "none",
                color: isDarkMode ? C.goldLight : C.white,
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                marginTop: 8,
              }}
            >
              {isDarkMode ? "🌙" : "☀️"}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open settings"
              title="Settings"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.08)",
                color: "#F8F2E8",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                marginTop: 8,
              }}
            >
              ⚙
            </button>
            {savedProposalId && typeof onAutosaveProposal === "function" && (
              <button
                type="button"
                onClick={saveProposalNow}
                disabled={saveBusy}
                aria-label="Save proposal"
                title="Save to cloud"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: isDarkMode ? "1px solid rgba(120,200,140,0.55)" : "1px solid rgba(80,160,100,0.75)",
                  background: isDarkMode
                    ? "linear-gradient(180deg, #1A4A2E 0%, #0D2E1A 100%)"
                    : "linear-gradient(180deg, #3CB371 0%, #2A9D5C 100%)",
                  color: "#E8FFF0",
                  cursor: saveBusy ? "wait" : "pointer",
                  opacity: saveBusy ? 0.7 : 1,
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  marginTop: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {typeof onOpenProposals === "function" && (
              <button
                type="button"
                onClick={handleBackToProposals}
                aria-label="Back to proposals"
                title="Back to proposals"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: isDarkMode ? "1px solid rgba(255,140,140,0.55)" : "1px solid rgba(255,120,120,0.75)",
                  background: isDarkMode
                    ? "linear-gradient(180deg, #4A1515 0%, #2E0D0D 100%)"
                    : "linear-gradient(180deg, #E34B4B 0%, #C23232 100%)",
                  color: "#FFECEC",
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  marginTop: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOutWithSave}
              aria-label="Sign out"
              title="Sign out"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: isDarkMode ? "1px solid rgba(180,80,80,0.5)" : "1px solid rgba(120,28,28,0.85)",
                background: isDarkMode
                  ? "linear-gradient(180deg, #3D1218 0%, #1F0A0E 100%)"
                  : "linear-gradient(180deg, #8B1A1A 0%, #5C1010 100%)",
                color: "#FFECEC",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                marginTop: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 16l4-4-4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        {/* Step nav */}
        <div style={{ display: "flex", gap: 4 }}>
          {steps.map((s, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              flex: 1, padding: "10px 12px", border: "none", cursor: "pointer",
              background: isDarkMode
                ? (step === i ? C.gold : "#E3D2B8")
                : step === i ? C.white : step > i ? "rgba(200,168,78,0.15)" : "rgba(255,255,255,0.05)",
              color: isDarkMode
                ? (step === i ? "#1B140D" : "#241A12")
                : step === i ? C.navy : step > i ? C.gold : "rgba(255,255,255,0.4)",
              borderRadius: "6px 6px 0 0", fontSize: 12, fontFamily: fontSans,
              fontWeight: step === i ? 700 : 400, transition: "all 0.15s",
            }}>
              <span style={{ display: "inline-block", width: 18, height: 18, lineHeight: "18px", borderRadius: "50%", background: step === i ? C.navy : "transparent", color: step === i ? "#FFFFFF" : "inherit", fontSize: 10, fontWeight: 700, textAlign: "center", marginRight: 5 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 20 }}>

        {/* ═══ STEP 0: BILL ANALYSIS ═══ */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* ── Proposal setup ── */}
            <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Proposal setup</h3>
                </div>
                {multiMeterMode && meterBundles.length > 0 && (
                  <span style={{ fontSize: 10, fontFamily: fontSans, color: C.g500, background: C.cream, padding: "3px 8px", borderRadius: 999, border: `1px solid ${C.g200}` }}>
                    {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}
                    {productionOnlyMode
                      ? ` · ${formatEnergyWithUnit(annualProdProject, useMwhDisplay, { perYear: true })} prod`
                      : ` · ${formatEnergyWithUnit(annualKWhProject, useMwhDisplay, { perYear: true })}`}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
                <Toggle label="Multi-meter" checked={multiMeterMode} onChange={onMultiMeterToggle} />
                <Toggle label="Production-only" checked={productionOnlyMode} onChange={onProductionOnlyToggle} />
                <Toggle label="Usage compare (no $)" checked={usageComparisonMode} onChange={onUsageComparisonToggle} />
                <Toggle label="Savings & offset (no ROI)" checked={savingsOnlyMode} onChange={onSavingsOnlyToggle} />
                <Toggle label="Sales showcase" checked={salesShowcaseMode} onChange={setSalesShowcaseMode} />
              </div>
            </div>

            {/* ── Bill upload (single — auto-detects meters) ── */}
            {!productionOnlyMode && (
              <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Bill upload</h3>
                </div>
                <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 8px 0", lineHeight: 1.45 }}>
                  One combined bill is fine — we detect separate meters and split usage automatically (up to {MAX_PROJECT_METERS} per project).
                </p>
                <input ref={billInputRef} type="file" multiple accept=".pdf,.txt,text/plain,application/pdf" style={{ display: "none" }} onChange={(e) => handleBillFiles(e.target.files)} />
                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleBillFiles(e.dataTransfer.files); }} onClick={() => billInputRef.current?.click()} style={{ width: "100%", marginBottom: 8, padding: "12px", background: C.g100, border: `1px dashed ${C.g300}`, borderRadius: 6, color: C.g700, fontSize: 11, fontFamily: fontSans, cursor: "pointer", boxSizing: "border-box" }}>
                  {billUploadLoading ? "Reading file(s)..." : billFileName ? `✓ ${billFileName}` : "Drop bill file(s) or click to upload"}
                </div>
                {billUploadError && <div style={{ marginBottom: 6, color: C.red, fontSize: 10, fontFamily: fontSans }}>{billUploadError}</div>}
                <textarea value={billText} onChange={(e) => { setBillText(e.target.value); setBillExtractNotice(""); }} rows={6} placeholder="Paste full utility bill (all meters)…" style={{ width: "100%", padding: 10, background: C.g100, border: `1px solid ${C.g200}`, borderRadius: 6, color: C.g700, fontSize: 11, fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={billText.length < 20}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "12px 0",
                    boxSizing: "border-box",
                    background: billText.length >= 20 ? (darkThemeActive ? "#E3D2B8" : C.navy) : C.g300,
                    color: billText.length >= 20 ? (darkThemeActive ? "#1B140D" : "#fff") : C.g500,
                    border: darkThemeActive && billText.length >= 20 ? `1px solid ${C.g300}` : "none",
                    borderRadius: 8,
                    cursor: billText.length >= 20 ? "pointer" : "default",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: fontSans,
                  }}
                >
                  Extract bill & detect meters
                </button>
                {billExtractNotice && (
                  <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.green}14`, border: `1px solid ${C.green}`, borderRadius: 6, fontSize: 11, fontFamily: fontSans, color: C.g700, lineHeight: 1.45 }}>
                    {billExtractNotice}
                  </div>
                )}
              </div>
            )}

            {/* ── Project meters (name / number) ── */}
            {multiMeterMode && (
              <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Project meters</h3>
                  <span style={{ fontSize: 10, fontFamily: fontSans, color: C.g500, marginLeft: "auto" }}>
                    {meters.length}/{MAX_PROJECT_METERS} meters
                  </span>
                </div>
                <p style={{ color: C.g500, fontSize: 10, fontFamily: fontSans, margin: "0 0 10px 0" }}>
                  {productionOnlyMode
                    ? `Name each meter (optional meter #). Set kW per meter on the next step — up to ${MAX_PROJECT_METERS} meters per project.`
                    : `Optional meter # auto-fills the name field (e.g. Meter 60-01). Edit the name to anything you like. Up to ${MAX_PROJECT_METERS} meters per project.`}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {meters.map((m, i) => {
                    const s = summarizeMeterUsage(m);
                    const saved = Boolean(m.usageSavedAt && s.hasData);
                    return (
                      <div key={m.id} style={{ display: "grid", gridTemplateColumns: productionOnlyMode ? "1fr 1fr auto" : "1fr 1fr auto", gap: 8, alignItems: "end", padding: "10px 12px", background: !productionOnlyMode && i === usageMeterIdx ? `${C.gold}14` : C.g100, borderRadius: 8, border: `1px solid ${!productionOnlyMode && i === usageMeterIdx ? C.gold : saved ? C.green : C.g200}` }}>
                        <Field label="Meter #" value={m.meterNumber || ""} onChange={(v) => updateMeterNumber(i, v)} placeholder="12345678" />
                        <Field label="Name" value={m.name || ""} onChange={(v) => updateMeter(i, { name: v })} placeholder="Meter …" />
                        {productionOnlyMode ? (
                          <button
                            type="button"
                            disabled={meters.length <= 1}
                            onClick={() => {
                              if (meters.length <= 1) return;
                              const name = formatMeterDisplayName(m.name, m.meterNumber);
                              if (window.confirm(`Remove ${name} from this project?`)) deleteMeter(i);
                            }}
                            title="Remove meter"
                            style={{
                              paddingBottom: 6,
                              border: "none",
                              background: "transparent",
                              color: meters.length <= 1 ? C.g400 : C.red,
                              fontSize: 18,
                              fontWeight: 600,
                              cursor: meters.length <= 1 ? "default" : "pointer",
                              fontFamily: fontSans,
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        ) : (
                          <div style={{ paddingBottom: 6, textAlign: "right", fontFamily: fontSans, fontSize: 10, minWidth: 76 }}>
                            {saved ? (
                              <span style={{ color: C.green, fontWeight: 700 }}>✓ Saved<br /><span style={{ color: C.navy, fontWeight: 600 }}>{formatEnergyWithUnit(s.annual, useMwhDisplay)}</span></span>
                            ) : s.hasData ? (
                              <span style={{ color: C.gold, fontWeight: 600 }}>Draft<br />{formatEnergyWithUnit(s.annual, useMwhDisplay)}</span>
                            ) : (
                              <span style={{ color: C.g500 }}>No usage</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={meters.length >= MAX_PROJECT_METERS}
                  onClick={() => {
                    if (meters.length >= MAX_PROJECT_METERS) return;
                    setMeterCount(meters.length + 1);
                  }}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: "11px 14px",
                    background: meters.length >= MAX_PROJECT_METERS ? C.g100 : C.cream,
                    border: `1px dashed ${C.g300}`,
                    borderRadius: 8,
                    color: meters.length >= MAX_PROJECT_METERS ? C.g500 : C.navy,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: fontSans,
                    cursor: meters.length >= MAX_PROJECT_METERS ? "default" : "pointer",
                    boxSizing: "border-box",
                    opacity: meters.length >= MAX_PROJECT_METERS ? 0.75 : 1,
                  }}
                >
                  {meters.length >= MAX_PROJECT_METERS
                    ? `Maximum ${MAX_PROJECT_METERS} meters reached`
                    : "+ Add another meter"}
                </button>
              </div>
            )}

            {/* ── Customer information ── */}
            <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Customer information</h3>
                  {extracted && <span style={{ fontSize: 9, color: C.green, fontFamily: fontSans, background: `${C.green}11`, padding: "2px 6px", borderRadius: 8 }}>Extracted</span>}
                </div>
                <Field label="Customer Name" value={custName} onChange={setCustName} placeholder="Sean Simmons" />
                <Field label="Service Address" value={custAddress} onChange={setCustAddress} placeholder="2265 Monitor St, Dallas TX, 75207" wide />
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Email" value={custEmail} onChange={setCustEmail} placeholder="email@example.com" />
                  <Field label="Phone" value={custPhone} onChange={setCustPhone} placeholder="(123) 456-7890" />
                </div>
                {!productionOnlyMode && (
                  <>
                    <Field label="Account #" value={account} onChange={setAccount} placeholder="0123456789" />
                    <Field label="Utility" value={utilityName} onChange={setUtilityName} placeholder="TXU Energy" />
                  </>
                )}
                {includeUtilityBillEconomics && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Field label="Effective Rate" value={ratePerKWh} onChange={setRatePerKWh} type="number" unit="$/kWh" step={0.01} />
                    <Field label="Rate Escalation" value={rateEsc} onChange={setRateEsc} type="number" unit="%/yr" />
                  </div>
                )}
            </div>

            {/* ── Monthly usage ── */}
              {!productionOnlyMode && (() => {
                const usageMeter = multiMeterMode ? meters[usageMeterIdx] : null;
                const usageMonthly = multiMeterMode ? (usageMeter?.monthlyKWh || new Array(12).fill(null)) : monthlyKWh;
                const usageNumeric = usageMonthly.map((v) => (v == null ? 0 : Number(v)));
                const usageAnnual = usageMonthly.reduce((a, b) => a + (b == null ? 0 : Number(b)), 0);
                const usageMask = usageMonthly.map((v) => v === null);
                const usageCount = usageMonthly.filter((v) => v != null).length;
                const usageSummary = multiMeterMode ? summarizeMeterUsage(usageMeter) : null;
                const usageSaved = Boolean(usageMeter?.usageSavedAt && usageSummary?.hasData);
                const isLastUsageMeter = usageMeterIdx >= meters.length - 1;
                const nextMeterName = formatMeterDisplayName(
                  meters[usageMeterIdx + 1]?.name,
                  meters[usageMeterIdx + 1]?.meterNumber
                );
                const savedMetersCount = meters.filter((m) => m.usageSavedAt && summarizeMeterUsage(m).hasData).length;
                const canSaveMeter = usageSummary?.hasData;
                return (
              <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Monthly usage</h3>
                  </div>
                  {multiMeterMode && (
                    <span style={{ fontSize: 10, fontFamily: fontSans, color: C.g500 }}>
                      {savedMetersCount}/{meters.length} saved
                    </span>
                  )}
                </div>
                {multiMeterMode ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: C.g500, fontFamily: fontSans, marginBottom: 6 }}>
                      Select meter · {usageMeterIdx + 1} of {meters.length}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        padding: 6,
                        background: C.g100,
                        borderRadius: 8,
                        border: `1px solid ${C.g200}`,
                      }}
                    >
                      {meters.map((m, i) => {
                        const s = summarizeMeterUsage(m);
                        const saved = Boolean(m.usageSavedAt && s.hasData);
                        const draft = s.hasData && !saved;
                        const active = i === usageMeterIdx;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => selectUsageMeter(i)}
                            title={saved ? `Saved · ${formatEnergyWithUnit(s.annual, useMwhDisplay, { perYear: true })}` : draft ? "Draft" : "Not entered"}
                            style={{
                              flex: "1 1 88px",
                              minWidth: 88,
                              padding: "8px 10px",
                              border: `2px solid ${active ? C.navy : saved ? C.green : draft ? C.gold : C.g200}`,
                              borderRadius: 8,
                              background: active ? C.navy : saved ? `${C.green}18` : draft ? `${C.gold}12` : C.white,
                              color: active ? "#F8F2E8" : C.g700,
                              fontFamily: fontSans,
                              cursor: "pointer",
                              textAlign: "left",
                              boxShadow: active ? "0 1px 3px rgba(47,59,76,0.12)" : "none",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.25, marginBottom: 2 }}>{formatMeterDisplayName(m.name, m.meterNumber)}</div>
                            <div style={{ fontSize: 9, opacity: active ? 0.85 : 0.75, lineHeight: 1.2 }}>
                              {saved ? `✓ Saved · ${formatEnergyWithUnit(s.annual, useMwhDisplay)}` : draft ? `${s.filled}/12 mo · draft` : "No usage yet"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 8px 0" }}>
                    Enter 12 months of usage or extract from bill. Leave a month empty if no bill was provided.
                  </p>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {MONTHS.map((m, i) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: darkThemeActive ? C.g700 : C.g500, fontSize: 10, width: 24, fontFamily: fontSans }}>{m}</span>
                      <input
                        type="number"
                        value={usageMonthly[i] == null ? "" : usageMonthly[i]}
                        onChange={(e) => multiMeterMode ? handleManualKWhMeter(i, e.target.value, usageMeterIdx) : handleManualKWh(i, e.target.value)}
                        placeholder="—"
                        style={{
                          width: "100%",
                          padding: "6px 6px",
                          background: usageMonthly[i] != null ? C.white : C.g100,
                          border: `1px solid ${C.g200}`,
                          borderRadius: 4,
                          color: C.g700,
                          fontSize: 12,
                          outline: "none",
                          fontFamily: fontSans,
                          textAlign: "right",
                        }}
                      />
                    </div>
                  ))}
                </div>
                {usageCount > 0 && (usageAnnual > 0 || usageMask.some(Boolean)) && (
                  <div style={{ marginTop: 12 }}>
                    <BarChart
                      data={scaleEnergySeriesForDisplay(usageNumeric, useMwhDisplay)}
                      rawData={usageNumeric}
                      missingMask1={usageMask}
                      missingBarColor={darkThemeActive ? "#E85D5D" : "#D64545"}
                      labels={MONTHS}
                      color1={darkThemeActive ? C.goldLight : C.navy}
                      height={130}
                      valueUnit={useMwhDisplay ? "MWh" : "kWh"}
                      legend={[
                        {
                          label: multiMeterMode
                            ? `${formatMeterDisplayName(usageMeter?.name, usageMeter?.meterNumber)} usage (${energyUnitLabel(useMwhDisplay)})`
                            : energySeriesLegendLabel("Monthly Usage", useMwhDisplay),
                          color: darkThemeActive ? C.goldLight : C.navy,
                        },
                        ...(usageMask.some(Boolean)
                          ? [{ label: "Not provided", color: darkThemeActive ? "#E85D5D" : "#D64545" }]
                          : []),
                      ]}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <Metric label={multiMeterMode ? "Meter annual" : "Annual"} value={formatEnergyKwh(usageAnnual, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay)} color={darkThemeActive ? C.goldLight : C.navy} />
                      {includeUtilityBillEconomics && !multiMeterMode && (
                        <Metric label="Annual cost" value={`$${(annualKWh * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={C.red} />
                      )}
                      {multiMeterMode && (
                        <Metric label="Project total" value={formatEnergyKwh(annualKWhProject, useMwhDisplay)} sub={`${energyUnitLabel(useMwhDisplay)} · ${formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}`} />
                      )}
                    </div>
                  </div>
                )}
                {multiMeterMode && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.g200}` }}>
                    <button
                      type="button"
                      disabled={!canSaveMeter}
                      onClick={() => saveMeterUsageAndNext(usageMeterIdx)}
                      style={{
                        flex: 2,
                        padding: "12px 0",
                        background: canSaveMeter ? C.green : C.g300,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: fontSans,
                        cursor: canSaveMeter ? "pointer" : "default",
                      }}
                    >
                      {isLastUsageMeter ? "Save meter" : `Save meter → ${nextMeterName}`}
                    </button>
                    <button
                      type="button"
                      disabled={meters.length <= 1}
                      onClick={() => {
                        if (meters.length <= 1) return;
                        const name = usageMeter?.name || "this meter";
                        if (window.confirm(`Remove ${name} from this project?`)) deleteMeter(usageMeterIdx);
                      }}
                      style={{
                        flex: 1,
                        padding: "12px 0",
                        background: meters.length <= 1
                          ? C.g300
                          : darkThemeActive
                            ? "linear-gradient(180deg, #4A1515 0%, #2E0D0D 100%)"
                            : "linear-gradient(180deg, #E34B4B 0%, #C23232 100%)",
                        color: meters.length <= 1 ? C.g500 : "#FFECEC",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: fontSans,
                        cursor: meters.length <= 1 ? "default" : "pointer",
                      }}
                    >
                      Delete meter
                    </button>
                  </div>
                )}
              </div>
                );
              })()}

            <button onClick={() => setStep(1)} style={{
              padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.navy, color: darkThemeActive ? "#1B140D" : "#F8F2E8", border: darkThemeActive ? `1px solid ${C.g300}` : "none",
              borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans,
            }}>
              Continue to System Sizing →
            </button>
          </div>
        )}

        {/* ═══ STEP 1: SYSTEM ═══ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Region & System</h3>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.g200}` }}>
                  <span style={{ color: C.g500, fontSize: 11, fontFamily: fontSans }}>Solar region (auto)</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: darkThemeActive ? "rgba(228,190,114,0.18)" : `${C.gold}1F`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontFamily: fontSans, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, flexShrink: 0 }} />
                    {REGIONS[region]?.label || "Texas (Dallas area)"}
                  </div>
                </div>

                <div style={{ marginBottom: 10, padding: "8px 10px", background: C.g100, borderRadius: 8, border: `1px solid ${C.g200}` }}>
                  <Toggle label="NREL PVWatts (SAM) for production" checked={useNrelApi} onChange={setUseNrelApi} />
                  {useNrelApi && (
                    <>
                      <Field label="NREL API key" value={nrelApiKey} onChange={setNrelApiKey} type="password" placeholder=".env or paste key" />
                      <div style={{ marginTop: 6 }}>
                        <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: fontSans }}>Site address</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={siteAddress} onChange={e => { setSiteAddress(e.target.value); setGeocodeError(null); }} placeholder="Street, city, state ZIP" style={{ flex: 1, padding: "7px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 13, fontFamily: fontSans }} />
                          <button type="button" onClick={handleGeocode} disabled={geocodeLoading || !siteAddress?.trim()} style={{ padding: "7px 12px", background: siteAddress?.trim() && !geocodeLoading ? C.navy : C.g300, color: "#F8F2E8", border: "none", borderRadius: 5, fontSize: 12, fontFamily: fontSans, cursor: siteAddress?.trim() && !geocodeLoading ? "pointer" : "default", flexShrink: 0 }}>{geocodeLoading ? "…" : "Geocode"}</button>
                        </div>
                        {siteLat != null && siteLon != null && <div style={{ fontSize: 10, color: C.green, fontFamily: fontSans, marginTop: 3 }}>{siteLat.toFixed(4)}°, {siteLon.toFixed(4)}°</div>}
                        {geocodeError && <div style={{ fontSize: 10, color: C.red, fontFamily: fontSans, marginTop: 3 }}>{geocodeError}</div>}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ color: C.g500, fontSize: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: fontSans }}>SAM inputs</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <Field label="Tilt (°)" value={samTilt} onChange={setSamTilt} type="number" placeholder="60" />
                          <Field label="Azimuth (°)" value={samAzimuth} onChange={setSamAzimuth} type="number" placeholder="180" />
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Tracking</label>
                            <select value={samArrayType} onChange={e => setSamArrayType(Number(e.target.value))} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 12, fontFamily: fontSans }}>
                              {ARRAY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Module</label>
                            <select value={samModuleType} onChange={e => setSamModuleType(Number(e.target.value))} style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 12, fontFamily: fontSans }}>
                              {MODULE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </div>
                          <Field label="DC/AC ratio" value={samDcAcRatio} onChange={setSamDcAcRatio} type="number" placeholder="1.0" />
                          <Field label="Losses (%)" value={samLosses} onChange={setSamLosses} type="number" unit="%" placeholder="2" />
                        </div>
                      </div>
                      {samLoading && <div style={{ fontSize: 10, color: C.g500, fontFamily: fontSans, marginTop: 4 }}>Loading PVWatts…</div>}
                      {samError && <div style={{ fontSize: 10, color: C.red, fontFamily: fontSans, marginTop: 4 }}>{samError}</div>}
                      {samData && !samLoading && <div style={{ fontSize: 10, color: C.green, fontFamily: fontSans, marginTop: 4 }}>PVWatts: {Math.round(effectiveAnnualPerKW).toLocaleString()} kWh/kW·yr</div>}
                    </>
                  )}
                </div>

                <div style={{ padding: "10px", background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8 }}>
                  {multiMeterMode && (
                    <>
                      <p style={{ margin: "0 0 10px 0", fontSize: 11, color: C.g500, fontFamily: fontSans, lineHeight: 1.45 }}>
                        {productionOnlyMode
                          ? <>Set kW for each meter. Project pricing uses the <strong style={{ color: titleColor }}>combined {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}</strong> as one system.</>
                          : <>Size each meter from its own usage. Project pricing uses the <strong style={{ color: titleColor }}>combined {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}</strong> as one system.</>}
                      </p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        {meters.map((m, i) => (
                          <button key={m.id} type="button" onClick={() => setActiveMeterIdx(i)} style={{
                            border: `1px solid ${i === activeMeterIdx ? C.navy : C.g200}`,
                            background: i === activeMeterIdx ? C.navy : C.white,
                            color: i === activeMeterIdx ? "#F8F2E8" : C.g700,
                            borderRadius: 14, padding: "5px 11px", fontFamily: fontSans, fontSize: 11, cursor: "pointer",
                          }}>
                            {formatMeterDisplayName(m.name, m.meterNumber)}
                            <span style={{ opacity: 0.85, marginLeft: 5 }}>{formatSystemWithUnit(meterBundles[i]?.effectiveSize || 0, useMwDisplay)}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      {multiMeterMode ? (() => {
                        const mb = activeMeterBundle;
                        const mSize = mb?.effectiveSize ?? SYSTEM_SIZE_STEP_KW;
                        const mAtMin = mSize <= SYSTEM_SIZE_STEP_KW + 0.001;
                        const mPlaceholder = mb?.annualKWh > 0 && effectiveAnnualPerKW > 0
                          ? (mb.optimalKw || SYSTEM_SIZE_STEP_KW).toFixed(1)
                          : String(SYSTEM_SIZE_STEP_KW);
                        return (
                          <>
                            <Field
                              label={`System size — ${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)}`}
                              value={activeMeter?.systemSizeKw ?? ""}
                              onChange={(v) => updateMeter(activeMeterIdx, { systemSizeKw: v })}
                              type="text"
                              inlineUnit="kW"
                              placeholder={mPlaceholder}
                              endSlot={
                                <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    disabled={mAtMin}
                                    onClick={() => {
                                      const next = Math.max(SYSTEM_SIZE_STEP_KW, Math.round((mSize - SYSTEM_SIZE_STEP_KW) * 10) / 10);
                                      updateMeter(activeMeterIdx, { systemSizeKw: String(next) });
                                    }}
                                    aria-label={`Subtract ${SYSTEM_SIZE_STEP_KW} kW`}
                                    style={systemSizeStepControlStyle(!mAtMin)}
                                  >−</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = Math.round((mSize + SYSTEM_SIZE_STEP_KW) * 10) / 10;
                                      updateMeter(activeMeterIdx, { systemSizeKw: String(next) });
                                    }}
                                    aria-label={`Add ${SYSTEM_SIZE_STEP_KW} kW`}
                                    style={systemSizeStepControlStyle(true)}
                                  >+</button>
                                </div>
                              }
                            />
                            <div style={{ marginTop: 2, color: C.g500, fontSize: 9, fontFamily: fontSans, lineHeight: 1.35 }}>
                              {productionOnlyMode
                                ? `Blank → ${SYSTEM_SIZE_STEP_KW} kW default · ${SYSTEM_SIZE_STEP_KW} kW steps`
                                : `Blank → ~60% offset for this meter · ${SYSTEM_SIZE_STEP_KW} kW steps`}
                            </div>
                          </>
                        );
                      })() : (
                        <>
                          <Field
                            label="System size"
                            value={systemSizeKw}
                            onChange={setSystemSizeKw}
                            type="text"
                            inlineUnit="kW"
                            placeholder={annualKWh > 0 && effectiveAnnualPerKW > 0 ? optimalSystemKw.toFixed(1) : String(SYSTEM_SIZE_STEP_KW)}
                            endSlot={
                              <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                                <button
                                  type="button"
                                  disabled={systemSizeAtMinStep}
                                  onClick={() => {
                                    const next = Math.max(SYSTEM_SIZE_STEP_KW, Math.round((effectiveSize - SYSTEM_SIZE_STEP_KW) * 10) / 10);
                                    setSystemSizeKw(String(next));
                                  }}
                                  aria-label={`Subtract ${SYSTEM_SIZE_STEP_KW} kW`}
                                  style={systemSizeStepControlStyle(!systemSizeAtMinStep)}
                                >−</button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.round((effectiveSize + SYSTEM_SIZE_STEP_KW) * 10) / 10;
                                    setSystemSizeKw(String(next));
                                  }}
                                  aria-label={`Add ${SYSTEM_SIZE_STEP_KW} kW`}
                                  style={systemSizeStepControlStyle(true)}
                                >+</button>
                              </div>
                            }
                          />
                          <div style={{ marginTop: 2, color: C.g500, fontSize: 9, fontFamily: fontSans, lineHeight: 1.35 }}>
                            Blank field → ~60% usage offset · adjust in {SYSTEM_SIZE_STEP_KW} kW steps
                          </div>
                        </>
                      )}
                    </div>
                    <div>
                      <Field
                        label="Capacity factor"
                        value={capacityFactorPct}
                        onChange={setCapacityFactorPct}
                        type="text"
                        inlineUnit="%"
                        placeholder={baseCF != null ? (baseCF * 100).toFixed(1) : "—"}
                      />
                      <div style={{ marginTop: 2, color: C.g500, fontSize: 9, fontFamily: fontSans, lineHeight: 1.35 }}>
                        {hasManualCf ? "Clear to use auto again." : `Auto: ${cfSourceSummaryText.replace(/^Source: /, "")}. Applies to all meters.`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.g200}`, flexWrap: "wrap" }}>
                    {multiMeterMode ? (
                      productionOnlyMode ? (
                        <>
                          <Metric label={`${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)} production`} value={formatEnergyKwh(activeMeterBundle?.annualProd || 0, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay, { perYear: true })} color={C.blue} highlight />
                          <Metric label={`${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)} size`} value={formatSystemKw(activeMeterBundle?.effectiveSize || SYSTEM_SIZE_STEP_KW, useMwDisplay)} sub={systemUnitLabel(useMwDisplay)} highlight />
                          <Metric label="Project total" value={formatSystemKw(effectiveSizeProject, useMwDisplay)} sub={`${systemUnitLabel(useMwDisplay)} · ${formatEnergyWithUnit(annualProd, useMwhDisplay, { perYear: true })}`} />
                        </>
                      ) : (
                        <>
                          <Metric label={`${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)} offset`} value={`${(activeMeterBundle?.offsetPct || 0).toFixed(0)}%`} sub="this meter" color={offsetChipTone(activeMeterBundle?.offsetPct || 0)} highlight />
                          <Metric label={`${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)} production`} value={formatEnergyKwh(activeMeterBundle?.annualProd || 0, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay, { perYear: true })} color={C.blue} highlight />
                          <Metric label="Project total" value={formatSystemKw(effectiveSizeProject, useMwDisplay)} sub={`${systemUnitLabel(useMwDisplay)} · ${formatEnergyWithUnit(annualProd, useMwhDisplay, { perYear: true })}`} />
                          {savingsOnlyMode && (
                            <Metric label="25-yr savings" value={`$${Math.round(savings25).toLocaleString()}`} sub="est. bill offset" color={C.green} highlight />
                          )}
                        </>
                      )
                    ) : (
                      <>
                        <Metric label="Offset" value={`${offsetPct.toFixed(0)}%`} sub="of annual usage" color={offsetChipTone(offsetPct)} highlight />
                        <Metric label="Annual production" value={formatEnergyKwh(annualProd, useMwhDisplay)} sub={energyUnitLabel(useMwhDisplay, { perYear: true })} color={C.blue} highlight />
                        {savingsOnlyMode && (
                          <Metric label="25-yr savings" value={`$${Math.round(savings25).toLocaleString()}`} sub="est. bill offset" color={C.green} highlight />
                        )}
                      </>
                    )}
                  </div>
                  {multiMeterMode && meterBundles.length > 0 && (
                    <table style={{ width: "100%", marginTop: 10, borderCollapse: "collapse", fontSize: 11, fontFamily: fontSans }}>
                      <thead>
                        <tr style={{ color: C.g500, fontSize: 9, textTransform: "uppercase" }}>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: `1px solid ${C.g200}` }}>Meter</th>
                          {!productionOnlyMode && (
                            <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: `1px solid ${C.g200}` }}>Usage/yr ({energyUnitLabel(useMwhDisplay)})</th>
                          )}
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: `1px solid ${C.g200}` }}>Size ({systemUnitLabel(useMwDisplay)})</th>
                          {!productionOnlyMode && (
                            <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: `1px solid ${C.g200}` }}>Offset</th>
                          )}
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: `1px solid ${C.g200}` }}>Production ({energyUnitLabel(useMwhDisplay)})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meterBundles.map((b) => (
                          <tr key={b.id}>
                            <td style={{ padding: "6px", borderBottom: `1px solid ${C.g200}`, color: C.g700, fontWeight: 600 }}>{formatMeterDisplayName(b.name, b.meterNumber)}</td>
                            {!productionOnlyMode && (
                              <td style={{ padding: "6px", borderBottom: `1px solid ${C.g200}`, textAlign: "right", color: C.g700 }}>{formatEnergyKwh(b.annualKWh, useMwhDisplay)}</td>
                            )}
                            <td style={{ padding: "6px", borderBottom: `1px solid ${C.g200}`, textAlign: "right", color: C.navy, fontWeight: 700 }}>{formatSystemKw(b.effectiveSize, useMwDisplay)}</td>
                            {!productionOnlyMode && (
                              <td style={{ padding: "6px", borderBottom: `1px solid ${C.g200}`, textAlign: "right", fontWeight: 700, color: offsetChipTone(b.offsetPct) }}>{b.offsetPct.toFixed(0)}%</td>
                            )}
                            <td style={{ padding: "6px", borderBottom: `1px solid ${C.g200}`, textAlign: "right", color: C.blue }}>{formatEnergyKwh(b.annualProd, useMwhDisplay)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: C.white }}>
                          <td style={{ padding: "6px", fontWeight: 700, color: titleColor }}>Project total</td>
                          {!productionOnlyMode && (
                            <td style={{ padding: "6px", textAlign: "right", fontWeight: 700 }}>{formatEnergyKwh(annualKWhProject, useMwhDisplay)}</td>
                          )}
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, color: C.navy }}>{formatSystemKw(effectiveSizeProject, useMwDisplay)}</td>
                          {!productionOnlyMode && (
                            <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, color: offsetChipTone(offsetPct) }}>{offsetPct.toFixed(0)}%</td>
                          )}
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, color: C.blue }}>{formatEnergyKwh(annualProd, useMwhDisplay)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>System Additions</h3>
                </div>
                <div
                  style={
                    optionalEquipmentOpen
                      ? { padding: 10, background: C.g100, borderRadius: 8, border: `1px solid ${C.g200}` }
                      : { padding: 0, background: "transparent", border: "none" }
                  }
                >
                  {!optionalEquipmentOpen ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        type="button"
                        onClick={openEquipmentEditor}
                        aria-label="Add battery or generator"
                        style={{
                          display: "block",
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 16px",
                          background: C.blue,
                          border: "none",
                          borderRadius: 8,
                          color: "#FFFFFF",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: fontSans,
                          cursor: "pointer",
                          textAlign: "center",
                          appearance: "none",
                          WebkitAppearance: "none",
                          boxShadow: "none",
                        }}
                      >
                        {hasOptionalAdditions ? "Edit Battery / Generator" : "+ Add Battery or Generator"}
                      </button>
                      {hasOptionalAdditions && (
                        <div
                          style={{
                            border: `1px solid ${C.g200}`,
                            background: C.g100,
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 11,
                            fontFamily: fontSans,
                            color: C.g700,
                          }}
                        >
                          {[
                            batteryEquipment.length > 0
                              ? `Battery: ${batteryEquipment.map((item) => equipmentSummaryLine(item)).join(", ")}`
                              : null,
                            generatorEquipment.length > 0
                              ? `Generator: ${generatorEquipment.map((item) => equipmentSummaryLine(item)).join(", ")}`
                              : null,
                          ].filter(Boolean).join("  ·  ")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                        {sortEquipmentForEditor(optionalEquipment)
                          .filter((item) => item.kind === "battery")
                          .map((item) => renderEquipmentEditorRow(item))}
                        <button
                          type="button"
                          onClick={() => setOptionalEquipment((prev) => [...prev, createEmptyEquipment("battery")])}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: C.blue,
                            fontSize: 11,
                            fontFamily: fontSans,
                            cursor: "pointer",
                            padding: 0,
                            textAlign: "left",
                            width: "fit-content",
                          }}
                        >
                          + Another battery
                        </button>
                        {sortEquipmentForEditor(optionalEquipment)
                          .filter((item) => item.kind === "generator")
                          .map((item) => renderEquipmentEditorRow(item))}
                        <button
                          type="button"
                          onClick={() => setOptionalEquipment((prev) => [...prev, createEmptyEquipment("generator")])}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: C.blue,
                            fontSize: 11,
                            fontFamily: fontSans,
                            cursor: "pointer",
                            padding: 0,
                            textAlign: "left",
                            width: "fit-content",
                          }}
                        >
                          + Another generator
                        </button>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.g200}`, display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={clearAllEquipment}
                          aria-label="Clear all additions"
                          style={{
                            flex: 1,
                            boxSizing: "border-box",
                            padding: "8px 14px",
                            background: "#D97777",
                            border: "none",
                            borderRadius: 6,
                            color: "#FFFFFF",
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: fontSans,
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          Clear all
                        </button>
                        <button
                          type="button"
                          onClick={saveEquipmentEditor}
                          aria-label="Save and close system additions"
                          style={{
                            flex: 1,
                            boxSizing: "border-box",
                            padding: "8px 14px",
                            background: C.green,
                            border: "none",
                            borderRadius: 6,
                            color: "#FFFFFF",
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: fontSans,
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          Save additions
                        </button>
                      </div>
                    </>
                  )}
                  <datalist id="janta-battery-presets">
                    <option value="">None</option>
                    {BATTERY_PRESETS.map((p) => (
                      <option key={p.label} value={p.label} />
                    ))}
                  </datalist>
                  <datalist id="janta-generator-presets">
                    <option value="">None</option>
                    {GENERATOR_PRESETS.map((p) => (
                      <option key={p.label} value={p.label} />
                    ))}
                  </datalist>
                </div>
              </div>

            {multiMeterMode ? (
              renderProposalPreviewShell(
                `${formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)} charts`,
                <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}` }}>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>{formatMeterDisplayName(activeMeter?.name, activeMeter?.meterNumber)}</h3>
                  <p style={{ margin: "0 0 12px 0", fontSize: 11, color: C.g500, fontFamily: fontSans }}>
                    Preview for selected meter. The PDF includes a section like this for each meter, plus project totals at the top.
                  </p>
                  {renderMeterChartsBlock(activeMeterBundle, { chartH: 175, seasonalH: 155 })}
                </div>
              )
            ) : (
              <>
                {renderProposalPreviewShell(
                  step1ProdChart.title,
                  <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}` }}>
                    <h3 style={{ margin: "0 0 14px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>
                      {step1ProdChart.title}
                    </h3>
                    <BarChart
                      {...step1ProdChart.chart}
                      missingBarColor={darkThemeActive ? "#E85D5D" : "#D64545"}
                      labels={MONTHS}
                      height={175}
                      showBarValues
                    />
                  </div>
                )}
                {renderProposalPreviewShell(
                  "Seasonal Production",
                  <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}` }}>
                    <h3 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>Seasonal Production</h3>
                    <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                      Average power (kW) by month for the {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)} system{samData ? " — from NREL PVWatts" : ""}.
                    </p>
                    <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={155} title="" useMwh={useMwhDisplay} />
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back to Bill</button>
              <button onClick={() => setStep(2)} style={{ flex: 2, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.navy, color: darkThemeActive ? "#1B140D" : "#F8F2E8", border: darkThemeActive ? `1px solid ${C.g300}` : "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Continue to Project Pricing →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: PROJECT PRICING ═══ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Project Pricing</h3>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 6, textTransform: "uppercase", fontFamily: fontSans }}>Solar price</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                  <Pill active={!pricingUseRange} onClick={() => setPricingUseRange(false)}>Single $/kW</Pill>
                  <Pill active={pricingUseRange} onClick={() => setPricingUseRange(true)}>$/kW range</Pill>
                </div>
                {pricingUseRange ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Field
                      label="Low $/kW"
                      value={pricingPerKW}
                      onChange={setPricingPerKW}
                      type="number"
                      unit="$/kW"
                      placeholder="2800"
                    />
                    <Field
                      label="High $/kW"
                      value={pricingPerKWHigh}
                      onChange={setPricingPerKWHigh}
                      type="number"
                      unit="$/kW"
                      placeholder="3200"
                    />
                  </div>
                ) : (
                  <Field
                    value={pricingPerKW}
                    onChange={setPricingPerKW}
                    type="number"
                    unit="$/kW"
                    placeholder="3000"
                  />
                )}
                {pricingUseRange && solarPriceRange && (
                  <div style={{ marginTop: 8, color: C.g500, fontSize: 11, fontFamily: fontSans }}>
                    Solar PV total: {solarGrossDisplay} · {grossPerWDisplay} · {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Credits & Incentives</h3>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, marginBottom: 4 }}>State for incentives:</div>
                <select
                  value={selState}
                  onChange={(e) => { setSelState(e.target.value); setStateManuallySet(true); }}
                  style={{
                    width: "100%", padding: "8px 10px", background: C.cream, border: `1px solid ${C.g200}`,
                    borderRadius: 5, color: C.g700, fontSize: 13, fontFamily: fontSans, outline: "none",
                  }}
                >
                  {Object.entries(STATE_INCENTIVES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, v]) => (
                    <option key={k} value={k}>{v.name}</option>
                  ))}
                </select>
                <div style={{ marginTop: 4, color: C.g500, fontSize: 10, fontFamily: fontSans }}>
                  Auto-detected from the bill or site; change here if needed.
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 4, textTransform: "uppercase", fontFamily: fontSans }}>Federal ITC (48E)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[0, 30].map((r) => (
                    <Pill
                      key={r}
                      active={r === 0 ? itcPct === 0 || itcCreditRemoved : itcPct === r && !itcCreditRemoved}
                      onClick={() => {
                        setItcPct(r);
                        clearRemovedCreditKey("itc");
                      }}
                    >
                      {r === 0 ? "None" : `${r}%`}
                    </Pill>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 4, textTransform: "uppercase", fontFamily: fontSans }}>Energy community (+10%)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <Pill
                    active={!ecOn || ecCreditRemoved}
                    onClick={() => {
                      setEcOn(false);
                      clearRemovedCreditKey("energyCommunity");
                    }}
                  >
                    None
                  </Pill>
                  <Pill
                    active={ecOn && !ecCreditRemoved}
                    onClick={() => {
                      setEcOn(true);
                      clearRemovedCreditKey("energyCommunity");
                    }}
                  >
                    +10%
                  </Pill>
                </div>
              </div>

              {(stInc.tax > 0 && grossCost > 0) || (stInc.srec && srecAmt > 0) || utilRebateAmt > 0 ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: C.g500, fontFamily: fontSans, marginBottom: 8 }}>Suggested ({stInc.name})</div>
                  {stInc.tax > 0 && grossCost > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        border: `1px solid ${C.g200}`,
                        borderRadius: 8,
                        marginBottom: 8,
                        background: removedCreditKeys.stateTax ? C.g100 : C.white,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.g700, fontFamily: fontSans, fontWeight: 600 }}>{stInc.name} tax credit ({(stInc.tax * 100).toFixed(0)}%)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontFamily: fontSans, fontWeight: 700, color: removedCreditKeys.stateTax ? C.g400 : C.green }}>
                          {removedCreditKeys.stateTax ? "—" : stateTaxCreditDisplay}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCreditItem("stateTax")}
                          style={{
                            fontSize: 11,
                            fontFamily: fontSans,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${removedCreditKeys.stateTax ? C.blue : C.g200}`,
                            background: C.white,
                            color: removedCreditKeys.stateTax ? C.blue : C.g700,
                            cursor: "pointer",
                          }}
                        >
                          {removedCreditKeys.stateTax ? "Add" : "Remove"}
                        </button>
                      </div>
                    </div>
                  )}
                  {stInc.srec && srecAmt > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        border: `1px solid ${C.g200}`,
                        borderRadius: 8,
                        marginBottom: 8,
                        background: removedCreditKeys.srec ? C.g100 : C.white,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.g700, fontFamily: fontSans, fontWeight: 600 }}>{stInc.srec.label || "SREC"} ({stInc.srec.years} yr)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontFamily: fontSans, fontWeight: 700, color: removedCreditKeys.srec ? C.g400 : C.green }}>
                          {removedCreditKeys.srec ? "—" : `$${Math.round(srecAmt).toLocaleString()}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCreditItem("srec")}
                          style={{
                            fontSize: 11,
                            fontFamily: fontSans,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${removedCreditKeys.srec ? C.blue : C.g200}`,
                            background: C.white,
                            color: removedCreditKeys.srec ? C.blue : C.g700,
                            cursor: "pointer",
                          }}
                        >
                          {removedCreditKeys.srec ? "Add" : "Remove"}
                        </button>
                      </div>
                    </div>
                  )}
                  {utilRebateAmt > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        border: `1px solid ${C.g200}`,
                        borderRadius: 8,
                        marginBottom: 8,
                        background: removedCreditKeys.utility ? C.g100 : C.white,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.g700, fontFamily: fontSans, fontWeight: 600 }}>{utilRebateLabel || "Utility rebate"}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontFamily: fontSans, fontWeight: 700, color: removedCreditKeys.utility ? C.g400 : C.green }}>
                          {removedCreditKeys.utility ? "—" : `$${Math.round(utilRebateAmt).toLocaleString()}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCreditItem("utility")}
                          style={{
                            fontSize: 11,
                            fontFamily: fontSans,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${removedCreditKeys.utility ? C.blue : C.g200}`,
                            background: C.white,
                            color: removedCreditKeys.utility ? C.blue : C.g700,
                            cursor: "pointer",
                          }}
                        >
                          {removedCreditKeys.utility ? "Add" : "Remove"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {extraCredits.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: C.g500, fontFamily: fontSans, marginBottom: 8 }}>Custom</div>
                  {extraCredits.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        border: `1px solid ${C.g200}`,
                        borderRadius: 8,
                        marginBottom: 8,
                        background: C.white,
                      }}
                    >
                      <span style={{ fontSize: 12, color: C.g700, fontFamily: fontSans, fontWeight: 600 }}>{c.name || "Credit"}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontFamily: fontSans, fontWeight: 700, color: C.green }}>${Math.round(c.amount || 0).toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => removeCreditItem(`extra:${c.id}`)}
                          style={{
                            fontSize: 11,
                            fontFamily: fontSans,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: `1px solid ${C.g200}`,
                            background: C.white,
                            color: C.g700,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "end",
                  marginBottom: 8,
                }}
              >
                <Field label="Add credit (name)" value={extraCreditName} onChange={setExtraCreditName} placeholder="e.g. County grant" shrink />
                <Field label="Amount" value={extraCreditAmt} onChange={setExtraCreditAmt} type="number" unit="$" shrink />
                <button
                  type="button"
                  onClick={addExtraCredit}
                  disabled={!extraCreditName.trim() || !(parseFloat(extraCreditAmt) > 0)}
                  aria-label="Add credit"
                  title="Add credit"
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${C.g200}`,
                    background: extraCreditName.trim() && parseFloat(extraCreditAmt) > 0 ? C.blue : C.g300,
                    color: "#F8F2E8",
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: 0,
                    cursor: extraCreditName.trim() && parseFloat(extraCreditAmt) > 0 ? "pointer" : "default",
                    fontFamily: fontSans,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: extraCreditName.trim() && parseFloat(extraCreditAmt) > 0 ? 1 : 0.5,
                  }}
                >
                  +
                </button>
              </div>
              {Object.keys(removedCreditKeys).length > 0 && (
                <button type="button" onClick={restoreAllAutoCredits} style={{ background: "transparent", border: "none", color: C.blue, fontSize: 11, fontFamily: fontSans, cursor: "pointer", padding: 0 }}>
                  Restore all suggested credits
                </button>
              )}
            </div>

            {renderSystemCostsSection(false)}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back to System</button>
              <button onClick={() => setStep(3)} style={{ flex: 2, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.navy, color: darkThemeActive ? "#1B140D" : "#F8F2E8", border: darkThemeActive ? `1px solid ${C.g300}` : "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Continue to Project Financials →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: PROJECT FINANCIALS ═══ */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>Project financials</h3>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
                <Toggle label="Include on proposal" checked={includeFinancialsInProposal} onChange={setIncludeFinancialsInProposal} />
                <Toggle label="Capital less saved land" checked={includeCapitalLessSavedLand} onChange={setIncludeCapitalLessSavedLand} />
              </div>
            </div>

            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Project Financials</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Price / MW" value={finPricePerMw} onChange={setFinPricePerMw} type="number" unit="$" disabled />
                <Field
                  label="Assumed Incentives"
                  value={autoFinIncentivePct.toFixed(1)}
                  onChange={() => {}}
                  type="number"
                  unit="%"
                  disabled
                />
                <Field label="Maintenance ($ / MW / Year)" value={finMaintenancePerMwYear} onChange={setFinMaintenancePerMwYear} type="number" unit="$" />
                <Field label="Value of Energy Produced" value={finEnergyValuePerMWh} onChange={setFinEnergyValuePerMWh} type="number" unit="$/MWh" />
                {includeCapitalLessSavedLand && (
                  <Field
                    label="Value of Saved Land ($ / Acre)"
                    value={finSavedLandValuePerAcre}
                    onChange={(v) => { setFinSavedLandValuePerAcre(v); setFinSavedLandValueAuto(false); setFinSavedLandValueSource("Manual override"); }}
                    type="number"
                    unit="$"
                  />
                )}
              </div>
              {includeCapitalLessSavedLand && (
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center", color: C.g500, fontSize: 11, fontFamily: fontSans }}>
                  <span>{finSavedLandValueSource}</span>
                  <button
                    type="button"
                    onClick={() => setFinSavedLandValueAuto(true)}
                    style={{ border: "none", background: "transparent", color: C.blue, fontSize: 11, fontFamily: fontSans, cursor: "pointer", padding: 0 }}
                  >
                    Re-auto estimate
                  </button>
                </div>
              )}
            </div>

            {includeFinancialsInProposal && renderProposalPreviewShell(
                "Project Financials",
                <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: titleColor }}>Project Financials</h3>
                  <div style={{ overflowX: "auto", border: `1px solid ${C.g200}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fontSans, minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: darkThemeActive ? "#211A14" : "#F1F5FB" }}>
                        <th style={{ textAlign: "left", padding: "7px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Value of Energy Produced ($/MWh)</th>
                        {finScenarios.map((s) => (
                          <th key={`h-${s.price}`} style={{ textAlign: "right", padding: "7px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{s.price.toFixed(1)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: darkThemeActive ? "#18120E" : "#F9FBFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#E3D7C8" : C.g700 }}>Annual Revenue</td>
                        {finScenarios.map((s) => <td key={`ar-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy }}>{finFmtInt(s.annualRevenue)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#E3D7C8" : C.g700 }}>Annual Maintenance Costs</td>
                        {finScenarios.map((s) => <td key={`am-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy }}>{finFmtInt(finAnnualMaintenance)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#1A271F" : "#EEF7EE" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#D9F2E3" : C.navy, fontWeight: 700 }}>Annual Profit</td>
                        {finScenarios.map((s) => <td key={`ap-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#D9F2E3" : C.navy, fontWeight: 700 }}>{finFmtInt(s.annualProfit)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#1F2E24" : "#E8F1E8" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#D9F2E3" : C.navy, fontWeight: 700 }}>Lifetime Profit</td>
                        {finScenarios.map((s) => <td key={`lp-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#D9F2E3" : C.navy, fontWeight: 700 }}>{finFmtInt(s.lifetimeProfit)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#1A1714" : "#F7F7F7" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#E3D7C8" : C.g700, paddingTop: 10 }}>Developer Capital Investment</td>
                        {finScenarios.map((s) => <td key={`dc-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, paddingTop: 10 }}>{finFmtInt(finDeveloperCapitalCost)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Years to Breakeven</td>
                        {finScenarios.map((s) => <td key={`yb-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtYears(s.yearsToBreakeven)}</td>)}
                      </tr>
                      <tr style={{ background: darkThemeActive ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Annual ROI %</td>
                        {finScenarios.map((s) => <td key={`ro-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtPct(s.annualRoiPct)}</td>)}
                      </tr>
                      {includeCapitalLessSavedLand && (
                        <>
                          <tr style={{ background: darkThemeActive ? "#1A1714" : "#F7F7F7" }}>
                            <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#E3D7C8" : C.g700, paddingTop: 10 }}>Capital Invest Less Value of Saved Land</td>
                            {finScenarios.map((s) => <td key={`cl-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, paddingTop: 10 }}>{finFmtInt(finCapitalLessSavedLand)}</td>)}
                          </tr>
                          <tr style={{ background: darkThemeActive ? "#14100D" : "#FFFFFF" }}>
                            <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Years to Breakeven</td>
                            {finScenarios.map((s) => <td key={`y2-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtYears(s.yearsToBreakevenLessLand)}</td>)}
                          </tr>
                          <tr style={{ background: darkThemeActive ? "#14100D" : "#FFFFFF" }}>
                            <td style={{ padding: "6px 8px", color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Annual ROI %</td>
                            {finScenarios.map((s) => <td key={`r2-${s.price}`} style={{ ...finProposalCell, color: darkThemeActive ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtPct(s.annualRoiPctLessLand)}</td>)}
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back</button>
              <button onClick={() => setStep(4)} style={{ flex: 2, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.navy, color: darkThemeActive ? "#1B140D" : "#F8F2E8", border: darkThemeActive ? `1px solid ${C.g300}` : "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Continue to Shadow Analysis →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: SHADOW ═══ */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 700, color: titleColor }}>Obstacle Parameters</h3>
                <Field label="Obstacle Height" value={obstH} onChange={setObstH} type="number" unit="meters" />
                <Field label="Distance to Panels" value={obstD} onChange={setObstD} type="number" unit="meters" />
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Month: {MONTHS[shMonth]}</label>
                  <input type="range" min={0} max={11} value={shMonth} onChange={e => setShMonth(+e.target.value)} style={{ width: "100%", accentColor: C.navy }} />
                </div>
                <div>
                  <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Hour: {shHour}:00</label>
                  <input type="range" min={5} max={20} value={shHour} onChange={e => setShHour(+e.target.value)} style={{ width: "100%", accentColor: C.navy }} />
                </div>
              </div>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 700, color: titleColor }}>Daily Shading — {MONTHS[shMonth]}</h3>
                <div style={{ display: "flex", gap: 3, marginBottom: 14, flexWrap: "wrap" }}>
                  {hourly.map((h, i) => (
                    <div key={i} style={{
                      flex: 1, minWidth: 26, textAlign: "center", padding: "5px 1px", borderRadius: 4,
                      background: h.alt <= 0 ? C.g100 : h.shaded ? "#FDE8E8" : "#E8F5EC",
                      border: `1px solid ${h.alt <= 0 ? C.g200 : h.shaded ? "#F5C4C4" : "#B8E0C4"}`,
                    }}>
                      <div style={{ fontSize: 7, color: C.g500, fontFamily: fontSans }}>{h.h}h</div>
                      <div style={{ fontSize: 12, marginTop: 1 }}>{h.alt <= 0 ? "·" : h.shaded ? "◐" : "○"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Metric label="Sun Altitude" value={shData.alt > 0 ? `${shData.alt.toFixed(0)}°` : "—"} color={C.gold} />
                  <Metric label="Shadow Length" value={shData.shadow < 200 ? `${shData.shadow.toFixed(1)}m` : "—"} color={shData.shaded ? C.red : C.green} />
                  <Metric label="Shaded Hrs" value={`${shadedH}/${dayH}`} color={shadedH > 2 ? C.red : C.green} />
                  <Metric label="Loss" value={`${shadeLoss.toFixed(0)}%`} color={shadeLoss > 15 ? C.red : C.green} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(3)} style={{ flex: 1, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back</button>
              <button onClick={() => setStep(5)} style={{ flex: 2, padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.navy, color: darkThemeActive ? "#1B140D" : "#F8F2E8", border: darkThemeActive ? `1px solid ${C.g300}` : "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Generate Proposal →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 5: PROPOSAL ═══ */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(() => {
              const compactFirstPageBundle = true;
              const compactSecondPageBundle = includeFinancialsInProposal && includeRoiMetrics;
              const compactPageTwoFlow = !startPermissionsOnNewPage;
              const compactPageTwoCosts = compactSecondPageBundle || compactPageTwoFlow;
              const compact25yrPdf = compactSecondPageBundle || compactPageTwoFlow;
              const coverPad = compactFirstPageBundle ? 16 : 22;
              const firstPageSectionPad = compactFirstPageBundle ? 14 : 18;
              const comparativeChartH = compactFirstPageBundle ? 185 : 220;
              const seasonalChartH = compactFirstPageBundle ? 132 : 155;
              return (
                <>
            <div style={{ background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: titleColor }}>PDF layout</h3>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
                <Toggle label="Show page breaks" checked={showProposalPageBreaks} onChange={setShowProposalPageBreaks} />
                <Toggle
                  label="Permissions on new page"
                  checked={startPermissionsOnNewPage || includeFinancialsInProposal}
                  onChange={setStartPermissionsOnNewPage}
                  disabled={includeFinancialsInProposal}
                />
              </div>
              {includeFinancialsInProposal && (
                <p style={{ color: C.g500, fontSize: 10, fontFamily: fontSans, margin: "8px 0 0 0", lineHeight: 1.45 }}>
                  Permissions starts on page 3 while Project Financials is included.
                </p>
              )}
            </div>
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ position: "relative" }}>
            <div ref={proposalPdfRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Cover */}
            <div style={{ background: C.navy, borderRadius: 10, padding: coverPad, color: proposalScreenDark ? "#F8F2E8" : C.white, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ height: 50, marginBottom: 6, paddingLeft: 0, paddingTop: 0, overflow: "hidden" }}>
                    <img
                      crossOrigin="anonymous"
                      src={jantaPublicAssetUrl("/assets/janta-logo-cropped.svg")}
                      alt="Janta Power"
                      style={{
                        height: 54,
                        width: "auto",
                        display: "block",
                        objectFit: "contain",
                        objectPosition: "left top",
                        transform: "translate(-6px, -6px)",
                      }}
                    />
                  </div>
                  <h2 style={{ margin: "0 0 4px 0", fontSize: 26, fontWeight: 700, color: proposalScreenDark ? "#F8F2E8" : undefined }}>{custAddress || "Solar"} Proposal</h2>
                  {multiMeterMode && (
                    <p style={{ margin: "0 0 4px 0", color: C.gold, fontSize: 12, fontFamily: fontSans, fontWeight: 600 }}>
                      {meters.length} meters · {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)} combined
                    </p>
                  )}
                  <p style={{ margin: 0, color: proposalScreenDark ? "#D5C7B7" : "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: fontSans }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, fontFamily: fontSans }}>
                  <div style={{ color: proposalScreenDark ? "#C3B39F" : "rgba(255,255,255,0.45)", marginBottom: 4 }}>Prepared For:</div>
                  <div style={{ fontWeight: 600, color: proposalScreenDark ? "#F8F2E8" : undefined }}>{custName || "—"}</div>
                  <div style={{ color: proposalScreenDark ? "#D9CDBF" : "rgba(255,255,255,0.6)" }}>{custEmail}</div>
                  <div style={{ color: proposalScreenDark ? "#D9CDBF" : "rgba(255,255,255,0.6)" }}>{custPhone}</div>
                  <div style={{ color: proposalScreenDark ? "#C3B39F" : "rgba(255,255,255,0.45)", marginTop: 10, marginBottom: 4 }}>Prepared By:</div>
                  <div style={{ fontWeight: 600, color: proposalScreenDark ? "#F8F2E8" : undefined }}>{prepBy}</div>
                  <div style={{ color: proposalScreenDark ? "#D9CDBF" : "rgba(255,255,255,0.6)" }}>{prepEmail}</div>
                  <div style={{ color: proposalScreenDark ? "#D9CDBF" : "rgba(255,255,255,0.6)" }}>{prepPhone}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
                {[[formatSystemWithUnit(effectiveSizeProject, useMwDisplay), multiMeterMode ? "Total System Size" : "System Size"], ["25+ Yrs", "Lifespan"], [formatArea(landReq), "Land Required"], [formatArea(landCons), "Land Conserved"]].map(([v, l]) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{v}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: fontSans, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {(() => {
              const pdfMeterPad = compactFirstPageBundle ? 10 : 12;
              const renderPdfMeterPage = (bundle, mi, { chartH, seasonalH, pairPage = false, firstPageMeter = false }) => (
                <div
                  key={bundle.id}
                  style={{
                    background: C.white,
                    borderRadius: 10,
                    padding: pdfMeterPad,
                    border: `1px solid ${C.g200}`,
                  }}
                >
                  <h3 style={{ margin: "0 0 4px 0", fontSize: firstPageMeter ? 14 : pairPage ? 15 : compactFirstPageBundle ? 16 : 18, fontWeight: 700, color: titleColor }}>
                    {formatMeterDisplayName(bundle.name, bundle.meterNumber)}
                    {bundle.account ? <span style={{ fontWeight: 400, color: C.g500, fontSize: 11 }}> · Acct …{String(bundle.account).slice(-4)}</span> : null}
                  </h3>
                  <p style={{ margin: "0 0 6px 0", fontSize: 10, color: C.g500, fontFamily: fontSans }}>
                    Meter {mi + 1} of {meterBundles.length} — {productionOnlyMode ? "individual production" : "individual production and usage"}
                  </p>
                  {renderMeterChartsBlock(bundle, {
                    chartH,
                    seasonalH,
                    compact: true,
                    forPdf: true,
                    pairPage: pairPage || firstPageMeter,
                    firstPageMeter,
                  })}
                </div>
              );
              const pairChartH = compactFirstPageBundle ? 110 : 120;
              const pairSeasonalH = compactFirstPageBundle ? 100 : 112;
              const firstChartH = compactFirstPageBundle ? 82 : 92;
              const firstSeasonalH = compactFirstPageBundle ? 96 : 108;
              const overviewRowPad = multiMeterMode && compactFirstPageBundle ? "7px 10px" : "10px 12px";
              const overviewIntroMb = multiMeterMode && compactFirstPageBundle ? 6 : 10;
              const overviewTitleMb = multiMeterMode && compactFirstPageBundle ? 6 : compactFirstPageBundle ? 10 : 14;

              const projectOverviewBlock = (
                <div style={{ background: C.white, borderRadius: 10, padding: firstPageSectionPad, border: `1px solid ${C.g200}` }}>
                  <h3 style={{ margin: `0 0 ${overviewTitleMb}px 0`, fontSize: compactFirstPageBundle ? 16 : 18, fontWeight: 700, color: titleColor }}>
                    {multiMeterMode
                      ? (productionOnlyMode ? "Project Production (All Meters Combined)" : "Project Overview (All Meters Combined)")
                      : proposalFinancialSectionTitle}
                  </h3>
                  {multiMeterMode && (
                    <p style={{ margin: `0 0 ${overviewIntroMb}px 0`, fontSize: 10, color: C.g500, fontFamily: fontSans, lineHeight: 1.4 }}>
                      {productionOnlyMode
                        ? `Combined ${formatSystemWithUnit(effectiveSizeProject, useMwDisplay)} across ${meters.length} meters. Production figures only — no utility bill analysis.`
                        : `One combined system (${formatSystemWithUnit(effectiveSizeProject, useMwDisplay)}). Pricing and incentives apply to total project cost — not per meter.`}
                    </p>
                  )}
                  {[
                    ...(multiMeterMode ? [["Total System Size", `${formatSystemWithUnit(effectiveSizeProject, useMwDisplay)} (${meters.length} meters)`]] : []),
                    ...(includeUtilityBillEconomics && savingsOnlyMode ? [
                      ["25-Year Utility Savings", `$${Math.round(savings25).toLocaleString()}`],
                      ["Usage Offset", `${offsetPct.toFixed(0)}%`],
                    ] : []),
                    ...(includeRoiMetrics ? [
                      ["25-Year Utility Savings", `$${Math.round(savings25).toLocaleString()}`],
                      ['Approximate "Break-Even"', `${breakEven} Years`],
                    ] : []),
                    ["Janta Power's Capacity Factor", `${(effectiveCF * 100).toFixed(1)}%${samData ? " (NREL PVWatts)" : ""} (${(traditionalCF * 100).toFixed(1)}% for Traditional Solar)`],
                    ["Annual Energy Production", formatEnergyWithUnit(annualProd, useMwhDisplay)],
                    ...(includeRoiMetrics ? [["Annual Return on Investment", `${roi.toFixed(1)}%`]] : []),
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: overviewRowPad, borderBottom: `1px solid ${C.g200}` }}>
                      <span style={{ color: C.g700, fontSize: multiMeterMode && compactFirstPageBundle ? 12 : 13 }}>{k}</span>
                      <span style={{ color: C.navy, fontSize: multiMeterMode && compactFirstPageBundle ? 12 : 13, fontWeight: 700, fontFamily: fontSans }}>{v}</span>
                    </div>
                  ))}
                  {includeUtilityBillEconomics && savingsOnlyMode && (
                    <p style={{ margin: `${overviewIntroMb}px 0 0 0`, fontSize: 9, color: C.g500, fontFamily: fontSans, lineHeight: 1.45 }}>
                      25-year utility savings are estimated cumulative bill offsets at the effective rate above (defaults to $0.12/kWh if not provided). Offset % compares production to annual usage.
                    </p>
                  )}
                  {!multiMeterMode && (
                    <div style={{ marginTop: 22 }}>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: compactFirstPageBundle ? 14 : 16, fontWeight: 700, color: titleColor }}>
                        {proposalProdChart.title}
                      </h4>
                      <BarChart
                        {...proposalProdChart.chart}
                        missingBarColor={proposalScreenDark ? "#E85D5D" : "#D64545"}
                        labels={MONTHS}
                        height={comparativeChartH}
                        showBarValues
                      />
                      <h4 style={{ margin: compactFirstPageBundle ? "14px 0 6px 0" : "18px 0 8px 0", fontSize: compactFirstPageBundle ? 14 : 16, fontWeight: 700, color: titleColor }}>
                        Seasonal Production
                      </h4>
                      <p style={{ color: C.g500, fontSize: compactFirstPageBundle ? 10 : 11, fontFamily: fontSans, margin: "0 0 10px 0" }}>
                        Average power (kW) by month for the {formatSystemWithUnit(effectiveSizeProject, useMwDisplay)} system{samData ? " — from NREL PVWatts" : ""}.
                      </p>
                      <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={seasonalChartH} title="" />
                    </div>
                  )}
                </div>
              );

              if (multiMeterMode && meterBundles.length > 0) {
                const firstMeter = meterBundles[0];
                const restMeters = meterBundles.slice(1);
                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: compactFirstPageBundle ? 8 : 10,
                        breakInside: "avoid",
                        pageBreakInside: "avoid",
                      }}
                    >
                      {projectOverviewBlock}
                      {renderPdfMeterPage(firstMeter, 0, {
                        chartH: firstChartH,
                        seasonalH: firstSeasonalH,
                        firstPageMeter: true,
                      })}
                    </div>
                    {Array.from({ length: Math.ceil(restMeters.length / 2) }, (_, pageIdx) => {
                      const pair = restMeters.slice(pageIdx * 2, pageIdx * 2 + 2);
                      return (
                        <div
                          key={`pdf-meters-page-${pageIdx}`}
                          style={{
                            breakBefore: "page",
                            pageBreakBefore: "always",
                            breakInside: "avoid",
                            pageBreakInside: "avoid",
                            display: "flex",
                            flexDirection: "column",
                            gap: compactFirstPageBundle ? 8 : 10,
                          }}
                        >
                          {pair.map((bundle, i) =>
                            renderPdfMeterPage(bundle, 1 + pageIdx * 2 + i, {
                              chartH: pairChartH,
                              seasonalH: pairSeasonalH,
                              pairPage: true,
                            })
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              }

              if (!multiMeterMode) {
                return (
                  <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>{projectOverviewBlock}</div>
                );
              }

              return null;
            })()}

            <div style={{ breakBefore: "page", pageBreakBefore: "always", breakInside: "avoid", pageBreakInside: "avoid", display: "flex", flexDirection: "column", gap: compactPageTwoCosts ? 8 : 12 }}>
              {renderSystemCostsSection(true, compactPageTwoCosts)}

            {includeFinancialsInProposal && (
              <div style={{ background: C.white, borderRadius: 10, padding: compactSecondPageBundle ? 14 : 24, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <h3 style={{ margin: compactSecondPageBundle ? "0 0 8px 0" : "0 0 12px 0", fontSize: compactSecondPageBundle ? 14 : 16, fontWeight: 700, color: titleColor }}>Project Financials</h3>
                <div style={{ overflowX: "auto", border: `1px solid ${C.g200}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compactSecondPageBundle ? 10 : 11, fontFamily: fontSans, minWidth: compactSecondPageBundle ? 680 : 760 }}>
                    <thead>
                      <tr style={{ background: proposalScreenDark ? "#211A14" : "#F1F5FB" }}>
                        <th style={{ textAlign: "left", padding: compactSecondPageBundle ? "5px 6px" : "7px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Value of Energy Produced ($/MWh)</th>
                        {finScenarios.map((s) => (
                          <th key={`ph-${s.price}`} style={{ textAlign: "right", padding: compactSecondPageBundle ? "5px 6px" : "7px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{s.price.toFixed(1)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: proposalScreenDark ? "#18120E" : "#F9FBFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#E3D7C8" : C.g700 }}>Annual Revenue</td>
                        {finScenarios.map((s) => <td key={`par-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy }}>{finFmtInt(s.annualRevenue)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#E3D7C8" : C.g700 }}>Annual Maintenance Costs</td>
                        {finScenarios.map((s) => <td key={`pam-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy }}>{finFmtInt(finAnnualMaintenance)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#1A271F" : "#EEF7EE" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#D9F2E3" : C.navy, fontWeight: 700 }}>Annual Profit</td>
                        {finScenarios.map((s) => <td key={`pap-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#D9F2E3" : C.navy, fontWeight: 700 }}>{finFmtInt(s.annualProfit)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#1F2E24" : "#E8F1E8" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#D9F2E3" : C.navy, fontWeight: 700 }}>Lifetime Profit</td>
                        {finScenarios.map((s) => <td key={`plp-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#D9F2E3" : C.navy, fontWeight: 700 }}>{finFmtInt(s.lifetimeProfit)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#1A1714" : "#F7F7F7" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#E3D7C8" : C.g700, paddingTop: 10 }}>Developer Capital Investment</td>
                        {finScenarios.map((s) => <td key={`pdc-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, paddingTop: 10 }}>{finFmtInt(finDeveloperCapitalCost)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Years to Breakeven</td>
                        {finScenarios.map((s) => <td key={`pyb-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtYears(s.yearsToBreakeven)}</td>)}
                      </tr>
                      <tr style={{ background: proposalScreenDark ? "#14100D" : "#FFFFFF" }}>
                        <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Annual ROI %</td>
                        {finScenarios.map((s) => <td key={`pro-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtPct(s.annualRoiPct)}</td>)}
                      </tr>
                      {includeCapitalLessSavedLand && (
                        <>
                          <tr style={{ background: proposalScreenDark ? "#1A1714" : "#F7F7F7" }}>
                            <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#E3D7C8" : C.g700, paddingTop: 10 }}>Capital Invest Less Value of Saved Land</td>
                            {finScenarios.map((s) => <td key={`pcl-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, paddingTop: 10 }}>{finFmtInt(finCapitalLessSavedLand)}</td>)}
                          </tr>
                          <tr style={{ background: proposalScreenDark ? "#14100D" : "#FFFFFF" }}>
                            <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Years to Breakeven</td>
                            {finScenarios.map((s) => <td key={`py2-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtYears(s.yearsToBreakevenLessLand)}</td>)}
                          </tr>
                          <tr style={{ background: proposalScreenDark ? "#14100D" : "#FFFFFF" }}>
                            <td style={{ padding: "6px 8px", color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Annual ROI %</td>
                            {finScenarios.map((s) => <td key={`pr2-${s.price}`} style={{ ...finProposalCell, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{finFmtPct(s.annualRoiPctLessLand)}</td>)}
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 25yr Table */}
            {includeRoiMetrics && (
              <div style={{ background: C.white, borderRadius: 10, padding: compact25yrPdf ? 14 : 24, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <h3 style={{ margin: compact25yrPdf ? "0 0 8px 0" : "0 0 12px 0", fontSize: compact25yrPdf ? 14 : 15, fontWeight: 700, color: titleColor }}>25-Year Projection</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact25yrPdf ? 10 : 11, fontFamily: fontSans }}>
                  <thead><tr>{["Year", "Production", "Annual Savings", "Cumulative", "Net"].map(h => (
                    <th key={h} style={{ color: C.g500, fontSize: 9, textTransform: "uppercase", padding: compact25yrPdf ? "5px 3px" : "6px 4px", textAlign: "right", borderBottom: `1px solid ${C.g200}` }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{projection
                    .filter((_, i) => (
                      compact25yrPdf
                        ? (i < 3 || i === 9 || i === 19 || i === 24)
                        : (i < 5 || i === 9 || i === 14 || i === 19 || i === 24)
                    ))
                    .map(r => (
                    <tr key={r.y} style={{ background: r.net >= 0 ? (proposalScreenDark ? "#1A271F" : "#F0FAF4") : "transparent" }}>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: C.g500 }}>{r.y}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: proposalScreenDark ? "#FFFFFF" : undefined }}>{r.prod.toLocaleString()}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: C.green }}>${r.sav.toLocaleString()}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: proposalScreenDark ? "#FFFFFF" : C.navy }}>${r.cum.toLocaleString()}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: r.net >= 0 ? C.green : C.red, fontWeight: 600 }}>{r.net >= 0 ? "+" : ""}${r.net.toLocaleString()}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            </div>

            {/* Permissions + Signature — compact when sharing page 2; roomier when own page */}
            <div
              style={{
                background: C.white,
                borderRadius: 10,
                padding: compactPageTwoFlow ? 16 : 28,
                border: `1px solid ${C.g200}`,
                ...(startPermissionsOnNewPage || includeFinancialsInProposal
                  ? { breakInside: "avoid", pageBreakInside: "avoid" }
                  : { breakInside: "auto", pageBreakInside: "auto" }),
                ...((startPermissionsOnNewPage || includeFinancialsInProposal) ? { breakBefore: "page", pageBreakBefore: "always" } : {}),
              }}
            >
              <h3 style={{ margin: compactPageTwoFlow ? "0 0 8px 0" : "0 0 12px 0", fontSize: compactPageTwoFlow ? 14 : 17, fontWeight: 700, color: titleColor }}>Permissions and Details</h3>
              <p style={{ color: C.g700, fontSize: compactPageTwoFlow ? 11 : 13, lineHeight: compactPageTwoFlow ? 1.52 : 1.72, fontFamily: fontSans, margin: compactPageTwoFlow ? "0 0 9px 0" : "0 0 16px 0" }}>
                For this project, we will obtain all required permits from both municipal agencies and the utility company. The building permit ensures the installation meets code and does not impact surrounding structures. The utility permit, known as an interconnection permit, grants permission to connect your system to the grid and confirms the system is safe and code-compliant. Our solar towers are designed to meet all current local, state, and national regulations.
              </p>
              <div style={{ background: C.g100, borderRadius: 8, padding: compactPageTwoFlow ? 10 : 16, border: `1px solid ${C.g200}`, marginBottom: compactPageTwoFlow ? 11 : 22, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <div style={{ color: C.g500, fontSize: compactPageTwoFlow ? 9 : 11, textTransform: "uppercase", fontFamily: fontSans, marginBottom: compactPageTwoFlow ? 4 : 5 }}>Site Overview</div>
                <p style={{ color: C.g700, fontSize: compactPageTwoFlow ? 11 : 13, lineHeight: compactPageTwoFlow ? 1.45 : 1.65, fontFamily: fontSans, margin: 0 }}>
                  To complete the design and validate final output potential, we recommend a follow-up site inspection to assess soil conditions (for ground-mounted units), accessibility, electrical interconnection points, and regional weather patterns.
                </p>
              </div>

              <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                <h3 style={{ fontSize: compactPageTwoFlow ? 17 : 24, fontWeight: 400, color: titleColor, margin: compactPageTwoFlow ? "0 0 7px 0" : "0 0 12px 0" }}>Customer Approval:</h3>
                <p style={{ color: C.g700, fontSize: compactPageTwoFlow ? 11 : 13, fontFamily: fontSans, marginBottom: compactPageTwoFlow ? 10 : 22, lineHeight: compactPageTwoFlow ? 1.48 : 1.65 }}>
                  Once you've reviewed the terms above, sign this proposal to indicate your approval. An installation contract will then be created and sent to you for final approval and signature.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: compactPageTwoFlow ? 18 : 36 }}>
                  <div>
                    <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: compactPageTwoFlow ? 11 : 13, fontWeight: 700, marginBottom: compactPageTwoFlow ? 3 : 5 }}>Signature:</div>
                    <div style={{ borderBottom: `1px solid ${C.g300}`, height: compactPageTwoFlow ? 28 : 40, marginBottom: compactPageTwoFlow ? 5 : 7, display: "flex", alignItems: "flex-end" }}>
                      <img
                        src={jantaPublicAssetUrl("/assets/adam-boudissa-signature-new.png")}
                        alt="Adam Boudissa signature"
                        style={{
                          maxHeight: compactPageTwoFlow ? 24 : 34,
                          width: "auto",
                          objectFit: "contain",
                          imageRendering: "auto",
                          WebkitFontSmoothing: "antialiased",
                          filter: proposalScreenDark ? "none" : "invert(1)",
                          mixBlendMode: "normal",
                          background: "transparent",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: compactPageTwoFlow ? 11 : 13, fontFamily: fontSans, color: C.g700 }}>Janta Power</div>
                    <div style={{ fontSize: compactPageTwoFlow ? 11 : 13, fontFamily: fontSans, color: C.g700 }}>Adam Boudissa, Finance Officer</div>
                  </div>
                  <div>
                    <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: compactPageTwoFlow ? 11 : 13, fontWeight: 700, marginBottom: compactPageTwoFlow ? 3 : 5 }}>Signature:</div>
                    <div style={{ borderBottom: `1px solid ${C.g300}`, height: compactPageTwoFlow ? 28 : 40, marginBottom: compactPageTwoFlow ? 5 : 7 }} />
                    <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: compactPageTwoFlow ? 11 : 13, fontWeight: 700, marginBottom: compactPageTwoFlow ? 3 : 5 }}>Printed Name:</div>
                    <div style={{ borderBottom: `1px solid ${C.g300}`, height: compactPageTwoFlow ? 28 : 40 }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", color: C.g500, fontSize: 11, fontFamily: fontSans, padding: "4px 0 16px 0" }}>
              Empowering the Future of Sustainable Energy — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            </div>
            {!pdfExporting && showProposalPageBreaks && proposalBreakGuides.length > 0 && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
                {proposalBreakGuides.map((y, idx) => (
                  <div
                    key={`pb-${idx}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: y,
                      borderTop: `2px dashed ${darkThemeActive ? "rgba(232,93,93,0.78)" : "rgba(214,69,69,0.72)"}`,
                    }}
                  />
                ))}
              </div>
            )}
            </div>
            </div>
                </>
              );
            })()}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={downloadProposalPdf}
                disabled={pdfExporting}
                style={{
                  padding: "12px 0",
                  background: pdfExporting ? C.g300 : C.gold,
                  color: C.navy,
                  border: "none",
                  borderRadius: 8,
                  cursor: pdfExporting ? "default" : "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: fontSans,
                }}
              >
                {pdfExporting ? "Preparing PDF…" : "Download proposal as PDF"}
              </button>
              <button onClick={() => setStep(0)} style={{ padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Start New Proposal</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
