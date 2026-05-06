import { useState, useEffect, useMemo, useRef } from "react";

/*
 ══════════════════════════════════════════════════════════════════════
  JANTA POWER — Solar Proposal Generator
  
  Workflow: Upload/paste bill → Auto-extract customer + usage →
            Set system & capacity factor → Generate proposal
 ══════════════════════════════════════════════════════════════════════
*/

// ─── Regional production curves (kWh per kW-DC per month) ───────────
// When "Use NREL PVWatts API" is on, monthly/annual values come from NREL's PVWatts v8 instead.
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
    label: "Texas (Dallas area)",
    lat: 32.7767,
    lon: -96.797,
    monthlyPerKW: [155, 165, 210, 225, 245, 250, 240, 230, 210, 190, 160, 142],
    capacityFactor: 2422 / 8760,
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

/** Janta tower increments — system kW is always an integer multiple of this value. */
const SYSTEM_SIZE_STEP_KW = 5.4;
const SQFT_PER_ACRE = 43560;
const THEME_KEY = "janta_dark_mode_v1";

function snapSystemSizeKw(kw) {
  if (!Number.isFinite(kw) || kw <= 0) return SYSTEM_SIZE_STEP_KW;
  const steps = Math.max(1, Math.round(kw / SYSTEM_SIZE_STEP_KW));
  return Math.round(steps * SYSTEM_SIZE_STEP_KW * 10) / 10;
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
};

const STATE_LAND_VALUE_PER_ACRE = {
  IL: 12000, CA: 18000, TX: 9000, AZ: 7000, FL: 11000,
  NY: 14500, NJ: 15000, PA: 12000, CT: 14000, MA: 14500, RI: 14000, VT: 9000, NH: 10000, ME: 8500,
  OH: 9000, MI: 8500, MN: 8000, MO: 7500, WI: 8000, IA: 9000, IN: 8500, KS: 6500, NE: 6000, ND: 5000, SD: 5500,
  CO: 7000, OR: 8500, WA: 12000, NC: 8500, SC: 7000, GA: 8000, VA: 9000, MD: 11500, DE: 10000,
  OK: 6000, NM: 4500, NV: 5000, ID: 6500, UT: 6000, MT: 4500, WY: 3500, AK: 2500, HI: 26000, LA: 6500, MS: 5500,
  AL: 6500, AR: 6000, KY: 6000, TN: 7000, WV: 5000, DC: 20000,
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
  return "texas";
}

function detectStateFromLocation({ address, utilityName }) {
  const hints = parseAddressHints(address);
  if (hints.stateAbbr && STATE_INCENTIVES[hints.stateAbbr]) return hints.stateAbbr;
  const util = (utilityName || "").toLowerCase();
  if (util.includes("ameren")) return "IL";
  if (util.includes("edison") || util.includes("sce")) return "CA";
  if (util.includes("oncor") || util.includes("ercot") || util.includes("txu")) return "TX";
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

function BarChart({ data, data2, labels, color1 = C.navy, color2 = C.gold, height = 170, legend, showBarValues = false }) {
  const max = Math.max(...data, ...(data2 || []), 1);
  const [hoverBar, setHoverBar] = useState(null); // { idx, series: 1 | 2 }
  return (
    <div style={{ position: "relative" }}>
      {hoverBar != null && (
        <div style={{
          position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
          background: hoverBar.series === 2 ? color2 : color1, color: "#F8F2E8", borderRadius: 6, padding: "6px 8px",
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
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, position: "relative", paddingTop: showBarValues ? 16 : 0 }} onMouseLeave={() => setHoverBar(null)}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 1, alignItems: "flex-end", width: "100%", flex: 1, minHeight: 20, paddingBottom: 2 }}>
              <div
                onMouseEnter={() => setHoverBar({ idx: i, series: 1 })}
                style={{ flex: 1, height: `${Math.max((v / max) * 100, 1)}%`, background: color1, borderRadius: "2px 2px 0 0", transition: "height 0.3s", position: "relative" }}
              >
                {showBarValues && Number(v) > 0 && (
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
                    {Math.round(Number(v)).toLocaleString()}
                  </span>
                )}
              </div>
              {data2 && (
                <div
                  onMouseEnter={() => setHoverBar({ idx: i, series: 2 })}
                  style={{ flex: 1, height: `${Math.max(((data2[i] || 0) / max) * 100, 1)}%`, background: color2, borderRadius: "2px 2px 0 0", transition: "height 0.3s", position: "relative" }}
                >
                  {showBarValues && Number(data2[i] || 0) > 0 && (
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
                      {Math.round(Number(data2[i] || 0)).toLocaleString()}
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
          background: C.navy, color: "#F8F2E8", borderRadius: 6, padding: "6px 8px",
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
        <text x={pad.left - 48} y={pad.top + chartH / 2} textAnchor="middle" fill={C.g500} fontSize={7} fontFamily={fontSans} transform={`rotate(-90 ${pad.left - 48} ${pad.top + chartH / 2})`}>Avg kW</text>
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
      <div style={{ display: "flex", justifyContent: "center", marginTop: 4, fontSize: 11, color: C.g500, fontFamily: fontSans }}>
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
export default function JantaProposal({ onOpenSettings, initialDarkMode = false, onDarkModeChange }) {
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
  const billInputRef = useRef(null);
  const proposalPdfRef = useRef(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [monthlyKWh, setMonthlyKWh] = useState(new Array(12).fill(0));
  const [ratePerKWh, setRatePerKWh] = useState("0.12");
  const [rateEsc, setRateEsc] = useState("3");
  const [productionOnlyMode, setProductionOnlyMode] = useState(false);
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
  /** Empty = auto (~60% offset); otherwise kW string, snapped to 5.4 kW steps for math. */
  const [systemSizeKw, setSystemSizeKw] = useState("");
  const [pricingPerKW, setPricingPerKW] = useState(String(DEFAULT_PRICING_PER_KW));
  const [batteryName, setBatteryName] = useState("");
  const [batteryCost, setBatteryCost] = useState("");
  const [generatorName, setGeneratorName] = useState("");
  const [generatorCost, setGeneratorCost] = useState("");
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
  const [finIncentivePct, setFinIncentivePct] = useState("30");
  const [finIncentiveAuto, setFinIncentiveAuto] = useState(true);
  const [finMaintenancePerMwYear, setFinMaintenancePerMwYear] = useState("15000");
  const [finEnergyValuePerMWh, setFinEnergyValuePerMWh] = useState("60");
  const [finSavedLandValuePerAcre, setFinSavedLandValuePerAcre] = useState("0");
  const [finSavedLandValueAuto, setFinSavedLandValueAuto] = useState(true);
  const [finSavedLandValueSource, setFinSavedLandValueSource] = useState("Manual");
  const [includeFinancialsInProposal, setIncludeFinancialsInProposal] = useState(false);
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
  Object.assign(C, darkThemeActive ? DARK_C : LIGHT_C);

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
    const pricePerKw = parseFloat(pricingPerKW) > 0 ? parseFloat(pricingPerKW) : DEFAULT_PRICING_PER_KW;
    setFinPricePerMw(String(Math.round(pricePerKw * 1000)));
  }, [pricingPerKW]);

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
    setPdfExporting(true);
    try {
      // Always export proposal PDF in light mode.
      setPdfLightMode(true);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

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
      setPdfLightMode(false);
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
  const baseMonthly = samData?.monthlyPerKW ?? reg.monthlyPerKW;
  const baseAnnualPerKW =
    samData?.annualPerKW != null
      ? samData.annualPerKW
      : baseMonthly.reduce((a, b) => a + Number(b), 0);
  const baseCF = baseAnnualPerKW > 0 ? baseAnnualPerKW / 8760 : reg.capacityFactor;
  const cfInput = parseFloat(String(capacityFactorPct).replace(/%/g, "").trim());
  const hasManualCf = String(capacityFactorPct).trim() !== "" && Number.isFinite(cfInput);
  const effectiveCF = hasManualCf ? Math.min(99.9, Math.max(0, cfInput)) / 100 : baseCF;
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
  /** Step count closest to 60% offset (may be slightly above or below 60% once snapped to 5.4 kW). */
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
  const costPerKW = parseFloat(pricingPerKW) > 0 ? parseFloat(pricingPerKW) : DEFAULT_PRICING_PER_KW;
  const batteryAdd = Math.max(0, parseFloat(String(batteryCost).replace(/,/g, "")) || 0);
  const generatorAdd = Math.max(0, parseFloat(String(generatorCost).replace(/,/g, "")) || 0);
  const solarGross = effectiveSize * costPerKW;
  const grossCost = solarGross + batteryAdd + generatorAdd;
  const monthlyProd = effectiveMonthlyPerKW.map((m) => Math.round(m * effectiveSize));
  const annualProdRaw = effectiveAnnualPerKW * effectiveSize;
  const annualProd = Math.round(annualProdRaw);
  const requiredKwForFullOffset = effectiveAnnualPerKW > 0 ? annualKWh / effectiveAnnualPerKW : 0;
  const offsetPct = requiredKwForFullOffset > 0 ? Math.min((effectiveSize / requiredKwForFullOffset) * 100, 200) : 0;
  const offsetChipTone = offsetPct > 50 ? C.green : offsetPct < 50 ? C.red : C.navy;
  const hasMonthlyUsageData = monthlyKWh.some((v) => Number(v) > 0);
  const parsedRate = parseFloat(ratePerKWh);
  const rate = productionOnlyMode ? 0 : (Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0.12);
  const annualSavings = productionOnlyMode ? 0 : (Math.min(annualProd, annualKWh) * rate);

  // Credits - auto-populated from state
  const stInc = STATE_INCENTIVES[selState] || STATE_INCENTIVES.TX;
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
  const autoFinIncentivePct = grossCost > 0 ? (totalCredits / grossCost) * 100 : 0;

  useEffect(() => {
    if (!finIncentiveAuto) return;
    setFinIncentivePct(autoFinIncentivePct.toFixed(1));
  }, [finIncentiveAuto, autoFinIncentivePct]);

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

  // 25yr projection
  const esc = productionOnlyMode ? 0 : (parseFloat(rateEsc) || 3);
  const projection = useMemo(() => {
    if (productionOnlyMode) return [];
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
  }, [annualProd, annualKWh, rate, esc, netCost, productionOnlyMode]);

  const breakEven = productionOnlyMode ? "N/A" : (projection.find(r => r.net >= 0)?.y || "25+");
  const savings25 = productionOnlyMode ? 0 : (projection[24]?.cum || 0);
  const roi = productionOnlyMode ? 0 : (netCost > 0 ? ((annualSavings / netCost) * 100) : 0);
  // Excel-based land model:
  // Space Required by Janta (acres) = (X MW * 1000) / 450
  // Space Required by Fixed Tilt (acres) = (X MW * 1000) / 150
  // Space Conserved (acres) = Fixed Tilt acres - Janta acres
  const capacityMw = effectiveSize / 1000;
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
  const finCapacityMw = effectiveSize / 1000;
  const finCapacityFactor = effectiveCF;
  const finAnnualMWh = finCapacityMw * 8760 * finCapacityFactor;
  const finMonthlyMWh = finAnnualMWh / 12;
  const finPricePerMwNum = parseFloat(finPricePerMw) || 0;
  const finIncentivePctNum = parseFloat(finIncentivePct) || 0;
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
  const renderSystemCostsSection = (pdfMode) => {
    const avoid = pdfMode ? pdfAvoid : {};
    const pad = pdfMode ? 24 : 20;
    const h3Size = pdfMode ? 16 : 15;
    const title = pdfMode ? "System Costs" : "System Costs (Preview)";
    const summaryDark = darkThemeActive && (!pdfMode || proposalScreenDark);
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
        <h3 style={{ margin: "0 0 14px 0", fontSize: h3Size, fontWeight: 700, color: titleColor }}>{title}</h3>

        <div style={{ background: C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 12, ...avoid }}>
          <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
            Base System Price
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontFamily: fontSans }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.g500 }}>System Size</span>
              <span style={{ color: C.navy, fontWeight: 700 }}>{effectiveSize} kW</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.g500 }}>Price per kW</span>
              <span style={{ color: C.navy, fontWeight: 700 }}>${Math.round(costPerKW).toLocaleString()}</span>
            </div>
            <div style={{ borderTop: `1px dashed ${C.g200}`, marginTop: 2, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.blue, fontWeight: 700 }}>System Total (Solar PV)</span>
              <span style={{ color: C.blue, fontWeight: 700, fontFamily: fontSans }}>${Math.round(solarGross).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {(batteryAdd > 0 || generatorAdd > 0) && (
          <div style={{ marginTop: 12, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 12, ...avoid }}>
            <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: fontSans, marginBottom: 8 }}>
              Battery & Generator
            </div>
            {batteryAdd > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: generatorAdd > 0 ? `1px dashed ${C.g200}` : "none", fontSize: 12 }}>
                <span style={{ color: C.g700 }}>{batteryName.trim() || "Battery Storage"}</span>
                <span style={{ color: C.navy, fontFamily: fontSans, fontWeight: 700 }}>${Math.round(batteryAdd).toLocaleString()}</span>
              </div>
            )}
            {generatorAdd > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 12 }}>
                <span style={{ color: C.g700 }}>{generatorName.trim() || "Generator"}</span>
                <span style={{ color: C.navy, fontFamily: fontSans, fontWeight: 700 }}>${Math.round(generatorAdd).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 8, padding: 12, ...avoid }}>
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

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, ...avoid }}>
          <div style={{ background: summaryDark ? "#22180F" : C.cream, border: `1px solid ${C.g200}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Gross</div>
            <div style={{ color: summaryDark ? "#F8F2E8" : C.navy, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>${Math.round(grossCost).toLocaleString()}</div>
          </div>
          <div style={{ background: summaryDark ? "#1E2A20" : "#ECF8F5", border: summaryDark ? `1px solid ${C.g200}` : "1px solid #CBECE4", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Credits</div>
            <div style={{ color: C.green, fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>-${Math.round(totalCredits).toLocaleString()}</div>
          </div>
          <div style={{ background: summaryDark ? C.gold : C.navy, border: `1px solid ${summaryDark ? C.goldLight : C.navy}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ color: summaryDark ? "#3A2A15" : "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase", fontFamily: fontSans }}>Net Cost</div>
            <div style={{ color: summaryDark ? "#1D130A" : "#F8F2E8", fontWeight: 700, fontFamily: fontSans, marginTop: 2 }}>${Math.round(netCost).toLocaleString()}</div>
          </div>
        </div>
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

  return (
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.white, borderRadius: 10, padding: 14, border: `1px solid ${C.g200}` }}>
              <Toggle label="Production-only proposal (no utility rate/escalation required)" checked={productionOnlyMode} onChange={setProductionOnlyMode} />
            </div>

            {!productionOnlyMode && (
            <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Upload or Paste Utility Bill</h3>
              </div>
              <p style={{ color: C.g500, fontSize: 12, fontFamily: fontSans, margin: "0 0 10px 0" }}>
                Drag and drop one or more bill PDF/TXT files (merge mode), or paste text manually. The system will extract customer name, address, account number, usage history, and rate information automatically.
              </p>
              <input
                ref={billInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,text/plain,application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleBillFiles(e.target.files)}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleBillFiles(e.dataTransfer.files);
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
                {billUploadLoading ? "Reading file(s)..." : billFileName ? `Loaded: ${billFileName} (click to replace)` : "Drop bill file(s) here or click to upload"}
              </div>
              {billFileNames.length > 1 && !billUploadLoading && (
                <div style={{ marginBottom: 8, color: C.g500, fontSize: 11, fontFamily: fontSans }}>
                  {billFileNames.join(", ")}
                </div>
              )}
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
                color: "#F8F2E8", border: "none", borderRadius: 6, cursor: billText.length >= 20 ? "pointer" : "default",
                fontSize: 13, fontWeight: 600, fontFamily: fontSans,
              }}>
                Extract Bill Data
              </button>
            </div>
            )}

            {/* Extracted / Manual Entry */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Customer Information</h3>
                  {extracted && <span style={{ fontSize: 10, color: C.green, fontFamily: fontSans, background: `${C.green}11`, padding: "2px 8px", borderRadius: 10 }}>Auto-extracted</span>}
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
                <div style={{ display: "flex", gap: 8 }}>
                  <Field label="Effective Rate" value={ratePerKWh} onChange={setRatePerKWh} type="number" unit="$/kWh" step={0.01} disabled={productionOnlyMode} />
                  <Field label="Rate Escalation" value={rateEsc} onChange={setRateEsc} type="number" unit="%/yr" disabled={productionOnlyMode} />
                </div>
              </div>

              {!productionOnlyMode && (
              <div style={{ background: C.white, borderRadius: 10, padding: 20, border: `1px solid ${C.g200}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 4, height: 18, background: C.gold, borderRadius: 2 }} />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: titleColor }}>Monthly Usage (kWh)</h3>
                </div>
                <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 8px 0" }}>
                  {extracted && monthlyKWh.some(v => v > 0) ? "Values extracted from bill. Edit if needed." : "Enter 12 months of usage or paste bill to auto-fill."}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {MONTHS.map((m, i) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: darkThemeActive ? C.g700 : C.g500, fontSize: 10, width: 24, fontFamily: fontSans }}>{m}</span>
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
                      color1={darkThemeActive ? C.goldLight : C.navy}
                      height={130}
                      legend={[{ label: "Monthly Usage (kWh)", color: darkThemeActive ? C.goldLight : C.navy }]}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <Metric label="Annual" value={annualKWh.toLocaleString()} sub="kWh" color={darkThemeActive ? C.goldLight : C.navy} />
                      <Metric label="Monthly Avg" value={Math.round(annualKWh / 12).toLocaleString()} sub="kWh" color={darkThemeActive ? C.g700 : C.navy} />
                      <Metric label="Annual Cost" value={`$${(annualKWh * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={C.red} />
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
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
                                const next = Math.max(
                                  SYSTEM_SIZE_STEP_KW,
                                  Math.round((effectiveSize - SYSTEM_SIZE_STEP_KW) * 10) / 10
                                );
                                setSystemSizeKw(String(next));
                              }}
                              aria-label={`Subtract ${SYSTEM_SIZE_STEP_KW} kW`}
                              title={`−${SYSTEM_SIZE_STEP_KW} kW`}
                              style={systemSizeStepControlStyle(!systemSizeAtMinStep)}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = Math.round((effectiveSize + SYSTEM_SIZE_STEP_KW) * 10) / 10;
                                setSystemSizeKw(String(next));
                              }}
                              aria-label={`Add ${SYSTEM_SIZE_STEP_KW} kW`}
                              title={`+${SYSTEM_SIZE_STEP_KW} kW`}
                              style={systemSizeStepControlStyle(true)}
                            >
                              +
                            </button>
                          </div>
                        }
                      />
                      <div style={{ marginTop: 2, color: C.g500, fontSize: 9, fontFamily: fontSans, lineHeight: 1.35 }}>
                        Blank field → ~60% usage offset · adjust in {SYSTEM_SIZE_STEP_KW} kW steps
                      </div>
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
                        {hasManualCf ? "Clear to use auto again." : `Auto: ${cfSourceSummaryText.replace(/^Source: /, "")}. Override with %.`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.g200}` }}>
                    <Metric label="Offset" value={`${offsetPct.toFixed(0)}%`} sub="of annual usage" color={offsetChipTone} highlight />
                    <Metric label="Annual production" value={annualProd.toLocaleString()} sub="kWh/yr" color={C.blue} highlight />
                  </div>
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
                    <button
                      type="button"
                      onClick={() => setOptionalEquipmentOpen(true)}
                      aria-label="Add battery or generator"
                      style={{
                        display: "block",
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 16px",
                        background: C.blue,
                        border: "none",
                        borderRadius: 8,
                        color: "#F8F2E8",
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
                      + Add Battery or Generator
                    </button>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                            gap: 8,
                            alignItems: "center",
                            minWidth: 0,
                          }}
                        >
                          <Field
                            label="Battery storage"
                            value={batteryName}
                            onChange={(v) => {
                              setBatteryName(v);
                              if (!v.trim()) {
                                setBatteryCost("");
                                return;
                              }
                              const hit = BATTERY_PRESETS.find((p) => p.label === v);
                              if (hit?.cost != null) setBatteryCost(String(hit.cost));
                            }}
                            placeholder="Type or select…"
                            shrink
                            list="janta-battery-presets"
                          />
                          <Field label="Amount" value={batteryCost} onChange={setBatteryCost} type="number" unit="$" placeholder="0" shrink />
                          <button
                            type="button"
                            onClick={() => { setBatteryName(""); setBatteryCost(""); }}
                            disabled={!batteryName.trim() && !String(batteryCost).trim()}
                            aria-label="Clear battery"
                            title="Clear battery"
                            style={{
                              flexShrink: 0,
                              alignSelf: "center",
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: batteryName.trim() || String(batteryCost).trim() ? "#2f3e4d" : C.g300,
                              fontSize: 20,
                              fontWeight: 600,
                              lineHeight: 1,
                              padding: 0,
                              cursor: batteryName.trim() || String(batteryCost).trim() ? "pointer" : "not-allowed",
                              fontFamily: fontSans,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: batteryName.trim() || String(batteryCost).trim() ? 1 : 0.4,
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                            gap: 8,
                            alignItems: "center",
                            minWidth: 0,
                          }}
                        >
                          <Field
                            label="Generator"
                            value={generatorName}
                            onChange={(v) => {
                              setGeneratorName(v);
                              if (!v.trim()) {
                                setGeneratorCost("");
                                return;
                              }
                              const hit = GENERATOR_PRESETS.find((p) => p.label === v);
                              if (hit?.cost != null) setGeneratorCost(String(hit.cost));
                            }}
                            placeholder="Type or select…"
                            shrink
                            list="janta-generator-presets"
                          />
                          <Field label="Amount" value={generatorCost} onChange={setGeneratorCost} type="number" unit="$" placeholder="0" shrink />
                          <button
                            type="button"
                            onClick={() => { setGeneratorName(""); setGeneratorCost(""); }}
                            disabled={!generatorName.trim() && !String(generatorCost).trim()}
                            aria-label="Clear generator"
                            title="Clear generator"
                            style={{
                              flexShrink: 0,
                              alignSelf: "center",
                              width: 28,
                              height: 28,
                              border: "none",
                              background: "transparent",
                              color: generatorName.trim() || String(generatorCost).trim() ? "#2f3e4d" : C.g300,
                              fontSize: 20,
                              fontWeight: 600,
                              lineHeight: 1,
                              padding: 0,
                              cursor: generatorName.trim() || String(generatorCost).trim() ? "pointer" : "not-allowed",
                              fontFamily: fontSans,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: generatorName.trim() || String(generatorCost).trim() ? 1 : 0.4,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.g200}` }}>
                        <button
                          type="button"
                          onClick={() => {
                            setOptionalEquipmentOpen(false);
                            setBatteryName("");
                            setBatteryCost("");
                            setGeneratorName("");
                            setGeneratorCost("");
                          }}
                          aria-label="Close system additions"
                          style={{
                            display: "block",
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "8px 14px",
                            background: C.white,
                            border: `1px solid ${C.g200}`,
                            borderRadius: 6,
                            color: C.navy,
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: fontSans,
                            cursor: "pointer",
                            textAlign: "center",
                          }}
                        >
                          Close section
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

            {renderProposalPreviewShell(
              hasMonthlyUsageData ? "Janta Power Comparative Analysis" : "Janta Power Month-Month Production",
              <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}` }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>
                  {hasMonthlyUsageData ? "Janta Power Comparative Analysis" : "Janta Power Month-Month Production"}
                </h3>
                <BarChart
                  data={monthlyProd}
                  data2={monthlyKWh.some((v) => Number(v) > 0) ? monthlyKWh : undefined}
                  labels={MONTHS}
                  color1={chartProdColor}
                  color2={chartUsageColor}
                  height={175}
                  showBarValues
                  legend={
                    monthlyKWh.some((v) => Number(v) > 0)
                      ? [{ label: "Janta Energy Production (kWh)", color: chartProdColor }, { label: "Current Energy Usage", color: chartUsageColor }]
                      : [{ label: "Janta Energy Production (kWh)", color: chartProdColor }]
                  }
                />
              </div>
            )}

            {renderProposalPreviewShell(
              "Seasonal Production",
              <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}` }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>Seasonal Production</h3>
                <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                  Average power (kW) by month for the {effectiveSize} kW system{samData ? " — from NREL PVWatts" : ""}.
                </p>
                <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={155} title="" />
              </div>
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
              <div>
                <Field
                  value={pricingPerKW}
                  onChange={setPricingPerKW}
                  type="number"
                  unit="$/kW"
                  placeholder="3000"
                />
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
                          {removedCreditKeys.stateTax ? "—" : `-$${Math.round(stateTaxAmt).toLocaleString()}`}
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
                          {removedCreditKeys.srec ? "—" : `-$${Math.round(srecAmt).toLocaleString()}`}
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
                          {removedCreditKeys.utility ? "—" : `-$${Math.round(utilRebateAmt).toLocaleString()}`}
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
                        <span style={{ fontSize: 12, fontFamily: fontSans, fontWeight: 700, color: C.green }}>-${Math.round(c.amount || 0).toLocaleString()}</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.white, borderRadius: 10, padding: 14, border: `1px solid ${C.g200}` }}>
              <Toggle label="Include Project Financials section on proposal" checked={includeFinancialsInProposal} onChange={setIncludeFinancialsInProposal} />
              <Toggle label="Include 'Capital Invest Less Value of Saved Land' block" checked={includeCapitalLessSavedLand} onChange={setIncludeCapitalLessSavedLand} />
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
                  value={finIncentivePct}
                  onChange={(v) => {
                    setFinIncentiveAuto(false);
                    setFinIncentivePct(v);
                  }}
                  type="number"
                  unit="%"
                  disabled={finIncentiveAuto}
                  endSlot={(
                    <button
                      type="button"
                      onClick={() => setFinIncentiveAuto((v) => !v)}
                      style={{
                        border: `1px solid ${C.g300}`,
                        borderRadius: 999,
                        background: finIncentiveAuto ? C.gold : C.white,
                        color: finIncentiveAuto ? "#1B140D" : C.g700,
                        padding: "4px 10px",
                        fontSize: 10,
                        fontFamily: fontSans,
                        fontWeight: 700,
                        cursor: "pointer",
                        minWidth: 62,
                      }}
                    >
                      {finIncentiveAuto ? "AUTO" : "CUSTOM"}
                    </button>
                  )}
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

            {includeFinancialsInProposal && (
              renderProposalPreviewShell(
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
              )
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div ref={proposalPdfRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Cover */}
            <div style={{ background: C.navy, borderRadius: 10, padding: 22, color: proposalScreenDark ? "#F8F2E8" : C.white, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ height: 50, marginBottom: 6, paddingLeft: 0, paddingTop: 0, overflow: "hidden" }}>
                    <img
                      src="/assets/janta-logo-cropped.svg"
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
                {[[effectiveSize + " KW", "System Size"], ["25+ Yrs", "Lifespan"], [formatArea(landReq), "Land Required"], [formatArea(landCons), "Land Conserved"]].map(([v, l]) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{v}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: fontSans, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial */}
            <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <h3 style={{ margin: "0 0 14px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>{productionOnlyMode ? "Production Breakdown" : "Financial Breakdown"}</h3>
              {[
                ...(!productionOnlyMode ? [
                  ["25-Year Utility Savings", `$${Math.round(savings25).toLocaleString()}`],
                  ['Approximate "Break-Even"', `${breakEven} Years`],
                ] : []),
                ["Janta Power's Capacity Factor", `${(effectiveCF * 100).toFixed(1)}%${samData ? " (NREL PVWatts)" : ` (${(reg.traditionalCF * 100).toFixed(1)}% for Traditional)`}`],
                ["Annual Energy Production", `${annualProd.toLocaleString()} kWh`],
                ...(!productionOnlyMode ? [["Annual Return on Investment", `${roi.toFixed(1)}%`]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.g200}` }}>
                  <span style={{ color: C.g700, fontSize: 13 }}>{k}</span>
                  <span style={{ color: C.navy, fontSize: 13, fontWeight: 700, fontFamily: fontSans }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <BarChart
                  data={monthlyProd}
                  data2={monthlyKWh.some((v) => Number(v) > 0) ? monthlyKWh : undefined}
                  labels={MONTHS}
                  color1={chartProdColor}
                  color2={chartUsageColor}
                  height={175}
                  showBarValues
                  legend={
                    monthlyKWh.some((v) => Number(v) > 0)
                      ? [{ label: "Janta Energy Production (kWh)", color: chartProdColor }, { label: "Current Energy Usage", color: chartUsageColor }]
                      : [{ label: "Janta Energy Production (kWh)", color: chartProdColor }]
                  }
                />
              </div>
            </div>

            {/* Seasonal production (SAM): time vs kW */}
            <div style={{ background: C.white, borderRadius: 10, padding: 18, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 700, color: titleColor }}>Seasonal Production</h3>
              <p style={{ color: C.g500, fontSize: 11, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                Average power (kW) by month for the {effectiveSize} kW system{samData ? " — from NREL PVWatts" : ""}.
              </p>
              <SeasonalChart monthlyKWh={monthlyProd} color={C.gold} height={155} title="" />
            </div>

            {/* System Costs */}
            {renderSystemCostsSection(true)}

            {includeFinancialsInProposal && (
              <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700, color: titleColor }}>Project Financials</h3>
                <div style={{ overflowX: "auto", border: `1px solid ${C.g200}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fontSans, minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: proposalScreenDark ? "#211A14" : "#F1F5FB" }}>
                        <th style={{ textAlign: "left", padding: "7px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>Value of Energy Produced ($/MWh)</th>
                        {finScenarios.map((s) => (
                          <th key={`ph-${s.price}`} style={{ textAlign: "right", padding: "7px 8px", borderBottom: `1px solid ${C.g200}`, color: proposalScreenDark ? "#F8F2E8" : C.navy, fontWeight: 700 }}>{s.price.toFixed(1)}</th>
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
            {!productionOnlyMode && (
              <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: titleColor }}>25-Year Projection</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fontSans }}>
                  <thead><tr>{["Year", "Production", "Annual Savings", "Cumulative", "Net"].map(h => (
                    <th key={h} style={{ color: C.g500, fontSize: 9, textTransform: "uppercase", padding: "6px 4px", textAlign: "right", borderBottom: `1px solid ${C.g200}` }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{projection.filter((_, i) => i < 5 || i === 9 || i === 14 || i === 19 || i === 24).map(r => (
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

            {/* Permissions + Signature */}
            <div style={{ background: C.white, borderRadius: 10, padding: 24, border: `1px solid ${C.g200}`, breakInside: "avoid", pageBreakInside: "avoid" }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 15, fontWeight: 700, color: titleColor }}>Permissions and Details</h3>
              <p style={{ color: C.g700, fontSize: 12, lineHeight: 1.7, fontFamily: fontSans, margin: "0 0 14px 0" }}>
                For this project, we will obtain all required permits from both municipal agencies and the utility company. The building permit ensures the installation meets code and does not impact surrounding structures. The utility permit, known as an interconnection permit, grants permission to connect your system to the grid and confirms the system is safe and code-compliant. Our solar towers are designed to meet all current local, state, and national regulations.
              </p>
              <div style={{ background: C.g100, borderRadius: 8, padding: 14, border: `1px solid ${C.g200}`, marginBottom: 20, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <div style={{ color: C.g500, fontSize: 10, textTransform: "uppercase", fontFamily: fontSans, marginBottom: 4 }}>Site Overview</div>
                <p style={{ color: C.g700, fontSize: 12, lineHeight: 1.6, fontFamily: fontSans, margin: 0 }}>
                  To complete the design and validate final output potential, we recommend a follow-up site inspection to assess soil conditions (for ground-mounted units), accessibility, electrical interconnection points, and regional weather patterns.
                </p>
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 400, color: titleColor, margin: "0 0 10px 0" }}>Customer Approval:</h3>
              <p style={{ color: C.g700, fontSize: 12, fontFamily: fontSans, marginBottom: 20 }}>
                Once you've reviewed the terms above, sign this proposal to indicate your approval. An installation contract will then be created and sent to you for final approval and signature.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, breakInside: "avoid", pageBreakInside: "avoid" }}>
                <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                  <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Signature:</div>
                  <div style={{ borderBottom: `1px solid ${C.g300}`, height: 36, marginBottom: 6, display: "flex", alignItems: "flex-end" }}>
                    <img
                      src="/assets/adam-boudissa-signature-new.png"
                      alt="Adam Boudissa signature"
                      style={{
                        maxHeight: 30,
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
                  <div style={{ fontSize: 12, fontFamily: fontSans, color: C.g700 }}>Janta Power</div>
                  <div style={{ fontSize: 12, fontFamily: fontSans, color: C.g700 }}>Adam Boudissa, Finance Officer</div>
                </div>
                <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                  <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Signature:</div>
                  <div style={{ borderBottom: `1px solid ${C.g300}`, height: 36, marginBottom: 6 }} />
                  <div style={{ color: proposalScreenDark ? "#F8F2E8" : C.navy, fontSize: 12, fontWeight: 700 }}>Printed Name:</div>
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
              <button onClick={() => setStep(0)} style={{ padding: "12px 0", background: darkThemeActive ? "#E3D2B8" : C.white, color: darkThemeActive ? "#1B140D" : C.navy, border: `1px solid ${C.g200}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: fontSans }}>← Start New Proposal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
