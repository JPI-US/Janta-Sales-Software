import path from "path";
import { fileURLToPath } from "url";
import { readJson, writeJson } from "../httpUtils.js";
import { hashPassword } from "./passwords.js";
import { uniqueUsernameFromDisplayName, defaultUsernameFromEmail } from "../../shared/authUsername.js";
import { normalizeRole, ROLE_ADMIN } from "../../shared/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_AUTH_DATA_DIR = path.resolve(__dirname, "../../data/auth");

function usersPath(dataDir) {
  return path.join(dataDir, "users.json");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function listUsers(dataDir) {
  const store = readJson(usersPath(dataDir), { users: [] });
  return Array.isArray(store.users) ? store.users : [];
}

function saveUsers(dataDir, users) {
  writeJson(usersPath(dataDir), { users });
}

export function listPublicUsers(dataDir) {
  return listUsers(dataDir).map(toPublicUser);
}

export function findUserById(dataDir, id) {
  if (!id) return null;
  return listUsers(dataDir).find((u) => u.id === id) || null;
}

export function findUserByEmail(dataDir, email) {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  return listUsers(dataDir).find((u) => normalizeEmail(u.email) === clean) || null;
}

export function findUserByLoginId(dataDir, loginId) {
  const id = String(loginId || "").trim().toLowerCase();
  if (!id) return null;
  return (
    listUsers(dataDir).find(
      (u) => normalizeEmail(u.email) === id || String(u.username || "").toLowerCase() === id
    ) || null
  );
}

export async function createUser(dataDir, {
  name,
  email,
  password,
  isAdmin = false,
  role,
  protected: isProtected = false,
  mustChangePassword = false,
}) {
  const users = listUsers(dataDir);
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new Error("Email is required");
  if (users.some((u) => normalizeEmail(u.email) === cleanEmail)) {
    throw new Error("A user with that email already exists");
  }
  const passwordHash = await hashPassword(password);
  const username = uniqueUsernameFromDisplayName(name || defaultUsernameFromEmail(cleanEmail), cleanEmail, users);
  const nextRole = normalizeRole(role || (isAdmin ? ROLE_ADMIN : null));
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: String(name || "").trim() || cleanEmail,
    username,
    email: cleanEmail,
    passwordHash,
    role: nextRole,
    isAdmin: nextRole === ROLE_ADMIN,
    protected: Boolean(isProtected),
    mustChangePassword: Boolean(mustChangePassword),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  users.push(record);
  saveUsers(dataDir, users);
  return toPublicUser(record);
}

export function updateUserFields(dataDir, id, patch) {
  const users = listUsers(dataDir);
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  const next = { ...users[idx], ...patch };
  if (patch.role != null) {
    next.role = normalizeRole(patch.role);
    next.isAdmin = next.role === ROLE_ADMIN;
  } else if (patch.isAdmin != null) {
    next.role = patch.isAdmin ? ROLE_ADMIN : normalizeRole(next.role) === ROLE_ADMIN ? "sales" : normalizeRole(next.role);
    next.isAdmin = next.role === ROLE_ADMIN;
  } else {
    next.role = normalizeRole(next);
    next.isAdmin = next.role === ROLE_ADMIN;
  }
  users[idx] = next;
  saveUsers(dataDir, users);
  return toPublicUser(next);
}

/**
 * Set a password. `mustChangePassword` defaults to false so a user changing their
 * own password clears the flag; admin-issued temporary passwords pass true.
 */
export async function setUserPassword(dataDir, id, newPassword, { mustChangePassword = false } = {}) {
  const users = listUsers(dataDir);
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  const passwordHash = await hashPassword(newPassword);
  users[idx] = { ...users[idx], passwordHash, mustChangePassword: Boolean(mustChangePassword) };
  saveUsers(dataDir, users);
  return toPublicUser(users[idx]);
}

export function deleteUser(dataDir, id) {
  const users = listUsers(dataDir);
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  saveUsers(dataDir, next);
  return true;
}

export function toPublicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  const role = normalizeRole(rest);
  return { ...rest, role, isAdmin: role === ROLE_ADMIN, mustChangePassword: Boolean(rest.mustChangePassword) };
}
