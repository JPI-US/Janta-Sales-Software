const FOLDERS_PREFIX = "janta_proposal_folders_v1_";
const ASSIGN_PREFIX = "janta_proposal_folder_assign_v1_";
const COLLAPSED_PREFIX = "janta_proposal_table_collapsed_v1_";
const COLLAPSE_POLICY_PREFIX = "janta_proposal_collapse_policy_v1_";
const COLLAPSE_POLICY_VERSION = 1;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listProposalFolders(userId) {
  if (!userId) return [];
  const rows = readJson(`${FOLDERS_PREFIX}${userId}`, []);
  return Array.isArray(rows)
    ? rows.filter((f) => f?.id && f?.name).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    : [];
}

function readAssignments(userId) {
  if (!userId) return {};
  const raw = readJson(`${ASSIGN_PREFIX}${userId}`, {});
  return raw && typeof raw === "object" ? raw : {};
}

function writeAssignments(userId, map) {
  if (!userId) return;
  writeJson(`${ASSIGN_PREFIX}${userId}`, map);
}

export function getProposalFolderId(userId, proposalId) {
  if (!userId || !proposalId) return null;
  const fid = readAssignments(userId)[proposalId];
  if (!fid) return null;
  return listProposalFolders(userId).some((f) => f.id === fid) ? fid : null;
}

export function assignProposalToFolder(userId, proposalId, folderId) {
  if (!userId || !proposalId) return;
  const map = readAssignments(userId);
  if (!folderId) delete map[proposalId];
  else map[proposalId] = folderId;
  writeAssignments(userId, map);
}

export function createProposalFolder(userId, name) {
  if (!userId) return null;
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const folder = { id: `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: trimmed };
  const folders = listProposalFolders(userId);
  folders.push(folder);
  writeJson(`${FOLDERS_PREFIX}${userId}`, folders);
  const collapsed = new Set(readProposalTableCollapsed(userId));
  collapsed.add(folderTableKey(folder.id));
  writeProposalTableCollapsed(userId, [...collapsed]);
  return folder;
}

export function renameProposalFolder(userId, folderId, name) {
  if (!userId || !folderId) return false;
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  const folders = listProposalFolders(userId);
  const idx = folders.findIndex((f) => f.id === folderId);
  if (idx < 0) return false;
  folders[idx] = { ...folders[idx], name: trimmed };
  writeJson(`${FOLDERS_PREFIX}${userId}`, folders);
  return true;
}

export function deleteProposalFolder(userId, folderId) {
  if (!userId || !folderId) return false;
  const folders = listProposalFolders(userId).filter((f) => f.id !== folderId);
  writeJson(`${FOLDERS_PREFIX}${userId}`, folders);
  const map = readAssignments(userId);
  for (const [pid, fid] of Object.entries(map)) {
    if (fid === folderId) delete map[pid];
  }
  writeAssignments(userId, map);
  const collapsed = readProposalTableCollapsed(userId).filter((k) => k !== folderTableKey(folderId));
  writeProposalTableCollapsed(userId, collapsed);
  return true;
}

export function folderTableKey(folderId) {
  return folderId ? `folder:${folderId}` : "uncategorized";
}

function readProposalTableCollapsed(userId) {
  if (!userId) return [];
  applyProposalCollapsePolicy(userId);
  const rows = readJson(`${COLLAPSED_PREFIX}${userId}`, []);
  return Array.isArray(rows) ? rows : [];
}

function applyProposalCollapsePolicy(userId) {
  if (!userId) return;
  const policyKey = `${COLLAPSE_POLICY_PREFIX}${userId}`;
  if (readJson(policyKey, 0) >= COLLAPSE_POLICY_VERSION) return;
  const keys = listProposalFolders(userId).map((f) => folderTableKey(f.id));
  keys.push(folderTableKey(null), "closed");
  const set = new Set(readJson(`${COLLAPSED_PREFIX}${userId}`, []));
  for (const key of keys) set.add(key);
  writeProposalTableCollapsed(userId, [...set]);
  writeJson(policyKey, COLLAPSE_POLICY_VERSION);
}

function writeProposalTableCollapsed(userId, keys) {
  if (!userId) return;
  writeJson(`${COLLAPSED_PREFIX}${userId}`, [...new Set(keys)]);
}

export function isProposalTableCollapsed(userId, key) {
  return readProposalTableCollapsed(userId).includes(key);
}

export function toggleProposalTableCollapsed(userId, key) {
  if (!userId || !key) return;
  const set = new Set(readProposalTableCollapsed(userId));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  writeProposalTableCollapsed(userId, [...set]);
}

export function groupProposalsByFolder(userId, proposals) {
  const folders = listProposalFolders(userId);
  const groups = new Map(folders.map((f) => [f.id, []]));
  const uncategorized = [];
  for (const p of proposals || []) {
    const fid = getProposalFolderId(userId, p.id);
    if (fid && groups.has(fid)) groups.get(fid).push(p);
    else uncategorized.push(p);
  }
  return { folders, groups, uncategorized };
}
