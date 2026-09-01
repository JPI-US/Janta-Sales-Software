import {
  configureEmailStore,
  exportEmailStoreState,
  getState,
  getTemplate,
  hydrateEmailStore,
  reloadLocalState,
  subscribe,
} from "./email-studio/lib/store.js";
import { fetchEmailStudioStore, scheduleEmailStudioCloudSave } from "./emailStudioApi.js";

let configuredAccountKey = null;
let initPromise = null;
let initPromiseKey = null;

export async function initEmailStudioStore(accountKey) {
  if (!accountKey) return;
  if (configuredAccountKey === accountKey && initPromiseKey === accountKey) {
    return initPromise;
  }
  configureEmailStore({
    accountKey,
    onPersist: (state) => scheduleEmailStudioCloudSave(accountKey, state),
  });
  configuredAccountKey = accountKey;
  initPromiseKey = accountKey;
  initPromise = (async () => {
    try {
      const store = await fetchEmailStudioStore(accountKey);
      hydrateEmailStore(store);
    } catch {
      // local/builtin seed is fine offline
    }
  })();
  return initPromise;
}

export function isEmailStudioStoreReady(accountKey) {
  return configuredAccountKey === accountKey;
}

/** Wait for store init, then resolve a template (re-reads localStorage if missing in memory). */
export async function resolveEmailTemplate(accountKey, templateId) {
  if (!accountKey || !templateId) return null;
  await initEmailStudioStore(accountKey);
  let tpl = getTemplate(templateId);
  if (!tpl) {
    reloadLocalState();
    tpl = getTemplate(templateId);
  }
  if (!tpl) {
    // One more read after a microtask in case persist from a just-closed editor landed late
    await new Promise((r) => setTimeout(r, 0));
    reloadLocalState();
    tpl = getTemplate(templateId);
  }
  return tpl || null;
}

export function readEmailStudioState() {
  return getState();
}

export function listEmailTemplates() {
  return getState().templates || [];
}

export function listEmailPins() {
  return getState().pins || [];
}

export { subscribe, exportEmailStoreState };
