const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function login(loginId, password, remember) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password, remember }),
  });
  return data.user;
}

export async function logout() {
  await request("/api/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser() {
  try {
    const data = await request("/api/auth/me");
    return data.user;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

export async function updateEmail(currentEmail, newEmail, currentPassword) {
  const data = await request("/api/auth/me/email", {
    method: "PATCH",
    body: JSON.stringify({ currentEmail, newEmail, currentPassword }),
  });
  return data.user;
}

export async function updatePassword(currentPassword, newPassword) {
  const data = await request("/api/auth/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return data.user;
}

export async function listTeam() {
  const data = await request("/api/auth/users");
  return data.users || [];
}

export async function addTeamMember(name, email, password, role) {
  const data = await request("/api/auth/users", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role }),
  });
  return data.user;
}

export async function removeTeamMember(id) {
  await request(`/api/auth/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function setTeamMemberRole(id, role) {
  const data = await request(`/api/auth/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return data.user;
}

export async function updateTeamMember(id, patch) {
  const data = await request(`/api/auth/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.user;
}

export async function resetTeamMemberPassword(id, password) {
  const data = await request(`/api/auth/users/${encodeURIComponent(id)}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
  return data.user;
}
