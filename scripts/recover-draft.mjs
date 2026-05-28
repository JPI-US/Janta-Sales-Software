import fs from "fs";
import os from "os";
import path from "path";

const raw = fs.readFileSync(path.join(os.tmpdir(), "cursor-ls-full.txt"), "utf8");

// Pull numeric monthly arrays: [null,1234,...] or [123,456,...]
const arrayRe = /\[(?:null|\d{2,6})(?:,(?:null|\d{2,6})){11}\]/g;
const arrays = [];
let m;
while ((m = arrayRe.exec(raw)) !== null) {
  try {
    const arr = JSON.parse(m[0].replace(/null/g, "null"));
    const sum = arr.reduce((a, v) => a + (v == null ? 0 : Number(v)), 0);
    if (sum > 1000) arrays.push({ arr, sum, index: m.index });
  } catch {
    /* skip */
  }
}
arrays.sort((a, b) => b.sum - a.sum);
console.log("usage arrays found", arrays.length);
arrays.slice(0, 8).forEach((a, i) => console.log(i, "sum", a.sum, "sample", a.arr.filter((v) => v != null).slice(0, 3)));

// meter numbers like 60-01
const meterNumRe = /Meter[^a-zA-Z0-9]{0,5}([0-9]{1,4}-[0-9]{1,4})/gi;
const meterNames = new Set();
while ((m = meterNumRe.exec(raw)) !== null) meterNames.add(`Meter ${m[1]}`);
console.log("meter names", [...meterNames]);

// meterNumber fields
const numRe = /meterNumber[^0-9A-Za-z]{0,8}([A-Z0-9-]{3,20})/gi;
const meterNums = new Set();
while ((m = numRe.exec(raw)) !== null) meterNums.add(m[1]);
console.log("meter numbers", [...meterNums]);

// cust fields - loose
const custName = raw.match(/custName[^a-zA-Z]{0,10}([A-Za-z][A-Za-z .'-]{2,60})/);
const custAddr = raw.match(/custAddress[^a-zA-Z0-9]{0,10}([0-9]{1,6}[^"\x00-\x1f]{5,80})/);
console.log("custName match", custName?.[1]?.slice(0, 40));
console.log("custAddr match", custAddr?.[1]?.slice(0, 60));

// Build best-effort snapshot from richest arrays
const topArrays = arrays.slice(0, Math.max(3, Math.min(25, arrays.length)));
const uniqueArrays = [];
const seen = new Set();
for (const a of topArrays) {
  const key = a.arr.join(",");
  if (!seen.has(key)) {
    seen.add(key);
    uniqueArrays.push(a.arr);
  }
}

const meters = uniqueArrays.map((monthlyKWh, i) => {
  const nums = [...meterNums];
  const num = nums[i] || nums[0] || "";
  const names = [...meterNames];
  const name = names[i] || (num ? `Meter ${num}` : `Meter ${String.fromCharCode(65 + i)}`);
  return {
    id: `meter-recovered-${i}-${Date.now()}`,
    name,
    meterNumber: num,
    account: "",
    monthlyKWh: monthlyKWh.map((v) => (v == null ? null : Number(v))),
    systemSizeKw: "",
    usageSavedAt: Date.now(),
    billText: "",
    billFileName: "",
    billFileNames: [],
    extracted: true,
  };
});

const snapshot = {
  v: 1,
  step: 0,
  custName: custName?.[1]?.trim() || "",
  custAddress: custAddr?.[1]?.trim().replace(/[\x00-\x1f]/g, "") || "",
  custEmail: "",
  custPhone: "",
  account: "",
  utilityName: "",
  prepBy: "Sean Simmons",
  prepEmail: "seansimmons@jantaus.com",
  prepPhone: "(214) 842-0659",
  billText: "",
  billFileName: "",
  billFileNames: [],
  billExtractNotice: "",
  monthlyKWh: meters.length === 1 ? meters[0].monthlyKWh : new Array(12).fill(null),
  ratePerKWh: "0.12",
  rateEsc: "3",
  productionOnlyMode: false,
  usageComparisonMode: false,
  multiMeterMode: meters.length > 1,
  meters: meters.length > 1 ? meters : [meters[0] || { id: "meter-recovered-0", name: "Meter A", meterNumber: "", monthlyKWh: new Array(12).fill(null), systemSizeKw: "", usageSavedAt: null }],
  activeMeterIdx: 0,
  usageMeterIdx: 0,
  extracted: false,
  region: "texas",
  systemSizeKw: "",
  pricingPerKW: "3000",
  selState: "TX",
};

if (uniqueArrays.length === 0) {
  console.error("Could not recover usage arrays");
  process.exit(1);
}

const out = path.join(process.cwd(), "recovered-proposal-snapshot.json");
fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
console.log("Wrote", out, "with", snapshot.meters.length, "meters, multi:", snapshot.multiMeterMode);
