/**
 * Service-account auth for Google APIs using only Node built-ins.
 *
 * Signs a JWT with the service account's private key and exchanges it for an
 * access token. Deliberately avoids @google-cloud/* so the runtime image keeps
 * its zero-dependency property.
 */
import crypto from "crypto";
import fs from "fs";

const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function loadServiceAccount(filePath) {
  const path = String(filePath || process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!path) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set (path to the service-account JSON)");
  }
  if (!fs.existsSync(path)) {
    throw new Error(`Service-account file not found: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Service-account file is not valid JSON: ${err.message}`);
  }
  for (const field of ["client_email", "private_key"]) {
    if (!parsed[field]) throw new Error(`Service-account file is missing "${field}"`);
  }
  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
    tokenUri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    projectId: parsed.project_id || null,
  };
}

/** Builds the signed JWT assertion. Exported so it can be tested without network. */
export function buildAssertion(account, { scope = BIGQUERY_SCOPE, now = Math.floor(Date.now() / 1000) } = {}) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope,
      aud: account.tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(account.privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${signingInput}.${signature}`;
}

export async function getAccessToken(account, { fetchImpl = fetch, scope = BIGQUERY_SCOPE } = {}) {
  const assertion = buildAssertion(account, { scope });
  const res = await fetchImpl(account.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Could not get a Google access token: ${detail}`);
  }
  return data.access_token;
}
