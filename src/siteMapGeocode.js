/**
 * Browser-friendly site geocoding with Nominatim + Photon.
 * Supports autocomplete suggestions, lat/lng paste, and duplex-aware resolve.
 */

const STATE_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function cleanAddress(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/** Strip apt/suite/unit fragments that often kill OSM street matches. */
function stripUnit(address) {
  return cleanAddress(
    address
      .replace(/\b(apt|apartment|suite|ste|unit|#)\.?\s*[a-z0-9-]+\b/gi, "")
      .replace(/\bfl(?:oor)?\.?\s*\d+\b/gi, "")
  );
}

/** Drop county / country / PID / subdivision fluff from labels and queries. */
export function simplifyAddressLabel(address) {
  return cleanAddress(
    String(address || "")
      .replace(/\bUnited States(?: of America)?\b/gi, "")
      .replace(/\bU\.?\s*S\.?\s*A\.?\b/gi, "")
      .replace(/\b[\w.'-]+(?:\s+[\w.'-]+)?\s+County\b/gi, "")
      .replace(/\bCounty of\s+[\w.'-]+(?:\s+[\w.'-]+)?\b/gi, "")
      .replace(/\b(?:[\w.'-]+\s+)*PID\b/gi, "")
      .replace(/\b(?:parcel|subdivision|complex|plaza|crossing)\s+id\b/gi, "")
      .replace(/\bUniversity Crossing\b/gi, "")
  );
}

function abbreviateStateNames(address) {
  let out = String(address || "");
  Object.entries(STATE_ABBR).forEach(([name, abbr]) => {
    const re = new RegExp(`\\b${name}\\b`, "gi");
    out = out.replace(re, abbr);
  });
  return cleanAddress(out);
}

/**
 * Parse pasted coordinates: "32.82, -96.77" or "32.82 -96.77" or "32.82/ -96.77".
 * Returns null when the string is not a coordinate pair.
 */
export function parseLatLngQuery(query) {
  const q = cleanAddress(query);
  if (!q) return null;
  const m = q.match(
    /^([+-]?\d{1,2}(?:\.\d+)?)\s*[,/\s]\s*([+-]?\d{1,3}(?:\.\d+)?)$/
  );
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // If first number looks like a longitude, swap (common paste order).
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function coordHit(lat, lng) {
  const displayName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return {
    id: `coord-${lat},${lng}`,
    lat,
    lng,
    displayName,
    primary: displayName,
    secondary: "Coordinates",
    provider: "coordinates",
    score: 2,
  };
}

/**
 * Expand duplex / multi-unit house numbers into searchable street variants.
 * e.g. "5420,5422, Winton Street, Dallas, TX" → "5422 Winton Street, Dallas, TX"
 */
function duplexHouseVariants(address) {
  const raw = cleanAddress(address);
  if (!raw) return [];

  // "5420,5422, Winton Street, …" or "5420/5422 Winton …" or "5420 & 5422 Winton …"
  const multi = raw.match(
    /^(\d{1,6})\s*[,/&]\s*(\d{1,6})\s*,?\s+(.+)$/i
  );
  if (!multi) return [];

  const a = multi[1];
  const b = multi[2];
  const rest = cleanAddress(multi[3]);
  if (!rest) return [];

  // Prefer the second number when it looks like a duplex pair (odd/even neighbors).
  const ordered = [b, a];
  return ordered.map((num) => cleanAddress(`${num} ${rest}`));
}

function extractPreferredHouseNumber(original) {
  const m = String(original || "").match(/\b(\d{1,6})\b/);
  return m ? m[1] : null;
}

export function buildGeocodeVariants(address) {
  const raw = cleanAddress(address);
  if (!raw) return [];

  const variants = [];
  const push = (v) => {
    const c = cleanAddress(v);
    if (c && !variants.includes(c)) variants.push(c);
  };

  push(raw);

  const simplified = simplifyAddressLabel(raw);
  push(simplified);

  const noUnit = stripUnit(simplified || raw);
  push(noUnit);

  duplexHouseVariants(simplified || raw).forEach(push);
  duplexHouseVariants(noUnit).forEach(push);

  const looksDuplex = /^\d{1,6}\s*[,/&]\s*\d{1,6}\b/.test(simplified || raw);
  if (!looksDuplex) {
    const preferred = extractPreferredHouseNumber(raw);
    if (preferred) {
      duplexHouseVariants(simplified || raw)
        .filter((v) => v.startsWith(`${preferred} `))
        .forEach((v) => {
          const idx = variants.indexOf(v);
          if (idx > 0) {
            variants.splice(idx, 1);
            variants.unshift(v);
          }
        });
    }
  }

  const baseList = [...variants];
  baseList.forEach((base) => {
    const abbr = abbreviateStateNames(base);
    push(abbr);
    if (!/\b(usa|u\.s\.a\.|united states)\b/i.test(base)) {
      push(`${base}, USA`);
      push(`${abbr}, USA`);
    }
    const noZip = cleanAddress(base.replace(/\b\d{5}(?:-\d{4})?\b/g, ""));
    push(noZip);
    push(abbreviateStateNames(noZip));
  });

  return variants;
}

function formatPhotonLabel(p = {}, fallback = "") {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [street || p.name, p.city || p.town || p.village, p.state, p.postcode]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const uniq = [];
  parts.forEach((part) => {
    if (!uniq.length || uniq[uniq.length - 1].toLowerCase() !== part.toLowerCase()) uniq.push(part);
  });
  return simplifyAddressLabel(uniq.join(", ") || fallback);
}

function nominatimHit(row, provider = "nominatim") {
  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = row.address || {};
  const primary = [a.house_number, a.road || a.pedestrian || a.residential]
    .filter(Boolean)
    .join(" ");
  const secondary = [a.city || a.town || a.village || a.hamlet, a.state, a.postcode]
    .filter(Boolean)
    .join(", ");
  const composed = [primary, secondary].filter(Boolean).join(", ");
  const displayName = simplifyAddressLabel(composed || row.display_name || "");
  let score = Number(row.importance) || 0;
  if (row.class === "building" || row.type === "house") score += 0.4;
  if (row.class === "place" && row.type === "house") score += 0.3;
  if (a.house_number) score += 0.25;
  if (a.road) score += 0.1;
  return {
    id: `nom-${row.place_id || `${lat},${lng}`}`,
    lat,
    lng,
    displayName,
    primary: primary || displayName.split(",")[0] || displayName,
    secondary: secondary || "",
    provider,
    score,
  };
}

function photonHit(feature, provider = "photon") {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feature.properties || {};
  const cc = String(p.countrycode || "").toUpperCase();
  const country = String(p.country || "").toLowerCase();
  if (cc && cc !== "US" && !country.includes("united states")) return null;
  const displayName = formatPhotonLabel(p, p.name || "");
  if (!displayName) return null;
  let score = 0.2;
  if (p.housenumber) score += 0.35;
  if (p.street) score += 0.2;
  if (p.type === "house" || p.osm_value === "house") score += 0.3;
  if (cc === "US") score += 0.15;
  return {
    id: `pho-${p.osm_id || `${lat},${lng}`}`,
    lat: Number(lat),
    lng: Number(lng),
    displayName,
    primary: [p.housenumber, p.street || p.name].filter(Boolean).join(" ") || displayName.split(",")[0],
    secondary: [p.city || p.town || p.village, p.state, p.postcode].filter(Boolean).join(", "),
    provider,
    score,
  };
}

function dedupeHits(hits) {
  const seen = new Set();
  const out = [];
  hits.forEach((h) => {
    if (!h) return;
    const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
    const nameKey = (h.displayName || "").toLowerCase().replace(/\s+/g, " ");
    const dual = `${key}|${nameKey.slice(0, 48)}`;
    if (seen.has(key) || seen.has(dual)) return;
    seen.add(key);
    seen.add(dual);
    out.push(h);
  });
  return out.sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function fetchNominatimList(q, { limit = 6, signal } = {}) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("email", "janta-proposal-generator@local");

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en",
    },
  });
  if (res.status === 429) {
    throw new Error("Geocoder rate-limited. Wait a few seconds and try again.");
  }
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status}). Try again in a moment.`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((row) => nominatimHit(row)).filter(Boolean);
}

async function fetchPhotonList(q, { limit = 6, signal, biasLat, biasLng } = {}) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", String(biasLat ?? 39.8283));
  url.searchParams.set("lon", String(biasLng ?? -98.5795));

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status}). Try again in a moment.`);
  }
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  return features.map((f) => photonHit(f)).filter(Boolean);
}

async function fetchMergedHits(q, { limit = 6, signal, biasLat, biasLng } = {}) {
  let lastError = null;
  const [nom, pho] = await Promise.all([
    fetchNominatimList(q, { limit, signal }).catch((err) => {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      return [];
    }),
    fetchPhotonList(q, { limit, signal, biasLat, biasLng }).catch((err) => {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      return [];
    }),
  ]);
  return { hits: [...nom, ...pho], lastError };
}

/**
 * Autocomplete suggestions for the property address field.
 * Merges Nominatim + Photon, dedupes, returns top matches.
 * Also accepts lat/lng coordinate paste.
 */
export async function suggestSiteAddresses(query, { limit = 7, signal, biasLat, biasLng } = {}) {
  const q = cleanAddress(query);
  if (q.length < 3) return [];

  const coords = parseLatLngQuery(q);
  if (coords) return [coordHit(coords.lat, coords.lng)];

  // Autocomplete: try cleaned query + first duplex expansion (avoid hammering APIs).
  const variants = [];
  const simplified = simplifyAddressLabel(q);
  variants.push(q);
  if (simplified && simplified !== q) variants.push(simplified);
  duplexHouseVariants(simplified || q).slice(0, 2).forEach((v) => {
    if (!variants.includes(v)) variants.push(v);
  });

  const collected = [];
  let lastError = null;

  for (const variant of variants.slice(0, 3)) {
    try {
      const { hits, lastError: err } = await fetchMergedHits(variant, {
        limit,
        signal,
        biasLat,
        biasLng,
      });
      if (err) lastError = err;
      collected.push(...hits);
      if (collected.length >= limit) break;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      if (/rate-limited/i.test(err?.message || "")) throw err;
    }
  }

  const hits = dedupeHits(collected).slice(0, limit);
  if (!hits.length && lastError) throw lastError;
  return hits;
}

/**
 * Resolve a US street address (or lat/lng) to coordinates (best single match).
 */
export async function geocodeSiteAddress(address, options = {}) {
  const q = cleanAddress(address);
  const coords = parseLatLngQuery(q);
  if (coords) return coordHit(coords.lat, coords.lng);

  const variants = buildGeocodeVariants(address);
  if (!variants.length) throw new Error("Enter an address to search.");

  let lastError = null;

  for (const variant of variants) {
    try {
      const { hits, lastError: err } = await fetchMergedHits(variant, {
        limit: 5,
        ...options,
      });
      if (err) lastError = err;
      const ranked = dedupeHits(hits);
      if (ranked.length) return ranked[0];
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      if (/rate-limited/i.test(err?.message || "")) throw err;
    }
  }

  throw (
    lastError ||
    new Error("Address not found. Try street, city, and state (ZIP optional), or lat, lng.")
  );
}
