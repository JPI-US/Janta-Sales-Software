const STORAGE_KEY = "janta-email-studio-v2";
const STORAGE_VERSION = 4;
const COLLAPSE_POLICY_VERSION = 2;

let storageKey = "janta-email-studio-v2";
let persistHook = null;
let configuredAccountKey = null;

/** Scope storage to account and optionally sync to cloud on save. */
export function configureEmailStore({ accountKey, onPersist } = {}) {
  const nextKey = accountKey || null;
  if (accountKey) storageKey = `janta-email-studio-v3-${accountKey}`;
  persistHook = typeof onPersist === "function" ? onPersist : null;
  if (configuredAccountKey !== nextKey) {
    state = loadState();
    configuredAccountKey = nextKey;
  }
  listeners.forEach((fn) => fn(state));
}

/** Re-read localStorage into memory (e.g. after cloud hydrate dropped a newer local draft). */
export function reloadLocalState() {
  if (!configuredAccountKey) return;
  state = loadState();
  listeners.forEach((fn) => fn(state));
}

function pickRicherTemplate(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;
  const localBlocks = local.doc?.blocks?.length || 0;
  const cloudBlocks = cloud.doc?.blocks?.length || 0;
  if (localBlocks !== cloudBlocks) return localBlocks > cloudBlocks ? local : cloud;
  return (local.updatedAt || 0) >= (cloud.updatedAt || 0) ? local : cloud;
}

/** Replace in-memory state from cloud (custom templates only merged with builtins). */
export function hydrateEmailStore(raw) {
  if (!raw || typeof raw !== "object") return;
  const localCustom = state.templates.filter((t) => t.kind === "custom");
  const cloudState = migrateToV3(raw);
  const mergedById = new Map();
  for (const tpl of cloudState.templates) mergedById.set(tpl.id, tpl);
  for (const tpl of localCustom) {
    mergedById.set(tpl.id, pickRicherTemplate(tpl, mergedById.get(tpl.id)));
  }
  state = applyCollapsePolicy({
    ...cloudState,
    templates: mergeBuiltins([...mergedById.values()]),
  });
  persistLocalOnly();
  listeners.forEach((fn) => fn(state));
}

export function exportEmailStoreState() {
  return {
    version: STORAGE_VERSION,
    folders: state.folders,
    templates: state.templates.filter((t) => t.kind === "custom"),
    pins: state.pins,
    collapsed: [...state.collapsed],
    collapsePolicyVersion: state.collapsePolicyVersion || COLLAPSE_POLICY_VERSION,
    modules: state.modules || [],
  };
}

function allEmailCollapseKeys(folders = state.folders) {
  return [...folders.map((f) => f.id), "orphan", "__pins__"];
}

/** Folders stay collapsed unless the user explicitly expands them. */
function applyCollapsePolicy(target) {
  const next = { ...target };
  if ((next.collapsePolicyVersion || 0) < COLLAPSE_POLICY_VERSION) {
    next.collapsed = [...new Set([...(next.collapsed || []), ...allEmailCollapseKeys(next.folders)])];
    next.collapsePolicyVersion = COLLAPSE_POLICY_VERSION;
    return next;
  }
  return next;
}

const OLD_DC_FOLDER_IDS = new Set([
  "folder-dc",
  "folder-dc-outreach",
  "folder-dc-meetings",
  "folder-dc-proof",
]);

const BUILTIN_SEED = {
  folders: [{ id: "folder-templates", name: "Templates", parentId: null }],
  templates: [
    {
      id: "dc-cold-short",
      title: "Cold intro — short",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/data-center/cold-intro-short.html",
      txtUrl: "/email-studio/data-center/cold-intro-short.txt",
    },
    {
      id: "dc-cold-rich",
      title: "Cold intro — rich",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/data-center/cold-intro-rich.html",
      txtUrl: "/email-studio/data-center/cold-intro-rich.txt",
    },
    {
      id: "dc-follow-up",
      title: "Follow-up",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/data-center/follow-up.html",
      txtUrl: "/email-studio/data-center/follow-up.txt",
    },
    {
      id: "dc-meeting",
      title: "Meeting / site brief",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/data-center/meeting-request.html",
      txtUrl: "/email-studio/data-center/meeting-request.txt",
    },
    {
      id: "dc-case-study",
      title: "Case study / credibility",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/data-center/case-study.html",
      txtUrl: "/email-studio/data-center/case-study.txt",
    },
    {
      id: "nl-signal",
      title: "Newsletter — The Signal",
      folderId: "folder-templates",
      kind: "builtin",
      htmlUrl: "/email-studio/templates/newsletter-signal.html",
      txtUrl: null,
    },
  ],
  pins: [],
  collapsed: ["orphan", "__pins__", "folder-templates"],
  collapsePolicyVersion: COLLAPSE_POLICY_VERSION,
};

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function mergeBuiltins(saved) {
  const byId = new Map(saved.map((t) => [t.id, t]));
  for (const b of BUILTIN_SEED.templates) {
    if (!byId.has(b.id)) byId.set(b.id, structuredClone(b));
    else {
      const cur = byId.get(b.id);
      if (cur.kind === "builtin") {
        byId.set(b.id, { ...b, title: cur.title || b.title, folderId: b.folderId });
      }
    }
  }
  return [...byId.values()];
}

function migrateToV3(raw) {
  const seedFolders = structuredClone(BUILTIN_SEED.folders);
  const customFolders = (raw?.folders || []).filter(
    (f) => !OLD_DC_FOLDER_IDS.has(f.id) && f.id !== "folder-templates",
  );
  const folders = [...seedFolders, ...customFolders];
  const templates = mergeBuiltins(raw?.templates || []).map((t) => {
    if (t.kind === "builtin") return t;
    if (OLD_DC_FOLDER_IDS.has(t.folderId) || !t.folderId) {
      return { ...t, folderId: "folder-templates" };
    }
    return t;
  });
  return applyCollapsePolicy({
    folders,
    templates,
    pins: Array.isArray(raw?.pins) ? raw.pins : [],
    collapsed: Array.isArray(raw?.collapsed) ? raw.collapsed : [],
    collapsePolicyVersion: raw?.collapsePolicyVersion || 0,
    modules: Array.isArray(raw?.modules) ? raw.modules : [],
  });
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!raw || Number(raw.version) < STORAGE_VERSION) {
      return migrateToV3(raw);
    }
    return applyCollapsePolicy({
      folders: raw.folders?.length ? raw.folders : structuredClone(BUILTIN_SEED.folders),
      templates: mergeBuiltins(raw.templates || []),
      pins: Array.isArray(raw.pins) ? raw.pins : [],
      collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : [],
      collapsePolicyVersion: raw.collapsePolicyVersion || 0,
      modules: Array.isArray(raw.modules) ? raw.modules : [],
    });
  } catch {
    return { ...structuredClone(BUILTIN_SEED), modules: [] };
  }
}

let state = loadState();
const listeners = new Set();

function persistLocalOnly() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: STORAGE_VERSION,
      folders: state.folders,
      templates: state.templates,
      pins: state.pins,
      collapsed: [...state.collapsed],
      collapsePolicyVersion: state.collapsePolicyVersion || COLLAPSE_POLICY_VERSION,
      modules: state.modules || [],
    }),
  );
}

function persist() {
  persistLocalOnly();
  listeners.forEach((fn) => fn(state));
  if (persistHook) {
    try {
      persistHook(exportEmailStoreState());
    } catch {
      // ignore sync errors; local copy remains
    }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function getFolder(id) {
  return state.folders.find((f) => f.id === id);
}

export function getTemplate(id) {
  return state.templates.find((t) => t.id === id);
}

export function listRootFolders() {
  return state.folders.filter((f) => !f.parentId).sort((a, b) => a.name.localeCompare(b.name));
}

export function listChildFolders(parentId) {
  return state.folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listTemplatesInFolder(folderId) {
  return state.templates
    .filter((t) => t.folderId === folderId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function folderPath(folderId) {
  const parts = [];
  let cur = getFolder(folderId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? getFolder(cur.parentId) : null;
  }
  return parts;
}

export function countInFolder(folderId) {
  let n = listTemplatesInFolder(folderId).length;
  for (const child of listChildFolders(folderId)) n += countInFolder(child.id);
  return n;
}

export function isPinned(id) {
  return state.pins.includes(id);
}

export function toggleCollapsed(id) {
  const set = new Set(state.collapsed);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state.collapsed = [...set];
  persist();
}

export function isCollapsed(id) {
  return state.collapsed.includes(id);
}

export function pinItem(id) {
  if (!state.pins.includes(id)) {
    state.pins = [id, ...state.pins];
    persist();
  }
}

export function unpinItem(id) {
  state.pins = state.pins.filter((p) => p !== id);
  persist();
}

export function togglePin(id) {
  if (isPinned(id)) unpinItem(id);
  else pinItem(id);
}

export function moveTemplate(templateId, folderId) {
  const t = getTemplate(templateId);
  const folder = getFolder(folderId);
  if (!t || !folder) return;
  t.folderId = folderId;
  persist();
}

export function createFolder({ name, parentId = null }) {
  const folder = { id: uid("folder"), name: name.trim() || "New folder", parentId };
  state.folders.push(folder);
  if (!state.collapsed.includes(folder.id)) {
    state.collapsed = [...state.collapsed, folder.id];
  }
  persist();
  return folder;
}

export function renameFolder(id, name) {
  const f = getFolder(id);
  if (!f) return;
  f.name = name.trim() || f.name;
  persist();
}

export function deleteFolder(id) {
  const kids = listChildFolders(id);
  if (kids.length || listTemplatesInFolder(id).length) return false;
  state.folders = state.folders.filter((f) => f.id !== id);
  state.pins = state.pins.filter((p) => p !== id);
  persist();
  return true;
}

/** Collect folder id + all descendant folder ids */
export function collectFolderTreeIds(rootId) {
  const ids = [rootId];
  for (const child of listChildFolders(rootId)) {
    ids.push(...collectFolderTreeIds(child.id));
  }
  return ids;
}

/**
 * Delete folder. If recursive, remove nested folders;
 * custom templates inside are deleted; builtins move to parent (or first root).
 */
export function deleteFolderDeep(id, { recursive = false } = {}) {
  const folder = getFolder(id);
  if (!folder) return { ok: false, reason: "missing" };

  const childFolders = listChildFolders(id);
  const templatesHere = listTemplatesInFolder(id);
  if (!recursive && (childFolders.length || templatesHere.length)) {
    return { ok: false, reason: "not-empty" };
  }

  const fallbackParent = folder.parentId;
  const fallbackRoot = listRootFolders().find((f) => f.id !== id)?.id || null;
  const moveTo = fallbackParent || fallbackRoot;

  const treeIds = new Set(collectFolderTreeIds(id));

  for (const t of [...state.templates]) {
    if (!treeIds.has(t.folderId)) continue;
    if (t.kind === "builtin") {
      if (moveTo) t.folderId = moveTo;
    } else {
      state.templates = state.templates.filter((x) => x.id !== t.id);
      state.pins = state.pins.filter((p) => p !== t.id);
    }
  }

  state.folders = state.folders.filter((f) => !treeIds.has(f.id));
  state.pins = state.pins.filter((p) => !treeIds.has(p));
  persist();
  return { ok: true };
}

export function moveFolder(folderId, newParentId) {
  const folder = getFolder(folderId);
  if (!folder) return false;
  if (newParentId === folderId) return false;
  if (newParentId) {
    const destTree = collectFolderTreeIds(folderId);
    if (destTree.includes(newParentId)) return false; // can't nest into self
    if (!getFolder(newParentId)) return false;
  }
  folder.parentId = newParentId || null;
  persist();
  return true;
}

/** @type {{ type: "folder", id: string, mode: "copy" | "cut" } | null} */
let clipboard = null;

export function getClipboard() {
  return clipboard;
}

export function cutFolder(id) {
  if (!getFolder(id)) return false;
  clipboard = { type: "folder", id, mode: "cut" };
  return true;
}

export function copyFolder(id) {
  if (!getFolder(id)) return false;
  clipboard = { type: "folder", id, mode: "copy" };
  return true;
}

export function clearClipboard() {
  clipboard = null;
}

function cloneTemplateInto(template, folderId) {
  if (template.kind === "builtin") {
    // builtins are shared — point a copy isn't meaningful; skip
    return null;
  }
  const copy = {
    ...structuredClone(template),
    id: uid("tpl"),
    folderId,
    title: `${template.title} copy`,
    updatedAt: Date.now(),
  };
  state.templates.push(copy);
  return copy;
}

function deepCopyFolder(sourceId, parentId) {
  const source = getFolder(sourceId);
  if (!source) return null;
  const created = {
    id: uid("folder"),
    name: `${source.name} copy`,
    parentId,
  };
  state.folders.push(created);
  if (!state.collapsed.includes(created.id)) {
    state.collapsed = [...state.collapsed, created.id];
  }
  for (const t of listTemplatesInFolder(sourceId)) {
    cloneTemplateInto(t, created.id);
  }
  for (const child of listChildFolders(sourceId)) {
    deepCopyFolder(child.id, created.id);
  }
  return created;
}

/** Paste clipboard folder as child of targetFolderId (null = top level) */
export function pasteFolder(targetFolderId = null) {
  if (!clipboard || clipboard.type !== "folder") return null;
  const source = getFolder(clipboard.id);
  if (!source) {
    clipboard = null;
    return null;
  }

  if (clipboard.mode === "cut") {
    const ok = moveFolder(clipboard.id, targetFolderId);
    clipboard = null;
    persist();
    return ok ? getFolder(source.id) : null;
  }

  // copy
  const created = deepCopyFolder(clipboard.id, targetFolderId);
  persist();
  return created;
}

import { buildPresetDoc } from "./presets.js";
import { enableGridLayout } from "./grid.js";

export function emptyDoc(title = "Untitled email") {
  return buildPresetDoc("blank", title);
}

export function createTemplate({ title, folderId, preset = "blank" }) {
  const doc = buildPresetDoc(preset, title.trim() || "Untitled email");
  enableGridLayout(doc, { growCanvas: true });

  const template = {
    id: uid("tpl"),
    title: title.trim() || "Untitled email",
    folderId,
    kind: "custom",
    doc,
    attachments: doc.blocks.find((b) => b.type === "attachments")?.items || [],
    updatedAt: Date.now(),
    presetId: preset,
  };
  state.templates.push(template);
  persist();
  return template;
}

export function updateTemplate(id, patch) {
  const t = getTemplate(id);
  if (!t) return;
  Object.assign(t, patch, { updatedAt: Date.now() });
  persist();
}

export function deleteTemplate(id) {
  const t = getTemplate(id);
  if (!t || t.kind === "builtin") return false;
  state.templates = state.templates.filter((x) => x.id !== id);
  state.pins = state.pins.filter((p) => p !== id);
  persist();
  return true;
}

/** Duplicate a custom draft, or clone a built-in into an editable copy. */
export function duplicateTemplate(id) {
  const t = getTemplate(id);
  if (!t) return null;
  if (t.kind === "builtin") return duplicateBuiltinAsCustom(id);
  const copy = {
    id: uid("tpl"),
    title: `${t.title} (copy)`,
    folderId: t.folderId,
    kind: "custom",
    doc: structuredClone(t.doc),
    attachments: structuredClone(t.attachments || []),
    updatedAt: Date.now(),
    presetId: t.presetId,
    sourceBuiltinId: t.sourceBuiltinId,
  };
  state.templates.push(copy);
  persist();
  return copy;
}

function block(type, props = {}) {
  return { id: uid("block"), type, align: "left", ...props };
}

/** Editable segment docs approximating each built-in template */
function builtinEditableDoc(builtinId, title) {
  const docs = {
    "dc-cold-short": {
      subject: "{{Company}} + denser on-site solar without the acreage",
      preheader: "3D solar towers for land-tight data campuses",
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "Data center",
          heading: "Denser on-site solar without the acreage",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "Hi {{FirstName}},<br><br>Data centers rarely have spare acres for flat solar—but they do need denser, dispatchable-friendly clean power next to load.<br><br>Janta Power builds sun-tracking 3D solar towers that deliver about <strong>50% more energy</strong> and roughly <strong>3× power per unit area</strong> versus traditional arrays—designed for land-constrained commercial and industrial sites.<br><br>Worth a brief look for {{Company}}’s campus or next build?",
        }),
        block("button", { label: "Explore Janta Power", href: "https://jantaus.com/" }),
        block("text", {
          html: "Happy to share a one-page site brief or hop on a 15-minute call.<br><br>Best,<br>{{YourName}}<br>{{YourTitle}} · Janta Power",
        }),
      ],
    },
    "dc-cold-rich": {
      subject: "More power per acre for {{Company}}",
      preheader: "~50% more energy · 3× power per unit area",
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "Data center outreach",
          heading: "More power. Less land.",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "Hi {{FirstName}},<br><br>When campuses can’t spare acres for flat solar, vertical density is how you still put meaningful generation next to load.",
        }),
        block("metrics", {
          align: "center",
          items: [
            { value: "~50%", label: "More energy" },
            { value: "3×", label: "Power / area" },
            { value: "~34%", label: "Capacity factor" },
          ],
        }),
        block("callout", {
          html: "Built for land-constrained commercial &amp; industrial sites—including data campuses where interconnection and footprint both matter.",
          accent: "#3a84dc",
          calloutBg: "#f4f7fa",
        }),
        block("button", { label: "See Janta Power", href: "https://jantaus.com/" }),
        block("text", {
          html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}}",
        }),
      ],
    },
    "dc-follow-up": {
      subject: "Following up — on-site solar density for {{Company}}",
      preheader: "Quick follow-up on denser power for constrained parcels",
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "Follow-up",
          heading: "Circling back on power density",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "Hi {{FirstName}},<br><br>Following up on denser on-site solar for {{Company}}. Happy to send a one-page site brief or book 15 minutes if useful.<br><br>Janta’s 3D towers: ~50% more energy and ~3× power per unit area vs traditional arrays.",
        }),
        block("button", { label: "Book a call", href: "{{CalendarLink}}" }),
        block("text", { html: "{{YourName}} · Janta Power<br>{{YourEmail}}" }),
      ],
    },
    "dc-meeting": {
      subject: "20 minutes on on-site solar density for {{Company}}",
      preheader: "Site brief walkthrough for land-tight campuses",
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "Site brief",
          heading: "20 minutes on power density for {{Company}}",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "Hi {{FirstName}},<br><br>I’d like to walk your team through how Janta’s sun-tracking 3D solar towers could fit a data campus where land and interconnection options are tight.",
        }),
        block("list", {
          items: [
            "Where 3D towers beat flat arrays on constrained parcels",
            "Proof points (~50% more energy, ~3× power/area)",
            "Next step: a lightweight site brief for {{Company}}",
          ],
        }),
        block("button", { label: "Schedule a call", href: "{{CalendarLink}}" }),
        block("text", {
          html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}} · (469) 694-3818",
        }),
      ],
    },
    "dc-case-study": {
      subject: "Infrastructure proof point — Munich Airport × Janta Power",
      preheader: "Pilot proof for land-constrained campuses",
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "Proof",
          heading: "Built for land-constrained infrastructure",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "Hi {{FirstName}},<br><br>Sharing a proof point that maps well to data campus constraints: <strong>Munich Airport</strong> and Janta Power are piloting a three-dimensional energy production solution—where footprint, operations, and reliability all matter.<br><br>Same story for {{Company}}: if flat solar can’t compete for land on campus, vertical density becomes the path to meaningful on-site generation.",
        }),
        block("callout", {
          html: "Also in market: Greentown Labs · airport innovation recognition · coverage via PV Magazine and industry press.",
          accent: "#3a84dc",
          calloutBg: "#f4f7fa",
        }),
        block("button", { label: "See Janta Power", href: "https://jantaus.com/" }),
        block("text", {
          html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}}",
        }),
      ],
    },
    "nl-signal": {
      subject: "The Signal — More power. Less land.",
      preheader: "Janta Power newsletter · density, proof, and what’s next",
      canvasWidth: 600,
      blocks: [
        block("header", {
          showLogo: true,
          eyebrow: "The Signal · Newsletter",
          heading: "More power. Less land.",
          bgColor: "#1a2332",
          bgOpacity: 100,
        }),
        block("text", {
          html: "<p style=\"margin:0;font-size:13px;color:#5a6a7a;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;\">Issue 01 · From Dallas</p><p style=\"margin:14px 0 0;\">The grid is getting hungrier. Land is not. This is how Janta stacks generation upward—and what it means for campuses that can’t spare acres for flat arrays.</p>",
        }),
        block("image", {
          align: "center",
          src: "https://jantaus.com/marketing/vision-banner.png",
          alt: "Janta Power three-dimensional solar towers",
          caption: "Sun-tracking 3D towers — generation that climbs, not sprawls.",
          width: 536,
          layout: "full",
        }),
        block("metrics", {
          align: "center",
          items: [
            { value: "~50%", label: "More energy" },
            { value: "3×", label: "Power / area" },
            { value: "~34%", label: "Capacity factor" },
          ],
        }),
        block("text", {
          html: "<p style=\"margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3a84dc;\">Feature</p><p style=\"margin:0 0 10px;font-size:20px;font-weight:700;line-height:1.25;color:#1a2332;\">Density is the new acreage</p><p style=\"margin:0;\">When parking, cooling, and future halls eat the parcel, traditional solar loses the land fight before interconnection even starts. Janta’s towers track the sun and stack harvest vertically—so constrained commercial and industrial sites can still put meaningful clean capacity next to load.</p>",
        }),
        block("columns", {
          left: "<p style=\"margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#3a84dc;\">In the field</p><p style=\"margin:0;\"><strong>Munich Airport</strong> is piloting three-dimensional energy production with Janta—proof that footprint-sensitive infrastructure can still host serious generation.</p>",
          right: "<p style=\"margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#3a84dc;\">Why it matters</p><p style=\"margin:0;\">Airports, data campuses, and industrial yards share one constraint: <em>space</em>. Vertical density turns that constraint into a design input—not a hard stop.</p>",
        }),
        block("callout", {
          html: "“More energy per square foot isn’t a nice-to-have—it’s the only way land-tight sites keep clean power on the roadmap.”",
          accent: "#3a84dc",
          calloutBg: "#f4f7fa",
        }),
        block("list", {
          items: [
            "Where 3D towers beat flat arrays on constrained parcels",
            "Proof points you can share with facilities &amp; energy teams",
            "How to request a lightweight site brief for {{Company}}",
          ],
        }),
        block("button", {
          label: "Explore Janta Power",
          href: "https://jantaus.com/",
          buttonColor: "#3a84dc",
          buttonTextColor: "#ffffff",
        }),
        block("divider", { color: "#d8dee6" }),
        block("text", {
          html: "<p style=\"margin:0;font-size:13px;color:#5a6a7a;\">You’re receiving <em>The Signal</em> because you work on energy, infrastructure, or campus planning. Reply anytime—or forward to a colleague who owns the parcel math.</p><p style=\"margin:16px 0 0;\">{{YourName}}<br>{{YourTitle}} · Janta Power<br><a href=\"mailto:{{YourEmail}}\">{{YourEmail}}</a> · (469) 694-3818</p>",
        }),
      ],
    },
  };
  return docs[builtinId] || emptyDoc(title);
}

/**
 * Clone a built-in into an editable custom draft in the same folder.
 */
export function duplicateBuiltinAsCustom(builtinId) {
  const t = getTemplate(builtinId);
  if (!t || t.kind !== "builtin") return null;
  const doc = structuredClone(builtinEditableDoc(t.id, t.title));
  enableGridLayout(doc, { growCanvas: true });
  const template = {
    id: uid("tpl"),
    title: `${t.title} (copy)`,
    folderId: t.folderId,
    kind: "custom",
    doc,
    attachments: [],
    updatedAt: Date.now(),
    sourceBuiltinId: t.id,
  };
  state.templates.push(template);
  persist();
  return template;
}

export function listModules() {
  return [...(state.modules || [])].sort((a, b) => a.name.localeCompare(b.name));
}

export function saveModule({ name, block }) {
  const mod = {
    id: uid("mod"),
    name: (name || labelModule(block)).trim() || "Saved section",
    block: structuredClone({ ...block, id: uid("block") }),
    createdAt: Date.now(),
  };
  state.modules = state.modules || [];
  state.modules.push(mod);
  persist();
  return mod;
}

export function deleteModule(id) {
  state.modules = (state.modules || []).filter((m) => m.id !== id);
  persist();
}

export function getModule(id) {
  return (state.modules || []).find((m) => m.id === id);
}

function labelModule(block) {
  const map = {
    header: "Header",
    text: "Text",
    image: "Image",
    button: "Button",
    metrics: "Metrics",
    columns: "Columns",
    callout: "Callout",
    list: "List",
    divider: "Divider",
    spacer: "Spacer",
    custom: "Custom",
    attachments: "Files",
  };
  return map[block?.type] || "Section";
}

export function listAllFoldersFlat() {
  const out = [];
  function walk(parentId, depth) {
    const nodes = state.folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) {
      out.push({ ...n, depth, label: `${"— ".repeat(depth)}${n.name}` });
      walk(n.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export { uid };
