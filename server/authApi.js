import { readBody, send } from "./httpUtils.js";
import {
  DEFAULT_AUTH_DATA_DIR,
  findUserByLoginId,
  findUserById,
  createUser,
  updateUserFields,
  setUserPassword,
  deleteUser,
  listPublicUsers,
  toPublicUser,
} from "./auth/userStore.js";
import { verifyPassword } from "./auth/passwords.js";
import { createSession, destroySession, authenticateRequest, SESSION_COOKIE_NAME } from "./auth/sessions.js";
import { serializeCookie } from "./auth/cookies.js";
import { ensureBootstrapAdmin } from "./auth/bootstrapAdmin.js";

function cookieSecure() {
  return String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
}

function setSessionCookie(res, token, maxAgeSeconds, persistent) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, token, {
      maxAgeSeconds: persistent ? maxAgeSeconds : undefined,
      secure: cookieSecure(),
      sameSite: "Lax",
      httpOnly: true,
    })
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", { maxAgeSeconds: 0, secure: cookieSecure(), sameSite: "Lax", httpOnly: true })
  );
}

export function createAuthApiHandler({ dataDir = DEFAULT_AUTH_DATA_DIR } = {}) {
  const bootstrapPromise = ensureBootstrapAdmin(dataDir).catch((err) => {
    console.error("[auth] bootstrap admin failed:", err.message);
  });

  return async function authApiHandler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/auth/")) return next();

    await bootstrapPromise;

    try {
      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        const body = await readBody(req);
        const loginId = String(body?.loginId || "").trim();
        const password = String(body?.password || "");
        const remember = Boolean(body?.remember);
        const user = loginId ? findUserByLoginId(dataDir, loginId) : null;
        const valid = user ? await verifyPassword(password, user.passwordHash) : false;
        if (!user || !valid) {
          return send(res, 401, { error: "Invalid username/email or password." });
        }
        const { token, maxAgeSeconds } = createSession(user.id, { persistent: remember });
        setSessionCookie(res, token, maxAgeSeconds, remember);
        const updated = updateUserFields(dataDir, user.id, { lastLoginAt: new Date().toISOString() });
        return send(res, 200, { user: updated || toPublicUser(user) });
      }

      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        const session = await authenticateRequest(req, { dataDir });
        if (session) destroySession(session.token);
        clearSessionCookie(res);
        return send(res, 200, { ok: true });
      }

      const session = await authenticateRequest(req, { dataDir });

      if (url.pathname === "/api/auth/me" && req.method === "GET") {
        if (!session) return send(res, 401, { error: "Authentication required" });
        return send(res, 200, { user: toPublicUser(session.user) });
      }

      if (!session) return send(res, 401, { error: "Authentication required" });

      if (url.pathname === "/api/auth/me/email" && req.method === "PATCH") {
        const body = await readBody(req);
        const currentEmail = String(body?.currentEmail || "").trim().toLowerCase();
        const newEmail = String(body?.newEmail || "").trim().toLowerCase();
        const currentPassword = String(body?.currentPassword || "");
        if (currentEmail !== String(session.user.email || "").toLowerCase()) {
          return send(res, 400, { error: "Current email does not match." });
        }
        if (!(await verifyPassword(currentPassword, (findUserById(dataDir, session.user.id) || {}).passwordHash))) {
          return send(res, 400, { error: "Current password is incorrect." });
        }
        if (!newEmail || !newEmail.includes("@")) {
          return send(res, 400, { error: "Enter a valid email." });
        }
        const clash = listPublicUsers(dataDir).find(
          (u) => u.id !== session.user.id && String(u.email || "").toLowerCase() === newEmail
        );
        if (clash) return send(res, 400, { error: "That email is already in use." });
        const updated = updateUserFields(dataDir, session.user.id, { email: newEmail });
        return send(res, 200, { user: updated });
      }

      if (url.pathname === "/api/auth/me/password" && req.method === "PATCH") {
        const body = await readBody(req);
        const currentPassword = String(body?.currentPassword || "");
        const newPassword = String(body?.newPassword || "");
        const full = findUserById(dataDir, session.user.id);
        if (!(await verifyPassword(currentPassword, full?.passwordHash))) {
          return send(res, 400, { error: "Current password is incorrect." });
        }
        if (newPassword.length < 6) {
          return send(res, 400, { error: "New password must be at least 6 characters." });
        }
        const updated = await setUserPassword(dataDir, session.user.id, newPassword);
        return send(res, 200, { user: updated });
      }

      if (url.pathname === "/api/auth/users" && req.method === "GET") {
        if (!session.user.isAdmin) return send(res, 403, { error: "Forbidden" });
        return send(res, 200, { users: listPublicUsers(dataDir) });
      }

      if (url.pathname === "/api/auth/users" && req.method === "POST") {
        if (!session.user.isAdmin) return send(res, 403, { error: "Forbidden" });
        const body = await readBody(req);
        const name = String(body?.name || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const password = String(body?.password || "");
        if (!name || !email || !email.includes("@")) {
          return send(res, 400, { error: "Name and a valid email are required." });
        }
        if (password.length < 6) {
          return send(res, 400, { error: "Password must be at least 6 characters." });
        }
        try {
          const created = await createUser(dataDir, { name, email, password, isAdmin: false, protected: false });
          return send(res, 201, { user: created });
        } catch (err) {
          return send(res, 400, { error: err.message || "Could not create user." });
        }
      }

      const userIdMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)$/);
      if (userIdMatch && req.method === "DELETE") {
        if (!session.user.isAdmin) return send(res, 403, { error: "Forbidden" });
        const targetId = decodeURIComponent(userIdMatch[1]);
        const target = findUserById(dataDir, targetId);
        if (!target) return send(res, 404, { error: "Not found" });
        if (target.id === session.user.id || target.protected) {
          return send(res, 403, { error: "This account cannot be removed." });
        }
        deleteUser(dataDir, targetId);
        return send(res, 200, { ok: true });
      }

      const roleMatch = url.pathname.match(/^\/api\/auth\/users\/([^/]+)\/role$/);
      if (roleMatch && req.method === "PATCH") {
        if (!session.user.isAdmin) return send(res, 403, { error: "Forbidden" });
        const targetId = decodeURIComponent(roleMatch[1]);
        const target = findUserById(dataDir, targetId);
        if (!target) return send(res, 404, { error: "Not found" });
        if (target.id === session.user.id || target.protected) {
          return send(res, 403, { error: "This account's role cannot be changed." });
        }
        const body = await readBody(req);
        const updated = updateUserFields(dataDir, targetId, { isAdmin: Boolean(body?.isAdmin) });
        return send(res, 200, { user: updated });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      console.error("[auth-api]", err);
      return send(res, 500, { error: err.message || "Server error" });
    }
  };
}

export function createAuthApiMiddleware(options) {
  const handler = createAuthApiHandler(options);
  return (req, res, next) => {
    handler(req, res, next).catch((err) => {
      console.error(err);
      send(res, 500, { error: "Server error" });
    });
  };
}
