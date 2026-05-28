const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
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

export async function getProposalCloud(userId, proposalId) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/proposals/${encodeURIComponent(proposalId)}`);
  return data.proposal;
}

export async function createProposalCloud(userId, { title, snapshot, status }) {
  const data = await request(`/api/users/${encodeURIComponent(userId)}/proposals`, {
    method: "POST",
    body: JSON.stringify({ title, snapshot, status }),
  });
  return data.proposal;
}

export async function updateProposalCloud(userId, proposalId, { title, snapshot, status }) {
  const data = await request(
    `/api/users/${encodeURIComponent(userId)}/proposals/${encodeURIComponent(proposalId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ title, snapshot, status }),
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
