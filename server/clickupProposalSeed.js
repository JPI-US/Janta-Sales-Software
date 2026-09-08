// server/clickupProposalSeed.js
//
// Turns a ClickUp deal task (and optional linked contact task) into a proposal
// `snapshot` seed. Snapshot keys match src/jantaProposalPersistence.js.
// Field mapping is configured in server/clickup.config.json (case-insensitive).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SNAPSHOT_VERSION } from "../src/proposalSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deal-task custom field -> snapshot key. Contact Person is mapped straight to
// custName per current data plan (real contact data will live there at runtime).
const DEFAULT_FIELD_MAP = {
  "contact person": "custName",
  "project size (kw)": "systemSizeKw",
  "system size (kw)": "systemSizeKw",
  "system size": "systemSizeKw",
  utility: "utilityName",
  "utility name": "utilityName",
  "site address": "siteAddress",
  address: "custAddress",
  email: "custEmail",
  phone: "custPhone",
};

const DEFAULT_CONTACT_FIELD_MAP = {
  email: "custEmail",
  "contact email": "custEmail",
  phone: "custPhone",
  "contact phone": "custPhone",
  address: "custAddress",
  "mailing address": "custAddress",
  name: "custName",
};

function loadConfig() {
  const configPath = path.join(__dirname, "clickup.config.json");
  let cfg = {};
  if (fs.existsSync(configPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      /* ignore bad config */
    }
  }
  const lower = (obj) =>
    Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
  return {
    fieldMap: { ...DEFAULT_FIELD_MAP, ...lower(cfg.fieldMap) },
    contactFieldMap: { ...DEFAULT_CONTACT_FIELD_MAP, ...lower(cfg.contactFieldMap) },
    contactRelationField: cfg.contactRelationField || null,
    contactNameFromTaskName: cfg.contactNameFromTaskName !== false,
  };
}

function readCustomFieldValue(cf) {
  if (!cf) return null;
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
    case "location":
      return value?.formatted_address || null;
    case "number":
    case "currency":
      return value;
    default:
      return typeof value === "object" ? null : String(value);
  }
}

export function contactRelationField() {
  return loadConfig().contactRelationField;
}

export function findLinkedContactId(task, relationFieldName) {
  if (!relationFieldName) return null;
  const cf = (task?.custom_fields || []).find(
    (f) => String(f.name || "").trim().toLowerCase() === String(relationFieldName).trim().toLowerCase()
  );
  if (!cf || cf.value == null) return null;
  const first = Array.isArray(cf.value) ? cf.value[0] : cf.value;
  if (!first) return null;
  return typeof first === "object" ? first.id || null : String(first);
}

function mapFieldsInto(seed, task, map) {
  for (const cf of task?.custom_fields || []) {
    const key = map[String(cf.name || "").trim().toLowerCase()];
    if (!key) continue;
    const val = readCustomFieldValue(cf);
    if (val == null || val === "") continue;
    seed[key] = key === "systemSizeKw" ? String(val) : val;
  }
}

export function buildProposalSeedFromTask(task, { preparedBy = null, contactTask = null } = {}) {
  const cfg = loadConfig();
  const seed = { v: SNAPSHOT_VERSION };

  const title = String(task?.name || "").trim();
  if (title) seed.proposalTitle = title;

  mapFieldsInto(seed, task, cfg.fieldMap);

  if (contactTask) {
    if (cfg.contactNameFromTaskName && contactTask.name) seed.custName = String(contactTask.name).trim();
    mapFieldsInto(seed, contactTask, cfg.contactFieldMap);
  }

  if (preparedBy) {
    if (preparedBy.name) seed.prepBy = preparedBy.name;
    if (preparedBy.email) seed.prepEmail = preparedBy.email;
    if (preparedBy.phone) seed.prepPhone = preparedBy.phone;
  }

  return seed;
}
