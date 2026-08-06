import { listUsers, createUser } from "./userStore.js";

export async function ensureBootstrapAdmin(dataDir) {
  if (listUsers(dataDir).length) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.ADMIN_BOOTSTRAP_NAME;
  if (!email || !password) {
    console.warn("[auth] No users exist yet and ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD are unset — nobody can log in.");
    return;
  }
  await createUser(dataDir, {
    name: name || "Admin",
    email,
    password,
    isAdmin: true,
    protected: true,
  });
  console.log(`[auth] Bootstrapped admin account for ${email}`);
}
