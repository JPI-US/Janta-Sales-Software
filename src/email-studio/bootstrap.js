import {
  getTemplate,
  folderPath,
  deleteTemplate,
  duplicateBuiltinAsCustom,
  configureEmailStore,
  hydrateEmailStore,
} from "./lib/store.js";
import { renderHome } from "./ui/home.js";
import { renderBuilder } from "./ui/builder.js";
import {
  compileEmailHtml,
  estimateEmailBytes,
  emailSizeLevel,
  formatBytes,
  GMAIL_MESSAGE_LIMIT_BYTES,
  copyRichHtmlToClipboard,
  compilePlainText,
  logoSrc,
  LOGO_LOCAL,
} from "./lib/compile.js";
import "./styles.css";
import "./embed.css";

/** @typedef {{ accountKey?: string, initialTemplateId?: string | null, onPersist?: (state: object) => void, onCopyHtml?: (payload: object) => void, onExitToLibrary?: () => void }} EmailStudioOptions */

/** @type {null | (() => void)} */
let unsubscribe = null;

/** @type {null | (() => void)} */
let flushSaveFn = null;

/** @type {null | { openTemplate: (id: string | null) => void, goHome: () => void }} */
let activeInstance = null;

/**
 * Mount the vanilla Email Studio workspace (no internal sidebar).
 * @param {HTMLElement} root
 * @param {EmailStudioOptions} options
 */
export function mountEmailStudio(root, options = {}) {
  unmountEmailStudio();

  if (options.accountKey) {
    configureEmailStore({
      accountKey: options.accountKey,
      onPersist: options.onPersist,
    });
  }

  root.innerHTML = `
    <div class="email-studio-shell">
      <main class="main" id="email-main"></main>
    </div>
  `;

  const mainEl = root.querySelector("#email-main");

  /** @type {"home" | "preview" | "builder"} */
  let view = "home";
  /** @type {string | null} */
  let currentId = null;
  function notifyCopy(payload) {
    options.onCopyHtml?.({
      ...payload,
      templateId: payload.templateId || currentId,
    });
  }

  function openTemplate(id) {
    if (!id) {
      view = "home";
      currentId = null;
      paint();
      return;
    }
    const t = getTemplate(id);
    if (!t) {
      currentId = id;
      view = "builder";
      mainEl.innerHTML = `
        <div class="home" style="padding:24px;">
          <p class="home-muted">Loading email…</p>
        </div>`;
      return;
    }
    currentId = id;
    view = t.kind === "custom" ? "builder" : "preview";
    paint();
  }

  function goHome() {
    try {
      flushSaveFn?.();
    } catch {
      /* ignore flush errors */
    }
    if (typeof options.onExitToLibrary === "function") {
      options.onExitToLibrary();
      return;
    }
    view = "home";
    currentId = null;
    paint();
  }

  function paint() {
    if (view === "home") {
      renderHome(mainEl, {
        onOpenBuilder: (id) => {
          currentId = id;
          view = "builder";
          paint();
        },
        onOpenTemplate: (id) => {
          currentId = id;
          view = "preview";
          paint();
        },
      });
      return;
    }

    if (view === "builder" && currentId) {
      renderBuilder(mainEl, currentId, {
        onBack: goHome,
        onCopyHtml: notifyCopy,
        registerFlushSave: (fn) => {
          flushSaveFn = typeof fn === "function" ? fn : null;
        },
      });
      return;
    }

    if (view === "preview" && currentId) {
      renderPreview(mainEl, currentId);
    }
  }

  async function renderPreview(mount, id) {
    const t = getTemplate(id);
    if (!t) return;
    const path = folderPath(t.folderId).join(" / ");
    const frameClass = "device is-desktop";

    mount.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-text">
          <p class="eyebrow">${escapeHtml(path)}</p>
          <h1>${escapeHtml(t.title)}</h1>
        </div>
        <div class="toolbar-actions">
          <div class="email-size" id="email-size" title="Estimated HTML size vs Gmail's ~25 MB message limit"></div>
          <button type="button" class="btn btn-ghost" id="btn-home">All emails</button>
          ${t.kind === "builtin" ? `<button type="button" class="btn btn-primary" id="btn-edit-copy">Edit a copy</button>` : ""}
          <button type="button" class="btn btn-ghost" id="btn-copy" ${t.kind === "builtin" || t.doc ? "" : "disabled"}>Copy HTML</button>
          <a class="btn btn-ghost" id="btn-html" href="${t.htmlUrl || "#"}" target="_blank" rel="noopener">Open HTML</a>
          <a class="btn btn-ghost ${t.txtUrl ? "" : "is-hidden"}" id="btn-txt" href="${t.txtUrl || "#"}" target="_blank" rel="noopener">Plain text</a>
          <a class="btn btn-ghost" href="/email-studio/gmail-guide.html" target="_blank" rel="noopener">Gmail setup guide</a>
        </div>
      </div>
      <div class="stage stage-preview">
        <div class="${frameClass}">
          <div class="device-bar"><span></span><span></span><span></span><p>${escapeHtml(t.title)}</p></div>
          <iframe id="preview" title="Email preview" src="${t.htmlUrl || "about:blank"}"></iframe>
        </div>
      </div>
    `;

    mount.querySelector("#btn-home").addEventListener("click", goHome);

    void paintPreviewEmailSize(mount, t);

    mount.querySelector("#btn-edit-copy")?.addEventListener("click", () => {
      const copy = duplicateBuiltinAsCustom(t.id);
      if (!copy) {
        alert("Could not create an editable copy.");
        return;
      }
      openTemplate(copy.id);
    });

    const copyBtn = mount.querySelector("#btn-copy");
    const assetPrefix = `${window.location.origin}/email-studio/assets/`;

    if (t.kind === "builtin" && t.htmlUrl) {
      copyBtn.addEventListener("click", async () => {
        const res = await fetch(t.htmlUrl);
        let html = await res.text();
        const embedded = logoSrc();
        html = html
          .replaceAll(`src="${LOGO_LOCAL}"`, `src="${embedded}"`)
          .replaceAll(`src='${LOGO_LOCAL}'`, `src='${embedded}'`)
          .replaceAll('src="/assets/', `src="${assetPrefix}`)
          .replaceAll("src='/assets/", `src='${assetPrefix}`);
        html = html.replaceAll(`src="${assetPrefix}janta-logo.png"`, `src="${embedded}"`);
        await copyRichHtmlToClipboard(html);
        notifyCopy({ templateId: id, doc: { subject: t.title }, html, title: t.title, kind: "builtin" });
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy HTML"), 1200);
      });
    } else if (t.kind === "custom" && t.doc) {
      copyBtn.disabled = false;
      copyBtn.addEventListener("click", async () => {
        const html = compileEmailHtml(t.doc, { absoluteLogoOrigin: window.location.origin });
        await copyRichHtmlToClipboard(html, compilePlainText(t.doc));
        notifyCopy({ templateId: id, doc: t.doc, html, title: t.doc.subject || t.title, kind: "custom" });
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy HTML"), 1200);
      });
    }
  }

  async function paintPreviewEmailSize(mount, template) {
    const el = mount.querySelector("#email-size");
    if (!el) return;
    let bytes = 0;
    try {
      if (template.kind === "custom" && template.doc) {
        bytes = estimateEmailBytes(template.doc, { absoluteLogoOrigin: window.location.origin });
      } else if (template.htmlUrl) {
        const res = await fetch(template.htmlUrl);
        const html = await res.text();
        bytes = new TextEncoder().encode(html).length;
      }
    } catch {
      el.textContent = "";
      return;
    }
    const limit = GMAIL_MESSAGE_LIMIT_BYTES;
    const level = emailSizeLevel(bytes, limit);
    const pct = Math.min(100, Math.round((bytes / limit) * 1000) / 10);
    el.className = `email-size is-${level}`;
    el.title = `Estimated HTML size vs Gmail's ~${formatBytes(limit)} message limit`;
    el.innerHTML = `
      <span class="email-size-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span class="email-size-label">${formatBytes(bytes)} / ${formatBytes(limit)}</span>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  unsubscribe = () => {
    try {
      flushSaveFn?.();
    } catch {
      /* ignore flush errors */
    }
    flushSaveFn = null;
    root.innerHTML = "";
    activeInstance = null;
  };

  activeInstance = { openTemplate, goHome };

  if (options.initialTemplateId) {
    openTemplate(options.initialTemplateId);
  } else if (!options.onExitToLibrary) {
    paint();
  }

  return {
    hydrate: (raw) => hydrateEmailStore(raw),
    navigateToTemplate: openTemplate,
    goHome,
    destroy: unmountEmailStudio,
  };
}

export function unmountEmailStudio() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export function getActiveEmailStudio() {
  return activeInstance;
}
