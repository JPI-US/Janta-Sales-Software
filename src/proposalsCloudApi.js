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
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function listProposalsCloud(userId, { status } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await request(`/api/users/${encodeURIComponent(userId)}/proposals${q}`);
  return data.proposals || [];
}

export async function listAllProposalsCloud({ status } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await request(`/api/proposals${q}`);
  return data.proposals || [];
}

export async function getProposalCloud(userId, proposalId) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/proposals/${encodeURIComponent(proposalId)}`);
  return data.proposal;
}

export async function createProposalCloud(userId, { id, title, snapshot, status, userEmail, ...crmFields }) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/proposals`, {
    method: "POST",
    body: JSON.stringify({ id, title, snapshot, status, userEmail, ...crmFields }),
  });
  return data.proposal;
}

export async function upsertProposalCloud(userId, { id, title, snapshot, status, userEmail, ...crmFields }) {
  if (!id) throw new Error("proposal id is required");
  try {
    return await updateProposalCloud(userId, id, { title, snapshot, status, userEmail, ...crmFields });
  } catch (err) {
    const msg = String(err?.message || "");
    if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) throw err;
    return createProposalCloud(userId, { id, title, snapshot, status, userEmail, ...crmFields });
  }
}

export async function updateProposalCloud(userId, proposalId, { title, snapshot, status, userEmail, ...crmFields }) {
  const data = await request(
    `/api/users/${encodeURIComponent(userId)}/proposals/${encodeURIComponent(proposalId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ title, snapshot, status, userEmail, ...crmFields }),
    }
  );
  return data.proposal;
}

export async function deleteProposalCloud(userId, proposalId) {
  await request(`/api/users/${encodeURIComponent(userId)}/proposals/${encodeURIComponent(proposalId)}`, {
    method: "DELETE",
  });
  return true;
}

export async function writeDraftCloud(userId, snapshot) {
  await request(`/api/users/${encodeURIComponent(userId)}/draft`, {
    method: "PUT",
    body: JSON.stringify({ snapshot }),
  });
}

export async function readDraftCloud(userId) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/draft`);
  return data.draft;
}

export async function clearDraftCloud(userId) {
  await request(`/api/users/${encodeURIComponent(userId)}/draft`, { method: "DELETE" });
}

