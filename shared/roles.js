export const ROLE_ADMIN = "admin";
export const ROLE_SALES = "sales";
export const ROLE_MARKETING = "marketing";

export const ROLE_OPTIONS = [
  { value: ROLE_ADMIN, label: "Admin" },
  { value: ROLE_SALES, label: "Sales" },
  { value: ROLE_MARKETING, label: "Marketing" },
];

export function normalizeRole(userOrRole) {
  if (userOrRole == null) return ROLE_SALES;
  if (typeof userOrRole === "string") {
    const role = userOrRole.trim().toLowerCase();
    if (role === ROLE_ADMIN || role === ROLE_SALES || role === ROLE_MARKETING) return role;
    if (role === "member" || role === "user") return ROLE_SALES;
    return ROLE_SALES;
  }
  if (userOrRole.role) return normalizeRole(userOrRole.role);
  if (userOrRole.isAdmin) return ROLE_ADMIN;
  return ROLE_SALES;
}

export function roleLabel(userOrRole) {
  const role = normalizeRole(userOrRole);
  return ROLE_OPTIONS.find((o) => o.value === role)?.label || "Sales";
}

export function isAdminUser(user) {
  return normalizeRole(user) === ROLE_ADMIN;
}

export function canAccessSalesReport(user) {
  const role = normalizeRole(user);
  return role === ROLE_ADMIN || role === ROLE_SALES;
}

export function canAccessMarketingReport(user) {
  const role = normalizeRole(user);
  return role === ROLE_ADMIN || role === ROLE_MARKETING;
}

export function canCreateProjects(user) {
  const role = normalizeRole(user);
  return role === ROLE_ADMIN || role === ROLE_SALES;
}

export function canCreateMarketing(user) {
  const role = normalizeRole(user);
  return role === ROLE_ADMIN || role === ROLE_MARKETING;
}

export function canManageUsers(user) {
  return isAdminUser(user);
}

export function canDismissIncoming(user) {
  return isAdminUser(user);
}

/** Edit if admin, or the record belongs to the signed-in account. */
export function canEditOwnedRecord(user, recordAccountKey, currentAccountKey) {
  if (isAdminUser(user)) return true;
  const current = String(currentAccountKey || "").trim();
  if (!current) return false;
  const owner = String(recordAccountKey || current).trim();
  return owner === current;
}
