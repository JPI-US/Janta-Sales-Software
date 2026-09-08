import { send } from "../httpUtils.js";
import { authenticateRequest } from "./sessions.js";

/**
 * Paths a user with a pending forced password change may still reach:
 * enough to sign in, see who they are, set a new password, and sign out.
 */
const ALLOWED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/me/password",
]);

/**
 * Blocks the rest of the API while `mustChangePassword` is set on the signed-in
 * user, so the forced change cannot be skipped by talking to the API directly.
 *
 * No-op for every request without a session and for every user whose flag is
 * unset — which includes all records written before the flag existed.
 */
export function createPasswordChangeGate({ dataDir }) {
  return async function passwordChangeGate(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next();
    if (ALLOWED_PATHS.has(url.pathname)) return next();
    if (req.method === "OPTIONS") return next();

    const session = await authenticateRequest(req, { dataDir });
    if (!session) return next();
    if (!session.user.mustChangePassword) return next();

    return send(res, 403, {
      error: "Set a new password before using the app.",
      code: "password_change_required",
    });
  };
}
