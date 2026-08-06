import crypto from "crypto";
import { parseCookies } from "./cookies.js";
import { findUserById } from "./userStore.js";

export const SESSION_COOKIE_NAME = "janta_session";

const PERSISTENT_SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_SESSION_SECONDS = 60 * 60 * 12; // 12 hours

const sessions = new Map();

export function createSession(userId, { persistent = false } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const maxAgeSeconds = persistent ? PERSISTENT_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  sessions.set(token, { userId, expiresAt, persistent });
  return { token, expiresAt, maxAgeSeconds };
}

export function getSession(token) {
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return record;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export async function authenticateRequest(req, { dataDir }) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const record = getSession(token);
  if (!record) return null;
  const user = findUserById(dataDir, record.userId);
  if (!user) {
    destroySession(token);
    return null;
  }
  return { token, user };
}
