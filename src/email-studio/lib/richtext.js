/** Allowed tags for email-safe rich text */
const ALLOWED = new Set(["B", "STRONG", "I", "EM", "A", "BR", "UL", "OL", "LI", "P", "DIV", "SPAN"]);

/**
 * Convert legacy plain text (newlines) into basic HTML.
 * If content already looks like HTML, return as-is.
 */
export function plainToHtml(text = "") {
  const s = String(text);
  if (!s) return "";
  if (/<[a-z][\s\S]*>/i.test(s)) return s;
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
}

/** Strip tags for plain-text export */
export function htmlToPlain(html = "") {
  const div = document.createElement("div");
  div.innerHTML = String(html);
  // Prefer line breaks from br/p/li
  div.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  div.querySelectorAll("p, div, li").forEach((el) => {
    if (el.nextSibling) el.after("\n");
  });
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sanitize rich HTML for email compile / persistence.
 * Keeps bold, italic, links, lists, breaks.
 */
export function sanitizeRichHtml(input = "") {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(input);

  const walk = (node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      const tag = child.tagName;
      if (!ALLOWED.has(tag)) {
        // unwrap disallowed elements
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }
      // scrub attributes
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (tag === "A" && name === "href") {
          const href = attr.value.trim();
          if (!/^(https?:|mailto:|{{)/i.test(href) && !href.startsWith("#")) {
            child.removeAttribute(attr.name);
          } else {
            child.setAttribute("href", href);
            child.setAttribute("style", "color:#3a84dc;text-decoration:underline;");
          }
        } else {
          child.removeAttribute(attr.name);
        }
      });
      if (tag === "SPAN" || tag === "DIV") {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }
      walk(child);
    }
  };

  walk(wrapper);
  return wrapper.innerHTML;
}

/** Compile-ready HTML from stored field (plain or rich) */
export function richHtml(value = "") {
  const raw = plainToHtml(value);
  return sanitizeRichHtml(raw);
}

export function richToolbarHtml(editorId) {
  return `
    <div class="rte-toolbar" data-rte-for="${editorId}">
      <button type="button" data-rte-cmd="bold" title="Bold"><b>B</b></button>
      <button type="button" data-rte-cmd="italic" title="Italic"><i>I</i></button>
      <button type="button" data-rte-cmd="createLink" title="Link">Link</button>
      <button type="button" data-rte-cmd="insertUnorderedList" title="Bullets">• List</button>
      <button type="button" data-rte-cmd="removeFormat" title="Clear formatting">Clear</button>
    </div>`;
}

/**
 * Wire a contenteditable rich field.
 * @param {HTMLElement} root - mount scope
 * @param {string} editorId
 * @param {(html: string) => void} onChange
 */
export function wireRichEditor(root, editorId, onChange) {
  const editor = root.querySelector(`#${editorId}`);
  if (!editor) return;

  const toolbar = root.querySelector(`[data-rte-for="${editorId}"]`);
  toolbar?.querySelectorAll("[data-rte-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-rte-cmd");
      editor.focus();
      if (cmd === "createLink") {
        const url = prompt("Link URL", "https://");
        if (!url) return;
        document.execCommand("createLink", false, url);
      } else {
        document.execCommand(cmd, false);
      }
      onChange(sanitizeRichHtml(editor.innerHTML));
    });
  });

  let timer = null;
  const emit = () => {
    onChange(sanitizeRichHtml(editor.innerHTML));
  };
  editor.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(emit, 200);
  });
  editor.addEventListener("blur", emit);
}
