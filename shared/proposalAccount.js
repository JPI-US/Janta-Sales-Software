/**
 * Stable on-disk / API folder key for a login account (email-based).
 * Survives random user.id changes in localStorage and server restarts.
 */
export function proposalStorageKey(userOrEmail) {
  if (userOrEmail == null) return "";

  if (typeof userOrEmail === "string") {
    const raw = userOrEmail.trim();
    if (!raw) return "";
    if (raw.includes("@")) return emailToStorageKey(raw);
    return raw.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  const email = String(userOrEmail.email || "").trim().toLowerCase();
  if (email) return emailToStorageKey(email);

  const id = String(userOrEmail.id || "").trim();
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function emailToStorageKey(email) {
  const slug = String(email)
    .trim()
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return `acct_${slug || "user"}`;
}

export function isLegacyRandomUserId(userId, storageKey) {
  if (!userId || !storageKey || userId === storageKey) return false;
  return !String(userId).startsWith("acct_");
}
