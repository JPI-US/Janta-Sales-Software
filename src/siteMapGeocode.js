/**
 * Browser-friendly site geocoding with Nominatim + Photon.
 * Supports autocomplete suggestions and single-address resolve.
 */

function cleanAddress(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
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

export function buildGeocodeVariants(address) {
  const raw = cleanAddress(address);
  if (!raw) return [];
  const variants = [raw];
  const noUnit = stripUnit(raw);
  if (noUnit && noUnit !== raw) variants.push(noUnit);

  const base = noUnit || raw;
  if (!/\b(usa|u\.s\.a\.|united states)\b/i.test(base)) {
    variants.push(`${base}, USA`);
    variants.push(`${base}, United States`);
  }

  const noZip = cleanAddress(base.replace(/\b\d{5}(?:-\d{4})?\b/g, ""));
  if (noZip && noZip !== base) variants.push(noZip);

  return [...new Set(variants.filter(Boolean))];
}

function formatPhotonLabel(p = {}, fallback = "") {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [street || p.name, p.city || p.town || p.village || p.county, p.state, p.postcode]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  // Deduplicate consecutive repeats
  const uniq = [];
  parts.forEach((part) => {
    if (!uniq.length || uniq[uniq.length - 1].toLowerCase() !== part.toLowerCase()) uniq.push(part);
  });
  return uniq.join(", ") || fallback;
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
  const displayName = row.display_name || [primary, secondary].filter(Boolean).join(", ");
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
    secondary: secondary || displayName.split(",").slice(1).join(",").trim(),
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

/**
 * Autocomplete suggestions for the property address field.
 * Merges Nominatim + Photon, dedupes, returns top matches.
 */
export async function suggestSiteAddresses(query, { limit = 7, signal, biasLat, biasLng } = {}) {
  const q = cleanAddress(query);
  if (q.length < 3) return [];

  const variants = [q];
  const noUnit = stripUnit(q);
  if (noUnit && noUnit !== q) variants.push(noUnit);

  const collected = [];
  let lastError = null;

  for (const variant of variants.slice(0, 2)) {
    try {
      const [nom, pho] = await Promise.all([
        fetchNominatimList(variant, { limit, signal }).catch((err) => {
          if (err?.name === "AbortError") throw err;
          lastError = err;
          return [];
        }),
        fetchPhotonList(variant, { limit, signal, biasLat, biasLng }).catch((err) => {
          if (err?.name === "AbortError") throw err;
          lastError = err;
          return [];
        }),
      ]);
      collected.push(...nom, ...pho);
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
 * Resolve a US street address to lat/lng (best single match).
 */
export async function geocodeSiteAddress(address, options = {}) {
  const variants = buildGeocodeVariants(address);
  if (!variants.length) throw new Error("Enter an address to search.");

  let lastError = null;

  for (const q of variants) {
    try {
      const hits = await suggestSiteAddresses(q, { limit: 5, ...options });
      if (hits.length) return hits[0];
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      if (/rate-limited/i.test(err?.message || "")) throw err;
    }
  }

  throw (
    lastError ||
    new Error("Address not found. Try street, city, and state (ZIP optional).")
  );
}
