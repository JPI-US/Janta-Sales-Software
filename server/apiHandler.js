import { createAuthApiHandler } from "./authApi.js";
import { createProposalsApiHandler, DEFAULT_DATA_DIR } from "./proposalsApi.js";
import { DEFAULT_AUTH_DATA_DIR } from "./auth/userStore.js";
import { send } from "./httpUtils.js";

export function createApiHandler({ dataDir = DEFAULT_DATA_DIR, authDataDir = DEFAULT_AUTH_DATA_DIR } = {}) {
  const authHandler = createAuthApiHandler({ dataDir: authDataDir });
  const proposalsHandler = createProposalsApiHandler({ dataDir, authDataDir });
  return async function apiHandler(req, res, next) {
    await authHandler(req, res, () => proposalsHandler(req, res, next));
  };
}

export function createApiMiddleware(options) {
  const handler = createApiHandler(options);
  return (req, res, next) => {
    handler(req, res, next).catch((err) => {
      console.error(err);
      send(res, 500, { error: "Server error" });
    });
  };
}
