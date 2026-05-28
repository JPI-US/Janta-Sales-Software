import fs from "fs";
import path from "path";
import os from "os";

const ldbDir = path.join(
  os.homedir(),
  "AppData/Roaming/Cursor/Partitions/cursor-browser/Local Storage/leveldb"
);

const files = ["000005.ldb", "000007.ldb", "000008.log", "000009.ldb"];

function extractSnapshots(raw) {
  const results = [];
  let searchFrom = 0;
  while (true) {
    const idx = raw.indexOf('"snapshot":{', searchFrom);
    if (idx < 0) break;
    const start = raw.lastIndexOf("{", idx);
    const obj = parseBalanced(raw, start);
    if (obj?.snapshot) results.push(obj);
    searchFrom = idx + 12;
  }
  return results;
}

function parseBalanced(raw, startPos) {
  let depth = 0;
  for (let i = startPos; i < Math.min(raw.length, startPos + 200000); i++) {
    const ch = raw[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        let slice = raw.slice(startPos, i + 1);
        slice = slice.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function describe(s) {
  const snap = s.snapshot;
  const meters = snap.meters || [];
  const usageCells = meters.reduce(
    (n, m) => n + (m.monthlyKWh || []).filter((v) => v != null && Number(v) > 0).length,
    0
  );
  const savedMeters = meters.filter((m) => m.usageSavedAt).length;
  return {
    updatedAt: s.updatedAt,
    meters: meters.length,
    names: meters.map((m) => m.name || "?").join(", "),
    numbers: meters.map((m) => m.meterNumber || "").filter(Boolean).join(", "),
    usageCells,
    savedMeters,
    cust: snap.custName || "(empty)",
    multi: snap.multiMeterMode,
  };
}

const all = [];
for (const f of files) {
  const fp = path.join(ldbDir, f);
  if (!fs.existsSync(fp)) continue;
  let raw;
  try {
    raw = fs.readFileSync(fp, "utf8");
  } catch {
    continue;
  }
  const snaps = extractSnapshots(raw);
  console.log(`\n${f}: ${snaps.length} snapshots`);
  const seen = new Set();
  for (const s of snaps) {
    const key = JSON.stringify(s);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ file: f, ...describe(s), raw: s });
  }
  for (const d of [...seen].map((k) => describe(JSON.parse(k))).slice(0, 15)) {
    console.log(`  ${d.updatedAt} | meters:${d.meters} saved:${d.savedMeters} usage:${d.usageCells} | ${d.names}`);
  }
}

const best = all.sort(
  (a, b) =>
    b.usageCells - a.usageCells ||
    b.savedMeters - a.savedMeters ||
    b.meters - a.meters
)[0];

console.log("\n=== BEST OVERALL ===");
if (best) {
  console.log(best);
  fs.writeFileSync(
    path.join(process.cwd(), "recovered-best-draft.json"),
    JSON.stringify(best.raw, null, 2)
  );
} else {
  console.log("none");
}

// Also parse saved proposals store
for (const f of files) {
  const fp = path.join(ldbDir, f);
  if (!fs.existsSync(fp)) continue;
  const raw = fs.readFileSync(fp, "utf8");
  const idx = raw.indexOf("janta_saved_proposals_v1");
  if (idx < 0) continue;
  const start = raw.indexOf('{"proposals"', idx);
  if (start < 0) continue;
  const store = parseBalanced(raw, start);
  if (store?.proposals) {
    console.log(`\n${f} saved proposals:`, store.proposals.length);
    for (const p of store.proposals) {
      const m = p.snapshot?.meters || [];
      console.log(
        `  - ${p.title} | meters:${m.length} | ${m.map((x) => x.name).join(", ")}`
      );
    }
  }
}
