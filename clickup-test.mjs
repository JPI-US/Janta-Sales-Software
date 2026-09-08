#!/usr/bin/env node
// clickup-test.mjs — standalone ClickUp connection tester (no repo needed).
//
// USAGE
//   1) Get a personal token: ClickUp -> Settings -> Apps -> API Token (pk_...)
//   2) Find your list id (see DISCOVER below), then:
//
//   CLICKUP_TOKEN=pk_xxx CLICKUP_LIST_ID=901234567 node clickup-test.mjs
//   CLICKUP_TOKEN=pk_xxx CLICKUP_LIST_ID=901234567 node clickup-test.mjs --watch
//   CLICKUP_TOKEN=pk_xxx node clickup-test.mjs --discover        # find your list id
//
// Node 18+ (uses built-in fetch). Nothing to install.

const API = "https://api.clickup.com/api/v2";
const TOKEN = (process.env.CLICKUP_TOKEN || "").trim();
const LIST_ID = (process.env.CLICKUP_LIST_ID || "").trim();
const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const DISCOVER = args.includes("--discover");

if (!TOKEN) {
  console.error("\n  Missing CLICKUP_TOKEN.\n");
  console.error("  CLICKUP_TOKEN=pk_xxx CLICKUP_LIST_ID=xxx node clickup-test.mjs\n");
  process.exit(1);
}

// ClickUp auth header is the RAW token — no "Bearer" prefix.
async function cu(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: TOKEN } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("401 Unauthorized — check CLICKUP_TOKEN.");
  if (res.status === 404) throw new Error(`404 Not found — check the id in ${path}.`);
  if (res.status === 429) throw new Error("429 Rate limited — wait a minute and retry.");
  if (!res.ok) throw new Error(`${res.status}: ${data.err || JSON.stringify(data)}`);
  return data;
}

// ---- read a usable value out of a custom field (common types) -------------
function readCF(cf) {
  const { type, value, type_config: tc } = cf;
  if (value == null || value === "") return null;
  switch (type) {
    case "drop_down": {
      const opt = (tc?.options || []).find((o) => o.id === value || o.orderindex === value);
      return opt ? opt.name ?? opt.label ?? null : null;
    }
    case "labels": {
      const ids = Array.isArray(value) ? value : [value];
      return ids.map((id) => (tc?.options || []).find((o) => o.id === id)?.label).filter(Boolean).join(", ") || null;
    }
    case "users": {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((u) => u?.username || u?.email).filter(Boolean).join(", ") || null;
    }
    case "location": return value?.formatted_address || null;
    default: return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

// ---- default field map (edit to match YOUR field names) -------------------
const FIELD_MAP = {
  "customer name": "custName", "client": "custName", "account": "custName",
  "contact person": "custName",
  "address": "custAddress", "site address": "siteAddress",
  "email": "custEmail", "contact email": "custEmail",
  "phone": "custPhone", "contact phone": "custPhone",
  "utility": "utilityName",
  "system size": "systemSizeKw", "system size (kw)": "systemSizeKw",
};

function buildSeed(task) {
  const seed = { v: 1, proposalTitle: task.name, custName: task.name };
  for (const cf of task.custom_fields || []) {
    const key = FIELD_MAP[String(cf.name || "").trim().toLowerCase()];
    const val = readCF(cf);
    if (key && val != null) seed[key] = key === "systemSizeKw" ? String(val) : val;
  }
  return seed;
}

// ---- discovery: walk workspace -> spaces -> folders -> lists --------------
async function discover() {
  console.log("\nWorkspaces / Spaces / Folders / Lists (grab the List id you want):\n");
  const { teams = [] } = await cu("/team");
  for (const team of teams) {
    console.log(`WORKSPACE  ${team.name}   (team id ${team.id})`);
    const { spaces = [] } = await cu(`/team/${team.id}/space`);
    for (const space of spaces) {
      console.log(`  SPACE    ${space.name}`);
      const { folders = [] } = await cu(`/space/${space.id}/folder`);
      for (const folder of folders) {
        console.log(`    FOLDER ${folder.name}`);
        for (const list of folder.lists || []) {
          console.log(`      LIST ${list.name}   <-- list id ${list.id}`);
        }
      }
      const { lists = [] } = await cu(`/space/${space.id}/list`); // folderless
      for (const list of lists) {
        console.log(`    LIST   ${list.name}   <-- list id ${list.id}`);
      }
    }
  }
  console.log("\nRe-run with CLICKUP_LIST_ID set to the list id above.\n");
}

// ---- fetch + print tasks in the list --------------------------------------
async function fetchTasks() {
  const data = await cu(`/list/${encodeURIComponent(LIST_ID)}/task?include_closed=true&order_by=created&reverse=true`);
  return Array.isArray(data.tasks) ? data.tasks : [];
}

function printTask(t) {
  const created = new Date(Number(t.date_created)).toLocaleString();
  console.log(`\n• ${t.name}`);
  console.log(`    id:      ${t.id}`);
  console.log(`    status:  ${t.status?.status || "-"}`);
  console.log(`    created: ${created}`);
  const cfs = (t.custom_fields || []).filter((cf) => readCF(cf) != null);
  if (cfs.length) {
    console.log(`    custom fields:`);
    for (const cf of cfs) console.log(`      - "${cf.name}" = ${readCF(cf)}`);
  } else {
    console.log(`    custom fields: (none filled in)`);
  }
  console.log(`    -> proposal seed: ${JSON.stringify(buildSeed(t))}`);
}

async function main() {
  if (DISCOVER || !LIST_ID) {
    if (!LIST_ID) console.log("(No CLICKUP_LIST_ID set — running discovery.)");
    await discover();
    return;
  }

  if (!WATCH) {
    const tasks = await fetchTasks();
    console.log(`\nFetched ${tasks.length} task(s) from list ${LIST_ID}:`);
    tasks.forEach(printTask);
    console.log("");
    return;
  }

  // --watch: poll every 15s, print only newly-appeared tasks.
  const seen = new Set((await fetchTasks()).map((t) => t.id));
  console.log(`\nWatching list ${LIST_ID}. ${seen.size} existing task(s) ignored.`);
  console.log("Add a task in ClickUp — it should appear here within ~15s. Ctrl+C to stop.\n");
  setInterval(async () => {
    try {
      const tasks = await fetchTasks();
      for (const t of tasks) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          console.log(`\n=== NEW TASK DETECTED (${new Date().toLocaleTimeString()}) ===`);
          printTask(t);
        }
      }
    } catch (err) {
      console.warn(`  poll error: ${err.message}`);
    }
  }, 15000);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}\n`);
  process.exit(1);
});
