import fs from "fs";
import os from "os";
import path from "path";

const ldbDir =
  process.env.LDB_DIR ||
  path.join(
    os.homedir(),
    "AppData/Roaming/Cursor/Partitions/cursor-browser/Local Storage/leveldb"
  );
const tmpDir = path.join(os.tmpdir(), "ldb-deep");

function readAllTextFromDir(dir) {
  let combined = "";
  if (!fs.existsSync(dir)) return combined;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(ldb|log)$/i.test(name)) continue;
    const fp = path.join(dir, name);
    try {
      const buf = fs.readFileSync(fp);
      combined += `\n###FILE:${name}###\n`;
      combined += buf.toString("utf8");
      combined += buf.toString("latin1");
    } catch {
      /* skip locked */
    }
  }
  return combined;
}

function extractJsonLike(raw, label) {
  const found = [];
  const markers = [
    "janta_saved_proposals",
    "janta_session_draft",
    '"meters":',
    "monthlyKWh",
    "usageSavedAt",
    "meterNumber",
  ];
  for (const marker of markers) {
    let pos = 0;
    while ((pos = raw.indexOf(marker, pos)) !== -1) {
      const start = raw.lastIndexOf("{", Math.max(0, pos - 500));
      if (start >= 0) {
        const obj = tryExtractObject(raw, start);
        if (obj) found.push({ label, marker, obj, pos });
      }
      pos += marker.length;
    }
  }
  return found;
}

function tryExtractObject(raw, startPos) {
  let depth = 0;
  let started = false;
  for (let i = startPos; i < Math.min(raw.length, startPos + 500000); i++) {
    const ch = raw[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        let slice = raw.slice(startPos, i + 1);
        slice = slice.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
        try {
          return JSON.parse(slice);
        } catch {
          slice = slice.replace(/\t/g, " ").replace(/,\s*,/g, ",");
          try {
            return JSON.parse(slice);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function scoreSnapshot(s) {
  if (!s) return 0;
  const snap = s.snapshot || s;
  if (snap.v !== 1 && !snap.meters) return 0;
  let score = 0;
  const filled = (arr) =>
    (arr || []).filter((v) => v != null && Number(v) > 0).length;
  score += filled(snap.monthlyKWh) * 5;
  const meters = snap.meters || [];
  score += meters.length * 20;
  for (const m of meters) {
    score += filled(m.monthlyKWh) * 6;
    if (m.meterNumber) score += 8;
    if (m.name) score += 4;
    if (m.usageSavedAt) score += 15;
  }
  if (snap.custName) score += 10;
  if (snap.billText?.length > 50) score += 20;
  return score;
}

function findUsageArrays(raw) {
  const re = /\[(?:null|\d{2,6})(?:,(?:null|\d{2,6})){5,11}\]/g;
  const out = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      const arr = JSON.parse(m[0]);
      const sum = arr.reduce((a, v) => a + (v == null ? 0 : Number(v)), 0);
      if (sum > 500) out.push({ arr, sum, at: m.index });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.sum - a.sum);
}

function findMeterFragments(raw) {
  const names = new Set();
  const numbers = new Set();
  const idRe = /meter-[A-Za-z0-9\-]{8,40}/g;
  let m;
  while ((m = idRe.exec(raw)) !== null) names.add(m[0]);
  const numRe = /"meterNumber"\s*:\s*"([^"]{2,30})"/g;
  while ((m = numRe.exec(raw)) !== null) numbers.add(m[1]);
  const nameRe = /"name"\s*:\s*"(Meter[^"]{0,40})"/g;
  const meterNames = new Set();
  while ((m = nameRe.exec(raw)) !== null) meterNames.add(m[1]);
  return { ids: [...names], numbers: [...numbers], names: [...meterNames] };
}

const raw = readAllTextFromDir(tmpDir) + readAllTextFromDir(ldbDir);
const outPath = path.join(process.cwd(), "recovery-scan-report.txt");
fs.writeFileSync(outPath, raw.slice(0, 500000));

console.log("Raw length:", raw.length);
console.log("Files scanned from:", fs.existsSync(tmpDir) ? tmpDir : ldbDir);

const arrays = findUsageArrays(raw);
console.log("\nUsage arrays with sum > 500:", arrays.length);
arrays.slice(0, 10).forEach((a, i) => {
  const filled = a.arr.filter((v) => v != null).length;
  console.log(`  ${i}: sum=${a.sum} filled=${filled} sample=${JSON.stringify(a.arr.slice(0, 4))}`);
});

const frags = findMeterFragments(raw);
console.log("\nMeter IDs:", frags.ids.length, frags.ids.slice(0, 15));
console.log("Meter numbers:", frags.numbers);
console.log("Meter names:", frags.names);

const jsons = extractJsonLike(raw, "blob");
const scored = jsons
  .map((j) => ({ ...j, score: scoreSnapshot(j.obj) }))
  .filter((j) => j.score > 0)
  .sort((a, b) => b.score - a.score);

console.log("\nParsed JSON candidates:", scored.length);
scored.slice(0, 8).forEach((j, i) => {
  const s = j.obj.snapshot || j.obj;
  console.log(
    `  ${i}: score=${j.score} marker=${j.marker} meters=${s.meters?.length ?? "?"} ` +
      `names=${(s.meters || []).map((m) => m.name).join(", ")}`
  );
});

// Search saved proposals store specifically
const savedIdx = raw.indexOf("janta_saved_proposals");
if (savedIdx >= 0) {
  console.log("\njanta_saved_proposals found at", savedIdx);
  console.log(raw.slice(savedIdx, savedIdx + 500).replace(/[\x00-\x1f]/g, " "));
} else {
  console.log("\nNO janta_saved_proposals in storage dump");
}

// Best snapshot export
const best = scored[0]?.obj?.snapshot || scored[0]?.obj;
if (best?.v === 1 || best?.meters) {
  const snap = best.v === 1 ? best : best;
  fs.writeFileSync(
    path.join(process.cwd(), "recovered-best-snapshot.json"),
    JSON.stringify(snap, null, 2)
  );
  console.log("\nWrote recovered-best-snapshot.json score", scored[0].score);
}

console.log("\nFull scan written to", outPath);
