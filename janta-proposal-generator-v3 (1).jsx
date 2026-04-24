import { useState, useEffect, useMemo, useRef } from "react";

/*
 ══════════════════════════════════════════════════════════════════════
  JANTA POWER — Solar Proposal Generator
  
  Workflow: Upload/paste bill → Auto-extract customer + usage →
            SAM-calibrated system recommendation → Generate proposal
 ══════════════════════════════════════════════════════════════════════
*/

// ─── SAM-Calibrated Production Data ─────────────────────────────────
// Monthly kWh output per 1 kW-DC installed, validated against real proposals.
// When "Use NREL PVWatts API" is on, production comes from NREL's PVWatts v8 (SAM-style) instead.
const REGIONS = {
  illinois: {
    label: "Illinois",
    lat: 38.59,
    lon: -89.65,
    monthlyPerKW: [130, 140, 175, 190, 210, 215, 205, 195, 180, 165, 140, 123],
    capacityFactor: 0.231,
    traditionalCF: 0.178,
    credits: ["itc", "il_shines", "ameren_rebate"],
  },
  california: {
    label: "California",
    lat: 35.5,
    lon: -119.3,
    monthlyPerKW: [175, 185, 230, 245, 265, 270, 260, 250, 230, 210, 180, 160],
    capacityFactor: 0.275,
    traditionalCF: 0.200,
    credits: ["itc"],
  },
  texas: {
    label: "Texas",
    lat: 32.78,
    lon: -96.8,
    monthlyPerKW: [155, 165, 210, 225, 245, 250, 240, 230, 210, 190, 160, 142],
    capacityFactor: 0.259,
    traditionalCF: 0.189,
    credits: ["itc"],
  },
  arizona: {
    label: "Arizona / Southwest",
    lat: 33.45,
    lon: -112.07,
    monthlyPerKW: [190, 200, 250, 265, 290, 295, 280, 270, 250, 225, 195, 175],
    capacityFactor: 0.305,
    traditionalCF: 0.220,
    credits: ["itc"],
  },
  florida: {
    label: "Florida / Southeast",
    lat: 28.54,
    lon: -81.38,
    monthlyPerKW: [160, 170, 210, 225, 240, 235, 225, 220, 200, 180, 160, 145],
    capacityFactor: 0.238,
    traditionalCF: 0.175,
    credits: ["itc"],
  },
  northeast: {
    label: "Northeast (NY/NJ/PA)",
    lat: 40.71,
    lon: -74.0,
    monthlyPerKW: [110, 120, 160, 180, 200, 210, 205, 190, 170, 145, 115, 100],
    capacityFactor: 0.185,
    traditionalCF: 0.142,
    credits: ["itc"],
  },
  midwest: {
    label: "Midwest (OH/MN/MO)",
    lat: 39.10,
    lon: -84.5,
    monthlyPerKW: [120, 135, 170, 190, 215, 220, 210, 200, 180, 155, 125, 110],
    capacityFactor: 0.210,
    traditionalCF: 0.160,
    credits: ["itc"],
  },
};

const STATE_TO_REGION = {
  IL: "illinois",
  CA: "california",
  TX: "texas",
  AZ: "arizona",
  FL: "florida",
  NY: "northeast", NJ: "northeast", PA: "northeast", CT: "northeast", MA: "northeast", RI: "northeast", VT: "northeast", NH: "northeast", ME: "northeast",
  OH: "midwest", MI: "midwest", MN: "midwest", MO: "midwest", WI: "midwest", IA: "midwest", IN: "midwest", KS: "midwest", NE: "midwest", ND: "midwest", SD: "midwest",
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
    const stateName = Object.keys(STATE_NAME_TO_ABBR).find((s) => lower.includes(s));
    if (stateName) out.stateAbbr = STATE_NAME_TO_ABBR[stateName];
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
  return "illinois";
}

function detectStateFromLocation({ address, utilityName }) {
  const hints = parseAddressHints(address);
  if (hints.stateAbbr && STATE_INCENTIVES[hints.stateAbbr]) return hints.stateAbbr;
  const util = (utilityName || "").toLowerCase();
  if (util.includes("ameren")) return "IL";
  if (util.includes("edison") || util.includes("sce")) return "CA";
  if (util.includes("oncor") || util.includes("ercot") || util.includes("txu")) return "TX";
  return "IL";
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
  VA: { name: "Virginia", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: { perMWh: 15, years: 15 }, rebates: [], notes: "SREC market. Property tax exemption." },
  WA: { name: "Washington", tax: 0, propExempt: false, salesExempt: true, netMetering: "Yes", srec: null, rebates: [], notes: "Sales tax exemption. Net metering. No state income tax." },
  WV: { name: "West Virginia", tax: 0, propExempt: false, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Net metering. Limited incentives." },
  WI: { name: "Wisconsin", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [{ name: "Focus on Energy", type: "rebate" }], notes: "Property tax exempt. Focus on Energy rebates." },
  WY: { name: "Wyoming", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: null, rebates: [], notes: "Property tax exemption. Net metering." },
  DC: { name: "Washington D.C.", tax: 0, propExempt: true, salesExempt: false, netMetering: "Yes", srec: { perMWh: 350, years: 15, label: "DC SREC" }, rebates: [], notes: "Highest SREC value in the nation (~$350/MWh). Property tax exempt." },
};

// Default project pricing ($/kW). User-editable in Step 2.
const DEFAULT_PRICING_PER_KW = 3000;

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

// ─── System Sizing Engine ───────────────────────────────────────────
function recommendSystem(annualKWh, regionKey, annualPerKWOverride) {
  const region = REGIONS[regionKey];
  const annualPerKW =
    annualPerKWOverride != null && annualPerKWOverride > 0
      ? annualPerKWOverride
      : region.monthlyPerKW.reduce((a, b) => a + b, 0);

  const rawSize = annualKWh / annualPerKW;
  const sizes = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 120, 150, 180, 200, 250, 300];
  let recommended = sizes[0];
  for (const s of sizes) {
    if (s >= rawSize * 0.9) {
      recommended = s;
      break;
    }
    recommended = s;
  }
  const idx = sizes.indexOf(recommended);
  const options = {
    conservative: idx > 0 ? sizes[idx - 1] : sizes[0],
    recommended,
    aggressive: idx < sizes.length - 1 ? sizes[idx + 1] : sizes[sizes.length - 1],
  };
  return { rawSize, options, annualPerKW };
}

// ─── Colors ─────────────────────────────────────────────────────────
const C = {
  navy: "#2F3B4C", navyLight: "#43566D", gold: "#F3B664", goldLight: "#F7C983",
  white: "#FFFFFF", offWhite: "#F3F4F6", cream: "#F9FAFB",
  g100: "#ECEEF1", g200: "#DDE2E8", g300: "#C7CFD8", g500: "#6F8096", g700: "#354356",
  green: "#2A9D8F", red: "#F55A5A", blue: "#87A9C4",
};

// ─── Micro Components ───────────────────────────────────────────────
const fontSans = "'Inter', system-ui, -apple-system, sans-serif";
const fontSerif = "'Inter', system-ui, -apple-system, sans-serif";

function Pill({ children, active, onClick }) {
  return <button onClick={onClick} style={{
    padding: "8px 18px", borderRadius: 14, border: `1px solid ${active ? C.blue : C.g200}`,
    background: active ? C.blue : C.white, color: active ? C.white : C.g700,
    cursor: "pointer", fontSize: 12, fontFamily: fontSans, fontWeight: active ? 600 : 500,
    transition: "all 0.15s",
  }}>{children}</button>;
}

function Field({ label, value, onChange, type = "text", unit, placeholder, disabled, wide, rows }) {
  const El = rows ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 8, flex: wide ? "1 1 100%" : "1 1 auto", minWidth: wide ? "100%" : 140 }}>
      {label && <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>{label}</label>}
      <div style={{ display: "flex" }}>
        <El type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          disabled={disabled} rows={rows}
          style={{
            flex: 1, padding: rows ? 10 : "8px 10px", background: disabled ? C.g100 : C.cream,
            border: `1px solid ${C.g200}`, borderRadius: unit ? "8px 0 0 8px" : 8,
            color: C.g700, fontSize: 13, outline: "none", fontFamily: rows ? "monospace" : fontSans,
            resize: rows ? "vertical" : undefined, boxSizing: "border-box", width: "100%",
          }}
        />
        {unit && <div style={{ padding: "8px 8px", background: C.g100, color: C.g500, fontSize: 11, borderRadius: "0 8px 8px 0", border: `1px solid ${C.g200}`, borderLeft: "none", fontFamily: fontSans, whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{unit}</div>}
      </div>
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

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 5, userSelect: "none" }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 34, height: 18, borderRadius: 9, background: checked ? C.blue : C.g300,
        position: "relative", transition: "background 0.15s", flexShrink: 0,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: 7, background: C.white, position: "absolute",
          top: 2, left: checked ? 18 : 2, transition: "left 0.15s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }} />
      </div>
      <span style={{ color: C.g700, fontSize: 12, fontFamily: fontSans }}>{label}</span>
    </label>
  );
}

function BarChart({ data, data2, labels, color1 = C.navy, color2 = C.gold, height = 170, legend }) {
  const max = Math.max(...data, ...(data2 || []), 1);
  const [hoverBar, setHoverBar] = useState(null); // { idx, series: 1 | 2 }
  return (
    <div style={{ position: "relative" }}>
      {hoverBar != null && (
        <div style={{
          position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
          background: hoverBar.series === 2 ? color2 : color1, color: C.white, borderRadius: 6, padding: "6px 8px",
          fontSize: 10, fontFamily: fontSans, zIndex: 2, pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{labels[hoverBar.idx]}</div>
          <div>{Math.round(Number(hoverBar.series === 2 ? (data2?.[hoverBar.idx] || 0) : (data[hoverBar.idx] || 0))).toLocaleString()} kWh</div>
        </div>
      )}
      {legend && <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
        {legend.map((l, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 4, borderRadius: 2, background: l.color }} />
          <span style={{ color: C.g500, fontSize: 10, fontFamily: fontSans }}>{l.label}</span>
        </div>)}
      </div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, position: "relative" }} onMouseLeave={() => setHoverBar(null)}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 1, alignItems: "flex-end", width: "100%", flex: 1, minHeight: 20 }}>
              <div
                onMouseEnter={() => setHoverBar({ idx: i, series: 1 })}
                style={{ flex: 1, height: `${Math.max((v / max) * 100, 1)}%`, background: color1, borderRadius: "2px 2px 0 0", transition: "height 0.3s" }}
              />
              {data2 && (
                <div
                  onMouseEnter={() => setHoverBar({ idx: i, series: 2 })}
                  style={{ flex: 1, height: `${Math.max(((data2[i] || 0) / max) * 100, 1)}%`, background: color2, borderRadius: "2px 2px 0 0", transition: "height 0.3s" }}
                />
              )}
            </div>
            <span style={{ color: C.g500, fontSize: 8, marginTop: 3, fontFamily: fontSans }}>{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Seasonal production: month (time) vs average kW — from SAM/PVWatts monthly output
function SeasonalChart({ monthlyKWh, labels = MONTHS, color = C.gold, height = 200, title }) {
  const avgKwByMonth = monthlyKWh.map((kwh, i) => (Number(kwh) || 0) / (HOURS_PER_MONTH[i] || 744));
  const maxKw = Math.max(...avgKwByMonth, 0.1);
  const [hoverIdx, setHoverIdx] = useState(null);
  const pad = { top: 20, right: 12, bottom: 28, left: 64 };
  const w = 560;
  const h = height;
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
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
          background: C.navy, color: C.white, borderRadius: 6, padding: "6px 8px",
          fontSize: 10, fontFamily: fontSans, zIndex: 2, pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontWeight: 700 }}>{labels[hoverIdx]}</div>
          <div>{Math.round(Number(monthlyKWh[hoverIdx]) || 0).toLocaleString()} kWh</div>
          <div>{avgKwByMonth[hoverIdx].toFixed(2)} avg kW</div>
        </div>
      )}
      {title && <div style={{ color: C.g700, fontSize: 12, fontWeight: 600, fontFamily: fontSans, marginBottom: 8 }}>{title}</div>}
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id="seasonalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.left} y1={pad.top + chartH - f * chartH} x2={pad.left + chartW} y2={pad.top + chartH - f * chartH} stroke={C.g200} strokeWidth={0.5} strokeDasharray="4,2" />
        ))}
        {[2, 5, 8, 11].map((i) => (
          <line key={i} x1={pad.left + (i + 0.5) * (chartW / 12)} y1={pad.top} x2={pad.left + (i + 0.5) * (chartW / 12)} y2={pad.top + chartH} stroke={C.g200} strokeWidth={0.5} strokeDasharray="4,2" />
        ))}
        {/* Y-axis label */}
        <text x={pad.left - 40} y={pad.top + chartH / 2} textAnchor="middle" fill={C.g500} fontSize={9} fontFamily={fontSans} transform={`rotate(-90 ${pad.left - 40} ${pad.top + chartH / 2})`}>Avg kW</text>
        {/* Y ticks */}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={pad.left - 12} y={pad.top + chartH - f * chartH + 3} textAnchor="end" fill={C.g500} fontSize={9} fontFamily={fontSans}>{(maxKw * f).toFixed(1)}</text>
        ))}
        {/* Area fill */}
        <path d={areaD} fill="url(#seasonalGrad)" />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} stroke={C.white} strokeWidth={1} />
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
        {/* X-axis labels */}
        {labels.map((label, i) => (
          <text key={i} x={pad.left + (i + 0.5) * (chartW / 12)} y={h - 6} textAnchor="middle" fill={C.g500} fontSize={9} fontFamily={fontSans}>{label}</text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 4, fontSize: 10, color: C.g500, fontFamily: fontSans }}>
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
export default function JantaProposal() {
  const [step, setStep] = useState(0); // 0=bill, 1=system, 2=shadow, 3=proposal

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
  const [billUploadError, setBillUploadError] = useState("");
  const [billUploadLoading, setBillUploadLoading] = useState(false);
  const billInputRef = useRef(null);
  const proposalPdfRef = useRef(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [monthlyKWh, setMonthlyKWh] = useState(new Array(12).fill(0));
  const [ratePerKWh, setRatePerKWh] = useState("0.12");
  const [rateEsc, setRateEsc] = useState("3");
  const [extracted, setExtracted] = useState(false);

  // ── Region & System ──
  const [region, setRegion] = useState("illinois");
  const [systemSize, setSystemSize] = useState(5);
  const [customSize, setCustomSize] = useState("");
  const [pricingPerKW, setPricingPerKW] = useState(String(DEFAULT_PRICING_PER_KW));

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

  // ── Credits (state-based) ──
  const [selState, setSelState] = useState("IL");
  const [stateManuallySet, setStateManuallySet] = useState(false);
  const [stateEditorOpen, setStateEditorOpen] = useState(false);
  const [itcPct, setItcPct] = useState(30); // 0, 30, 40, 50, 60 — commercial can still get ITC
  const [ecOn, setEcOn] = useState(false);
  const [extraCreditName, setExtraCreditName] = useState("");
  const [extraCreditAmt, setExtraCreditAmt] = useState("");
  const [extraCredits, setExtraCredits] = useState([]);
  const [removedCreditKeys, setRemovedCreditKeys] = useState({});

  // ── Shadow ──
  const [obstH, setObstH] = useState("8");
  const [obstD, setObstD] = useState("15");
  const [shMonth, setShMonth] = useState(6);
  const [shHour, setShHour] = useState(12);

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

  // ── Bill Extraction ──
  function handleExtract() {
    const d = extractBillData(billText);
    if (d.customerName) setCustName(d.customerName);
    if (d.address) {
      setCustAddress(d.address);
      setSiteAddress(d.address); // prefill for SAM location
    }
    if (d.email) setCustEmail(d.email);
    if (d.phone) setCustPhone(d.phone);
    if (d.account) setAccount(d.account);
    if (d.utilityName) setUtilityName(d.utilityName);
    if (d.ratePerKWh > 0) setRatePerKWh(d.ratePerKWh.toFixed(4));
    if (d.monthlyKWh.some(v => v > 0)) setMonthlyKWh([...d.monthlyKWh]);

    // Region is now auto-derived from address/zip/coords/utility hints.
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

  async function handleBillFile(file) {
    if (!file) return;
    setBillUploadError("");
    setBillUploadLoading(true);
    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractTextFromPdfFile(file);
      } else if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
        text = await file.text();
      } else {
        throw new Error("Unsupported file. Please upload a PDF or TXT file.");
      }
      if (!text || text.trim().length < 20) {
        throw new Error("Could not extract enough bill text. Try another file or paste text manually.");
      }
      setBillText(text);
      setBillFileName(file.name);
    } catch (err) {
      setBillUploadError(err?.message || "Failed to read bill file.");
    } finally {
      setBillUploadLoading(false);
    }
  }

  function clearBillFile() {
    setBillFileName("");
    setBillUploadError("");
    if (billInputRef.current) billInputRef.current.value = "";
  }

  async function downloadProposalPdf() {
    const el = proposalPdfRef.current;
    if (!el) return;
    setPdfExporting(true);
    try {
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
          html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
          pagebreak: { mode: ["css", "legacy"] },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (err) {
      window.alert(err?.message || "Could not generate PDF. Try again or use Print to PDF.");
    } finally {
      setPdfExporting(false);
    }
  }

  function handleManualKWh(idx, val) {
    const next = [...monthlyKWh];
    next[idx] = parseFloat(val) || 0;
    setMonthlyKWh(next);
  }

  // ── Computed values ──
  const annualKWh = monthlyKWh.reduce((a, b) => a + b, 0);
  const reg = REGIONS[region];
  const effectiveMonthlyPerKW = samData?.monthlyPerKW ?? reg.monthlyPerKW;
  const effectiveAnnualPerKW = samData?.annualPerKW ?? reg.monthlyPerKW.reduce((a, b) => a + b, 0);
  const effectiveCF = samData?.capacityFactor != null ? samData.capacityFactor : reg.capacityFactor;
  const sizing = recommendSystem(annualKWh, region, effectiveAnnualPerKW);
  const effectiveSize = customSize ? parseFloat(customSize) || systemSize : systemSize;
  const costPerKW = parseFloat(pricingPerKW) > 0 ? parseFloat(pricingPerKW) : DEFAULT_PRICING_PER_KW;
  const monthlyProd = effectiveMonthlyPerKW.map((m) => Math.round(m * effectiveSize));
  // Use annual-per-kW math for offset so SAM sizing and offset stay consistent.
  const annualProdRaw = effectiveAnnualPerKW * effectiveSize;
  const annualProd = Math.round(annualProdRaw);
  const requiredKwForFullOffset = effectiveAnnualPerKW > 0 ? annualKWh / effectiveAnnualPerKW : 0;
  const offsetPct = requiredKwForFullOffset > 0 ? Math.min((effectiveSize / requiredKwForFullOffset) * 100, 200) : 0;
  const rate = parseFloat(ratePerKWh) || 0.12;
  const annualSavings = Math.min(annualProd, annualKWh) * rate;
  const grossCost = effectiveSize * costPerKW;

  // Credits - auto-populated from state
  const stInc = STATE_INCENTIVES[selState] || STATE_INCENTIVES.IL;
  const itcAmt = grossCost * (itcPct / 100);
  const ecAmt = ecOn ? grossCost * 0.10 : 0;
  // State tax credit
  const stateTaxAmt = stInc.tax > 0 ? Math.min(grossCost * stInc.tax, stInc.taxCap || Infinity) : 0;
  // SREC value (upfront lump sum for residential IL Shines style, or annual for others)
  const srecAmt = stInc.srec ? (annualProd / 1000) * stInc.srec.perMWh * stInc.srec.years : 0;
  // Utility rebates
  let utilRebateAmt = 0;
  let utilRebateLabel = "";
  stInc.rebates.forEach(r => {
    if (r.perKW) { utilRebateAmt += effectiveSize * r.perKW; utilRebateLabel = r.name; }
    else if (r.perW) { utilRebateAmt += effectiveSize * 1000 * r.perW; utilRebateLabel = r.name; }
    else if (r.flat) { utilRebateAmt += r.flat; utilRebateLabel = r.name; }
    else { utilRebateLabel = r.name; }
  });
  const activeCreditItems = [
    itcPct > 0 && { key: "itc", label: `Federal ITC (${itcPct}%)`, detailLabel: `Federal ITC — Section 48E (${itcPct}%)`, amount: Math.round(itcAmt) },
    stateTaxAmt > 0 && { key: "stateTax", label: `${stInc.name} Tax Credit (${(stInc.tax * 100).toFixed(0)}%)`, detailLabel: `${stInc.name} State Tax Credit (${(stInc.tax * 100).toFixed(0)}%)`, amount: Math.round(stateTaxAmt) },
    srecAmt > 0 && { key: "srec", label: `${stInc.srec.label || "SREC"} (${stInc.srec.years}yr)`, detailLabel: `${stInc.srec.label || "SREC"} ($${stInc.srec.perMWh}/MWh × ${stInc.srec.years}yr)`, amount: Math.round(srecAmt) },
    utilRebateAmt > 0 && { key: "utility", label: utilRebateLabel || "Utility Rebate", detailLabel: utilRebateLabel || "Utility Rebate", amount: Math.round(utilRebateAmt) },
    ecOn && { key: "energyCommunity", label: "Energy Community", detailLabel: "Energy Community Bonus (10%)", amount: Math.round(ecAmt) },
    ...extraCredits.map((c) => ({ key: `extra:${c.id}`, label: c.name || "Other Credit", detailLabel: c.name || "Other Credit", amount: Math.round(c.amount || 0) })),
  ].filter(Boolean).filter((item) => !removedCreditKeys[item.key]);

  const totalCredits = activeCreditItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const netCost = grossCost - totalCredits;

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

  // 25yr projection
  const esc = parseFloat(rateEsc) || 3;
  const projection = useMemo(() => {
    const rows = [];
    let cum = 0;
    for (let y = 1; y <= 25; y++) {
      const prod = annualProd * Math.pow(0.995, y);
      const r = rate * Math.pow(1 + esc / 100, y);
      const sav = Math.min(prod, annualKWh) * r;
      cum += sav;
      rows.push({ y, prod: Math.round(prod), sav: Math.round(sav), cum: Math.round(cum), net: Math.round(cum - netCost) });
    }
    return rows;
  }, [annualProd, annualKWh, rate, esc, netCost]);

  const breakEven = projection.find(r => r.net >= 0)?.y || "25+";
  const savings25 = projection[24]?.cum || 0;
  const roi = netCost > 0 ? ((annualSavings / netCost) * 100) : 0;
  const landReq = Math.round(effectiveSize * 14.4);
  const landCons = Math.round(effectiveSize * 36);

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
    { label: "System & SAM", icon: "2" },
    { label: "Shadow Calc", icon: "3" },
    { label: "Proposal", icon: "4" },
  ];

  return (
    <div style={{ fontFamily: fontSerif, background: C.offWhite, minHeight: "100vh", maxWidth: 960, margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ background: C.navy, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: C.navy }}>J</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.white, letterSpacing: "0.04em" }}>JANTA POWER</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: fontSans }}>Proposal Generator</div>
            </div>
          </div>
          {effectiveSize > 0 && annualKWh > 0 && (
            <div style={{ color: C.gold, fontSize: 13, fontFamily: fontSans, fontWeight: 600 }}>
              {effectiveSize} kW · {offsetPct.toFixed(0)}% offset
            </div>
          )}
        </div>
        {/* Step nav */}
        <div style={{ display: "flex", gap: 4 }}>
          {steps.map((s, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              background: step === i ? C.white : step > i ? "rgba(200,168,78,0.15)" : "rgba(255,255,255,0.05)",
              color: step === i ? C.navy : step > i ? C.gold : "rgba(255,255,255,0.4)",
              borderRadius: "6px 6px 0 0", fontSize: 12, fontFamily: fontSans,
              fontWeight: step === i ? 700 : 400, transition: "all 0.15s",
            }}>
              <span style={{ display: "inline-block", width: 18, height: 18, lineHeight: "18px", borderRadius: "50%", background: step === i ? C.navy : "transparent", color: step === i ? C.white : "inherit", fontSize: 10, fontWeight: 700, textAlign: "center", marginRight: 5 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 20 }}>

        {/* ═══ STEP 0: BILL ANALYSIS ═══ */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 18, background: C.navy, borderRadius: 2 }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.navy }}>Upload or Paste Utility Bill</h3>
              </div>
              <p style={{ color: C.g500, fontSize: 12, fontFamily: fontSans, margin: "0 0 10px 0" }}>
                Drag and drop a bill PDF/TXT or paste text manually. The system will extract customer name, address, account number, usage history, and rate information automatically.
              </p>
              <input
                ref={billInputRef}
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleBillFile(e.target.files?.[0])}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleBillFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => billInputRef.current?.click()}
                style={{
                  width: "100%",
                  marginBottom: 10,
                  padding: "14px 12px",
                  background: C.cream,
                  border: `1px dashed ${C.g300}`,
                  borderRadius: 8,
                  color: C.g700,
                  fontSize: 12,
                  fontFamily: fontSans,
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                {billUploadLoading ? "Reading file..." : billFileName ? `Loaded: ${billFileName} (click to replace)` : "Drop bill file here or click to upload"}
              </div>
              {billFileName && !billUploadLoading && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={clearBillFile}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: C.g500,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: fontSans,
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    Remove file
                  </button>
                </div>
              )}
              {billUploadError && <div style={{ marginBottom: 8, color: C.red, fontSize: 11, fontFamily: fontSans }}>{billUploadError}</div>}
              <textarea value={billText} onChange={e => setBillText(e.target.value)} rows={10} placeholder={"Paste the full text content of the utility bill PDF here...\n\nSupported utilities: Ameren Illinois, Southern California Edison, and most US utilities.\n\nThe parser will extract:\n• Customer name & address\n• Monthly kWh usage\n• Rate per kWh\n• Account number"} style={{
                width: "100%", padding: 12, background: C.g100, border: `1px solid ${C.g200}`,
                borderRadius: 6, color: C.g700, fontSize: 12, fontFamily: "monospace",
                resize: "vertical", outline: "none", boxSizing: "border-box",
              }} />
              <button onClick={handleExtract} disabled={billText.length < 20} style={{
                marginTop: 10, padding: "10px 28px", background: billText.length >= 20 ? C.navy : C.g300,
                color: C.white, border: "none", borderRadius: 6, cursor: billText.length >= 20 ? "pointer" : "default",
                fontSize: 13, fontWeight: 600, fontFamily: fontSans,
              }}>
                Extract Bill Data
              </button>
            </div>

            {/* Extracted / Manual Entry */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.navy }}>Customer Information</h3>
                  {extracted && <span style={{ fontSize: 10, color: C.green, fontFamily: fontSans, background: `${C.green}11`, padding: "2px 8px", borderRadius: 10 }}>Auto-extracted</span>}
                </div>
                <Field label="Customer Name" value={custName} onChange={setCustName} placeholder="Kerry E Turk" />
                <Field label="Service Address" value={custAddress} onChange={setCustAddress} placeholder="904 Woodlake Ct, O'Fallon IL 62269" wide />
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Email" value={custEmail} onChange={setCustEmail} placeholder="email@example.com" />
                  <Field label="Phone" value={custPhone} onChange={setCustPhone} placeholder="(618) 580-7300" />
                </div>
                <Field label="Account #" value={account} onChange={setAccount} placeholder="0888071057" />
                <Field label="Utility" value={utilityName} onChange={setUtilityName} placeholder="Ameren Illinois" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Effective Rate" value={ratePerKWh} onChange={setRatePerKWh} type="number" unit="$/kWh" />
                  <Field label="Rate Escalation" value={rateEsc} onChange={setRateEsc} type="number" unit="%/yr" />
                </div>
              </div>

              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 4, height: 18, background: C.blue, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.navy }}>Monthly Usage (kWh)</h3>
                </div>
                <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 8px 0" }}>
                  {extracted && monthlyKWh.some(v => v > 0) ? "Values extracted from bill. Edit if needed." : "Enter 12 months of usage or paste bill to auto-fill."}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {MONTHS.map((m, i) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: C.g500, fontSize: 10, width: 24, fontFamily: fontSans }}>{m}</span>
                      <input type="number" value={monthlyKWh[i] || ""} onChange={e => handleManualKWh(i, e.target.value)}
                        placeholder="0" style={{
                          width: "100%", padding: "6px 6px", background: monthlyKWh[i] > 0 ? C.white : C.g100,
                          border: `1px solid ${monthlyKWh[i] > 0 ? C.g200 : C.g200}`, borderRadius: 4,
                          color: C.g700, fontSize: 12, outline: "none", fontFamily: fontSans,
                          textAlign: "right",
                        }} />
                    </div>
                  ))}
                </div>
                {annualKWh > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <BarChart
                      data={monthlyKWh.map((v) => Number(v) || 0)}
                      labels={MONTHS}
                      color1={C.navy}
                      height={130}
                      legend={[{ label: "Monthly Usage (kWh)", color: C.navy }]}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <Metric label="Annual" value={annualKWh.toLocaleString()} sub="kWh" color={C.navy} />
                      <Metric label="Monthly Avg" value={Math.round(annualKWh / 12).toLocaleString()} sub="kWh" />
                      <Metric label="Annual Cost" value={`$${(annualKWh * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={C.red} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {annualKWh > 0 && (
              <button onClick={() => setStep(1)} style={{
                padding: "12px 0", background: C.navy, color: C.white, border: "none",
                borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans,
              }}>
                Continue to System Sizing →
              </button>
            )}
          </div>
        )}

        {/* ═══ STEP 1: SYSTEM & SAM ═══ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 18, background: C.navy, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.navy }}>Region & System</h3>
                </div>
                <div style={{ marginBottom: 10, background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 10 }}>
                  <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>Solar Region (Auto-detected)</label>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 16, background: `${C.blue}22`, color: C.navy, fontFamily: fontSans, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.blue }} />
                    {REGIONS[region]?.label || "Illinois"}
                  </div>
                  <div style={{ marginTop: 6, color: C.g500, fontSize: 11, fontFamily: fontSans }}>
                    Based on service address, ZIP code, and coordinates when available.
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>
                        State (for incentives): <span style={{ color: C.navy, fontWeight: 600 }}>{selState}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStateEditorOpen((v) => !v)}
                        style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: 11, fontFamily: fontSans, padding: 0 }}
                      >
                        {stateEditorOpen ? "Hide" : "Edit"}
                      </button>
                    </div>
                    {stateEditorOpen && (
                      <>
                        <select
                          value={selState}
                          onChange={(e) => { setSelState(e.target.value); setStateManuallySet(true); }}
                          style={{
                            width: "100%", padding: "8px 10px", background: C.white, border: `1px solid ${C.g200}`,
                            borderRadius: 5, color: C.g700, fontSize: 13, fontFamily: fontSans, outline: "none",
                          }}
                        >
                          {Object.entries(STATE_INCENTIVES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, v]) => (
                            <option key={k} value={k}>{v.name}</option>
                          ))}
                        </select>
                        <div style={{ marginTop: 4, color: C.g500, fontSize: 10, fontFamily: fontSans }}>
                          Auto-detected, but editable if address details are incomplete.
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {/* NREL PVWatts (SAM-style) API + address + SAM params */}
                <div style={{ marginBottom: 10, padding: 10, background: C.g100, borderRadius: 8, border: `1px solid ${C.g200}` }}>
                  <Toggle label="Use NREL PVWatts (SAM) API for production data" checked={useNrelApi} onChange={setUseNrelApi} />
                  {useNrelApi && (
                    <>
                      <Field label="NREL API Key" value={nrelApiKey} onChange={setNrelApiKey} type="password" placeholder="Or set VITE_NREL_API_KEY in .env" />
                      <div style={{ marginTop: 8 }}>
                        <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>Site address (for SAM location)</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={siteAddress} onChange={e => { setSiteAddress(e.target.value); setGeocodeError(null); }} placeholder="e.g. 904 Woodlake Ct, O'Fallon IL 62269" style={{ flex: 1, padding: "8px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 13, fontFamily: fontSans }} />
                          <button type="button" onClick={handleGeocode} disabled={geocodeLoading || !siteAddress?.trim()} style={{ padding: "8px 14px", background: siteAddress?.trim() && !geocodeLoading ? C.navy : C.g300, color: C.white, border: "none", borderRadius: 5, fontSize: 12, fontFamily: fontSans, cursor: siteAddress?.trim() && !geocodeLoading ? "pointer" : "default" }}>{geocodeLoading ? "…" : "Use address"}</button>
                        </div>
                        {siteLat != null && siteLon != null && <div style={{ fontSize: 11, color: C.green, fontFamily: fontSans, marginTop: 4 }}>Location: {siteLat.toFixed(4)}°, {siteLon.toFixed(4)}°</div>}
                        {geocodeError && <div style={{ fontSize: 11, color: C.red, fontFamily: fontSans, marginTop: 4 }}>{geocodeError}</div>}
                      </div>
                      <div style={{ marginTop: 8, marginBottom: 4 }}>
                        <span style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>System design (match SAM)</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                        <Field label="Tilt (°)" value={samTilt} onChange={setSamTilt} type="number" placeholder="60" />
                        <Field label="Azimuth (°)" value={samAzimuth} onChange={setSamAzimuth} type="number" placeholder="180" />
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Tracking</label>
                          <select value={samArrayType} onChange={e => setSamArrayType(Number(e.target.value))} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 12, fontFamily: fontSans }}>
                            {ARRAY_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Module type</label>
                          <select value={samModuleType} onChange={e => setSamModuleType(Number(e.target.value))} style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.g200}`, borderRadius: 5, fontSize: 12, fontFamily: fontSans }}>
                            {MODULE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <Field label="DC-to-AC ratio" value={samDcAcRatio} onChange={setSamDcAcRatio} type="number" placeholder="1.0" />
                        <Field label="System losses (%)" value={samLosses} onChange={setSamLosses} type="number" unit="%" placeholder="2" />
                      </div>
                      {samLoading && <div style={{ fontSize: 11, color: C.g500, fontFamily: fontSans }}>Loading PVWatts data…</div>}
                      {samError && <div style={{ fontSize: 11, color: C.red, fontFamily: fontSans }}>{samError}</div>}
                      {samData && !samLoading && <div style={{ fontSize: 11, color: C.green, fontFamily: fontSans }}>Using NREL PVWatts: {Math.round(effectiveAnnualPerKW).toLocaleString()} kWh/kW/yr</div>}
                    </>
                  )}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Field
                    label="Project Pricing"
                    value={pricingPerKW}
                    onChange={setPricingPerKW}
                    type="number"
                    unit="$/kW"
                    placeholder="3000"
                  />
                </div>

                <div style={{ marginBottom: 10, background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ color: C.g500, fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans }}>System Summary</div>
                  <div style={{ color: C.navy, fontSize: 22, fontWeight: 700, fontFamily: fontSerif, lineHeight: 1.1 }}>
                    {effectiveSize} kW
                  </div>
                  <div style={{ marginTop: 4, color: offsetPct >= 80 ? C.green : C.gold, fontSize: 13, fontWeight: 600, fontFamily: fontSans }}>
                    Offset: {offsetPct.toFixed(0)}%
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Field
                      label="Set system size (kW)"
                      value={customSize}
                      onChange={setCustomSize}
                      type="number"
                      unit="kW"
                      placeholder={`${systemSize}`}
                    />
                    <div style={{ marginTop: -4, color: C.g500, fontSize: 10, fontFamily: fontSans }}>
                      Leave blank to use recommended selection.
                    </div>
                  </div>
                </div>

                {/* Recommendation */}
                {annualKWh > 0 && (
                  <div style={{ background: `${C.gold}0D`, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: fontSans, marginBottom: 4 }}>SAM-Based Recommendation</div>
                    <div style={{ color: C.g700, fontSize: 11, fontFamily: fontSans, marginBottom: 8, lineHeight: 1.35 }}>
                      Based on {annualKWh.toLocaleString()} kWh/yr usage and {samData ? "NREL PVWatts" : reg.label} ({Math.round(sizing.annualPerKW).toLocaleString()} kWh/kW/yr), you need <strong>{sizing.rawSize.toFixed(1)} kW</strong> for full offset.
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[
                        { label: "Conservative", size: sizing.options.conservative, desc: `${Math.round(sizing.options.conservative * sizing.annualPerKW / annualKWh * 100)}% offset` },
                        { label: "Recommended", size: sizing.options.recommended, desc: `${Math.round(sizing.options.recommended * sizing.annualPerKW / annualKWh * 100)}% offset` },
                        { label: "Aggressive", size: sizing.options.aggressive, desc: `${Math.round(sizing.options.aggressive * sizing.annualPerKW / annualKWh * 100)}% offset` },
                      ].map(opt => (
                        <button key={opt.label} onClick={() => { setSystemSize(opt.size); setCustomSize(""); }}
                          style={{
                            flex: 1, padding: "7px 6px", borderRadius: 6, cursor: "pointer",
                            border: `2px solid ${effectiveSize === opt.size ? C.navy : C.g200}`,
                            background: effectiveSize === opt.size ? C.navy : C.white,
                            color: effectiveSize === opt.size ? C.white : C.g700,
                            textAlign: "center",
                          }}>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fontSerif }}>{opt.size} kW</div>
                          <div style={{ fontSize: 8, opacity: 0.7, fontFamily: fontSans, marginTop: 1 }}>{opt.label}</div>
                          <div style={{ fontSize: 8, opacity: 0.6, fontFamily: fontSans }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 18, background: C.green, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.navy }}>Credits & Incentives</h3>
                </div>
                {/* State info box */}
                <div style={{ background: "#F0F7FF", border: "1px solid #D0E3FF", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 11, color: C.g700, fontFamily: fontSans, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: C.navy, marginBottom: 3 }}>{stInc.name} Incentives</div>
                  {stInc.notes}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    {stInc.propExempt && <span style={{ fontSize: 9, background: "#E8F5EC", color: C.green, padding: "2px 6px", borderRadius: 8 }}>Property Tax Exempt</span>}
                    {stInc.salesExempt && <span style={{ fontSize: 9, background: "#E8F5EC", color: C.green, padding: "2px 6px", borderRadius: 8 }}>Sales Tax Exempt</span>}
                    {stInc.srec && <span style={{ fontSize: 9, background: "#FFF8E8", color: "#A07C1C", padding: "2px 6px", borderRadius: 8 }}>SREC: ${stInc.srec.perMWh}/MWh</span>}
                    {stInc.tax > 0 && <span style={{ fontSize: 9, background: "#F0E8FF", color: "#6B46C1", padding: "2px 6px", borderRadius: 8 }}>State Tax Credit: {(stInc.tax*100).toFixed(0)}%</span>}
                    <span style={{ fontSize: 9, background: C.g100, color: C.g500, padding: "2px 6px", borderRadius: 8 }}>Net Metering: {stInc.netMetering}</span>
                  </div>
                </div>

                {/* ITC controls */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: "block", color: C.g500, fontSize: 10, marginBottom: 3, textTransform: "uppercase", fontFamily: fontSans }}>Federal ITC (Section 48E)</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {[0, 30].map(r => (
                        <Pill key={r} active={itcPct === r} onClick={() => setItcPct(r)}>{r === 0 ? "None" : `${r}%`}</Pill>
                      ))}
                    </div>
                  </div>
                </div>

                <Toggle label="Energy Community Bonus (+10%)" checked={ecOn} onChange={setEcOn} />

                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Field label="Other Credit" value={extraCreditName} onChange={setExtraCreditName} placeholder="Name" />
                  <Field label="Amount" value={extraCreditAmt} onChange={setExtraCreditAmt} type="number" unit="$" />
                </div>
                <button
                  type="button"
                  onClick={addExtraCredit}
                  disabled={!extraCreditName.trim() || !(parseFloat(extraCreditAmt) > 0)}
                  style={{
                    marginBottom: 8, padding: "8px 12px", background: extraCreditName.trim() && parseFloat(extraCreditAmt) > 0 ? C.navy : C.g300,
                    color: C.white, border: "none", borderRadius: 6, cursor: extraCreditName.trim() && parseFloat(extraCreditAmt) > 0 ? "pointer" : "default",
                    fontSize: 12, fontWeight: 600, fontFamily: fontSans,
                  }}
                >
                  Add Credit
                </button>
                {Object.keys(removedCreditKeys).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <button type="button" onClick={restoreAllAutoCredits} style={{ background: "transparent", border: "none", color: C.blue, fontSize: 11, fontFamily: fontSans, cursor: "pointer", padding: 0 }}>
                      Restore removed auto-credits
                    </button>
                  </div>
                )}

                {/* Summary */}
                <div style={{ background: C.g100, borderRadius: 8, padding: 12, border: `1px solid ${C.g200}` }}>
                  {[
                    ["System Cost", `$${grossCost.toLocaleString()}`, C.g700],
                    ...activeCreditItems.map((item) => [item.label, `-$${Math.round(item.amount).toLocaleString()}`, C.green, item.key, false]),
                    ...Object.keys(removedCreditKeys).map((key) => {
                      const removedLabelMap = {
                        itc: `Federal ITC (${itcPct}%)`,
                        stateTax: `${stInc.name} Tax Credit (${(stInc.tax * 100).toFixed(0)}%)`,
                        srec: `${stInc.srec?.label || "SREC"} (${stInc.srec?.years || 0}yr)`,
                        utility: utilRebateLabel || "Utility Rebate",
                        energyCommunity: "Energy Community",
                      };
                      return [removedLabelMap[key] || "Removed credit", "$0", C.g500, key, true];
                    }),
                  ].filter(Boolean).map(([k, v, c, key], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, fontFamily: fontSans }}>
                      <span style={{ color: C.g500, display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {key && (
                          <button
                            type="button"
                            onClick={() => toggleCreditItem(key)}
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              border: `1px solid ${removedCreditKeys[key] ? C.g300 : C.green}`,
                              background: removedCreditKeys[key] ? C.white : C.green,
                              cursor: "pointer",
                              padding: 0,
                              display: "inline-block",
                              opacity: removedCreditKeys[key] ? 0.45 : 0.9,
                            }}
                            title={removedCreditKeys[key] ? "Re-enable credit" : "Disable credit"}
                          />
                        )}
                        {k}
                      </span>
                      <span style={{ color: c, fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.g300}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.navy, fontWeight: 700, fontSize: 13 }}>Net Cost</span>
                    <span style={{ color: C.navy, fontWeight: 700, fontSize: 13, fontFamily: fontSans }}>${Math.round(netCost).toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.green, fontWeight: 600, fontSize: 12 }}>Total Savings</span>
                    <span style={{ color: C.green, fontWeight: 600, fontSize: 12, fontFamily: fontSans }}>${Math.round(totalCredits).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Production metrics */}
            <div style={{ display: "flex", gap: 10 }}>
              <Metric label="Janta CF" value={`${(effectiveCF * 100).toFixed(1)}%`} sub={samData ? "NREL PVWatts" : `vs ${(reg.traditionalCF * 100).toFixed(1)}% traditional`} color={C.green} highlight />
              <Metric label="Annual Production" value={annualProd.toLocaleString()} sub="kWh/yr" color={C.blue} highlight />
            </div>

            {/* Chart */}
            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: C.navy }}>Janta Power Comparative Analysis</h3>
              <BarChart data={monthlyKWh} data2={monthlyProd} labels={MONTHS}
                color1={C.navy} color2={C.gold} height={180}
                legend={[{ label: "Current Energy Usage", color: C.navy }, { label: "Janta Energy Production", color: C.gold }]} />
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.g200}` }}>
                <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={200} title="Seasonal production (time vs avg kW)" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, padding: "12px 0", background: C.white, color: C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back to Bill</button>
              <button onClick={() => setStep(2)} style={{ flex: 2, padding: "12px 0", background: C.navy, color: C.white, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Continue to Shadow Analysis →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: SHADOW ═══ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 700, color: C.navy }}>Obstacle Parameters</h3>
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
                <h3 style={{ margin: "0 0 14px 0", fontSize: 15, fontWeight: 700, color: C.navy }}>Daily Shading — {MONTHS[shMonth]}</h3>
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
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: "12px 0", background: C.white, color: C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ flex: 2, padding: "12px 0", background: C.navy, color: C.white, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: fontSans }}>Generate Proposal →</button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: PROPOSAL ═══ */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div ref={proposalPdfRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Cover */}
            <div style={{ background: C.navy, borderRadius: 10, padding: 28, color: C.white }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ position: "relative", height: 40, marginBottom: 14 }}>
                    <img
                      src="/assets/janta-logo-cropped.svg"
                      alt="Janta Power"
                      style={{
                        height: 40,
                        width: "auto",
                        display: "block",
                        objectFit: "contain",
                        position: "absolute",
                        left: 0,
                        top: -8,
                      }}
                    />
                  </div>
                  <h2 style={{ margin: "0 0 4px 0", fontSize: 26, fontWeight: 700 }}>{custAddress || "Solar"} Proposal</h2>
                  <p style={{ margin: 0, color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: fontSans }}>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, fontFamily: fontSans }}>
                  <div style={{ color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Prepared For:</div>
                  <div style={{ fontWeight: 600 }}>{custName || "—"}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)" }}>{custEmail} {custPhone}</div>
                  <div style={{ color: "rgba(255,255,255,0.45)", marginTop: 10, marginBottom: 4 }}>Prepared By:</div>
                  <div style={{ fontWeight: 600 }}>{prepBy}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)" }}>{prepEmail}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)" }}>{prepPhone}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
                {[[effectiveSize + " KW", "System Size"], ["25+ Yrs", "Lifespan"], [landReq + " Sq Ft", "Land Required"], [landCons + " Sq Ft", "Land Conserved"]].map(([v, l]) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{v}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: fontSans, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 18, fontWeight: 700, color: C.navy }}>Financial Breakdown</h3>
              {[
                ["25-Year Utility Savings", `$${(savings25 / 1000).toFixed(1)}K`],
                ['Approximate "Break-Even"', `${breakEven} Years`],
                ["Janta Power's Capacity Factor", `${(effectiveCF * 100).toFixed(1)}%${samData ? " (NREL PVWatts)" : ` (${(reg.traditionalCF * 100).toFixed(1)}% for Traditional)`}`],
                ["Annual Energy Production", `${annualProd.toLocaleString()} kWh`],
                ["Annual Return on Investment", `${roi.toFixed(1)}%`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.g200}` }}>
                  <span style={{ color: C.g700, fontSize: 13 }}>{k}</span>
                  <span style={{ color: C.navy, fontSize: 13, fontWeight: 700, fontFamily: fontSans }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <BarChart data={monthlyKWh} data2={monthlyProd} labels={MONTHS}
                  color1={C.navy} color2={C.gold} height={170}
                  legend={[{ label: "Current Energy Usage", color: C.navy }, { label: "Janta Energy Production", color: C.gold }]} />
              </div>
            </div>

            {/* Seasonal production (SAM): time vs kW */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 700, color: C.navy }}>Seasonal Production</h3>
              <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                Average power (kW) by month for the {effectiveSize} kW system{samData ? " — from NREL PVWatts (SAM)" : ""}.
              </p>
              <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={220} title="" />
            </div>

            {/* System Costs */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 16, fontWeight: 700, color: C.navy }}>System Costs</h3>

              <div style={{ background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
                  Base System Price
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 8, fontSize: 12, fontFamily: fontSans }}>
                  <div>
                    <div style={{ color: C.g500 }}>System Size</div>
                    <div style={{ color: C.navy, fontWeight: 700 }}>{effectiveSize} kW</div>
                  </div>
                  <div>
                    <div style={{ color: C.g500 }}>Price per kW</div>
                    <div style={{ color: C.navy, fontWeight: 700 }}>${Math.round(costPerKW).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: C.g500 }}>Gross Cost</div>
                    <div style={{ color: C.navy, fontWeight: 700 }}>${Math.round(grossCost).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 12 }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
                  Applied Credits & Incentives
                </div>
                {activeCreditItems.length === 0 ? (
                  <div style={{ color: C.g500, fontSize: 12, fontFamily: fontSans }}>No credits currently applied.</div>
                ) : (
                  activeCreditItems.map((item, i) => (
                    <div key={`${item.key}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < activeCreditItems.length - 1 ? `1px dashed ${C.g200}` : "none", fontSize: 12 }}>
                      <span style={{ color: C.g700 }}>{item.detailLabel}</span>
                      <span style={{ color: C.green, fontFamily: fontSans, fontWeight: 700 }}>-${Math.round(item.amount).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Gross</div>
                  <div style={{ color: C.navy, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>${Math.round(grossCost).toLocaleString()}</div>
                </div>
                <div style={{ background: "#ECF8F5", border: "1px solid #CBECE4", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Credits</div>
                  <div style={{ color: C.green, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>-${Math.round(totalCredits).toLocaleString()}</div>
                </div>
                <div style={{ background: C.navy, border: `1px solid ${C.navy}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Net Cost</div>
                  <div style={{ color: C.white, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>${Math.round(netCost).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* 25yr Table */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: C.navy }}>25-Year Projection</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fontSans }}>
                <thead><tr>{["Year", "Production", "Annual Savings", "Cumulative", "Net"].map(h => (
                  <th key={h} style={{ color: C.g500, fontSize: 9, textTransform: "uppercase", padding: "6px 4px", textAlign: "right", borderBottom: `1px solid ${C.g200}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>{projection.filter((_, i) => i < 5 || i === 9 || i === 14 || i === 19 || i === 24).map(r => (
                  <tr key={r.y} style={{ background: r.net >= 0 ? "#F0FAF4" : "transparent" }}>
                    <td style={{ padding: "5px 4px", textAlign: "right", color: C.g500 }}>{r.y}</td>
                    <td style={{ padding: "5px 4px", textAlign: "right" }}>{r.prod.toLocaleString()}</td>
                    <td style={{ padding: "5px 4px", textAlign: "right", color: C.green }}>${r.sav.toLocaleString()}</td>
                    <td style={{ padding: "5px 4px", textAlign: "right", color: C.navy }}>${r.cum.toLocaleString()}</td>
                    <td style={{ padding: "5px 4px", textAlign: "right", color: r.net >= 0 ? C.green : C.red, fontWeight: 600 }}>{r.net >= 0 ? "+" : ""}${r.net.toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {/* Permissions + Signature */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}` }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: C.navy }}>Permissions and Details</h3>
              <p style={{ color: C.g700, fontSize: 12, lineHeight: 1.7, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                For this project, we will obtain all required permits from both municipal agencies and the utility company. The building permit ensures the installation meets code and does not impact surrounding structures. The utility permit, known as an interconnection permit, grants permission to connect your system to the grid and confirms the system is safe and code-compliant. Our solar towers are designed to meet all current local, state, and national regulations.
              </p>
              <div style={{ background: C.g100, borderRadius: 8, padding: 14, border: `1px solid ${C.g200}`, marginBottom: 20 }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans, marginBottom: 4 }}>Site Overview</div>
                <p style={{ color: C.g700, fontSize: 12, lineHeight: 1.6, fontFamily: fontSans, margin: 0 }}>
                  To complete the design and validate final output potential, we recommend a follow-up site inspection to assess soil conditions (for ground-mounted units), accessibility, electrical interconnection points, and regional weather patterns.
                </p>
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 400, color: C.navy, margin: "0 0 10px 0" }}>Customer Approval:</h3>
              <p style={{ color: C.g700, fontSize: 12, fontFamily: fontSans, marginBottom: 20 }}>
                Once you've reviewed the terms above, sign this proposal to indicate your approval. An installation contract will then be created and sent to you for final approval and signature.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                <div>
                  <div style={{ color: C.navy, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Signature:</div>
                  <div style={{ borderBottom: `1px solid ${C.g300}`, height: 36, marginBottom: 6, display: "flex", alignItems: "flex-end" }}>
                    <img
                      src="/assets/adam-boudissa-signature.png"
                      alt="Adam Boudissa signature"
                      style={{
                        maxHeight: 30,
                        width: "auto",
                        objectFit: "contain",
                        imageRendering: "auto",
                        WebkitFontSmoothing: "antialiased",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, fontFamily: fontSans, color: C.g700 }}>Janta Power</div>
                  <div style={{ fontSize: 12, fontFamily: fontSans, color: C.g700 }}>Adam Boudissa, Finance Officer</div>
                </div>
                <div>
                  <div style={{ color: C.navy, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Signature:</div>
                  <div style={{ borderBottom: `1px solid ${C.g300}`, height: 36, marginBottom: 6 }} />
                  <div style={{ color: C.navy, fontSize: 12, fontWeight: 700 }}>Printed Name:</div>
                  <div style={{ borderBottom: `1px solid ${C.g300}`, height: 20 }} />
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", color: C.g500, fontSize: 11, fontFamily: fontSans, padding: "4px 0 16px 0" }}>
              Empowering the Future of Sustainable Energy — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            </div>

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
              <button onClick={() => setStep(0)} style={{ padding: "12px 0", background: C.white, color: C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Start New Proposal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
