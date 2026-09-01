export const DEFAULT_PRICING_PER_KW = 3000;

export function parsePricingPerKw(value, fallback = DEFAULT_PRICING_PER_KW) {
  const p = parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(p) && p > 0 ? p : fallback;
}

export function resolveSolarPricePerKw({ pricingPerKW, pricingPerKWHigh, pricingUseRange }) {
  const low = parsePricingPerKw(pricingPerKW);
  if (!pricingUseRange) {
    return { useRange: false, low, high: low, midpoint: low };
  }
  const highParsed = parseFloat(String(pricingPerKWHigh || "").replace(/,/g, ""));
  const high = Number.isFinite(highParsed) && highParsed > 0 ? highParsed : low;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const useRange = hi > lo + 0.001;
  return { useRange, low: lo, high: hi, midpoint: (lo + hi) / 2 };
}

export function solarGrossForKw(kw, pricePerKw) {
  return kw * pricePerKw;
}

export function formatUsd(amount) {
  if (!Number.isFinite(amount)) return "—";
  return `$${Math.round(amount).toLocaleString()}`;
}

/** Short currency for charts: 6072500 → $6.1M, 1500000 → $1.5M, 450000 → $450K */
export function formatUsdCompact(amount) {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const fmtScaled = (n, suffix) => {
    let s = n.toFixed(1);
    s = s.replace(/\.0$/, "");
    return `${sign}$${s}${suffix}`;
  };
  if (abs >= 1_000_000) return fmtScaled(abs / 1_000_000, "M");
  if (abs >= 1_000) return fmtScaled(abs / 1_000, "K");
  return formatUsd(amount);
}

export function formatUsdRange(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "—";
  if (Math.round(low) === Math.round(high)) return formatUsd(low);
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return `${formatUsd(lo)} – ${formatUsd(hi)}`;
}

/** $/W from total project cost and DC capacity (kW). */
export function usdPerWatt(totalUsd, capacityKw) {
  if (!Number.isFinite(totalUsd) || !Number.isFinite(capacityKw) || capacityKw <= 0) return NaN;
  return totalUsd / (capacityKw * 1000);
}

export function formatUsdPerW(pricePerKwOrWatt) {
  if (!Number.isFinite(pricePerKwOrWatt)) return "—";
  const perW = pricePerKwOrWatt > 50 ? pricePerKwOrWatt / 1000 : pricePerKwOrWatt;
  return `$${perW.toFixed(2)}/W`;
}

export function formatUsdPerWFromTotal(totalUsd, capacityKw) {
  return formatUsdPerW(usdPerWatt(totalUsd, capacityKw));
}

export function formatUsdPerWRange(lowPerKw, highPerKw) {
  if (!Number.isFinite(lowPerKw) || !Number.isFinite(highPerKw)) return "—";
  const lo = Math.min(lowPerKw, highPerKw) / 1000;
  const hi = Math.max(lowPerKw, highPerKw) / 1000;
  if (Math.abs(lo - hi) < 0.005) return `$${lo.toFixed(2)}/W`;
  return `$${lo.toFixed(2)} – $${hi.toFixed(2)}/W`;
}

export function formatUsdPerWRangeFromTotals(lowUsd, highUsd, capacityKw) {
  if (!Number.isFinite(capacityKw) || capacityKw <= 0) return "—";
  const lo = usdPerWatt(lowUsd, capacityKw);
  const hi = usdPerWatt(highUsd, capacityKw);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "—";
  if (Math.abs(lo - hi) < 0.005) return `$${lo.toFixed(2)}/W`;
  return `$${Math.min(lo, hi).toFixed(2)} – $${Math.max(lo, hi).toFixed(2)}/W`;
}
