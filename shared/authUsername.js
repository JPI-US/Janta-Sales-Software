export function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

export function defaultUsernameFromEmail(email) {
  const local = String(email || "").split("@")[0].trim().toLowerCase();
  return local || "";
}

export function slugifyUsername(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
  return slug;
}

export function uniqueUsernameFromDisplayName(name, email, users, excludeUserId = "") {
  const taken = new Set(
    users
      .filter((u) => u.id !== excludeUserId)
      .map((u) => String(u.username || "").toLowerCase())
      .filter(Boolean)
  );
  let base = slugifyUsername(name) || defaultUsernameFromEmail(email);
  if (!base) base = "user";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  return candidate;
}
