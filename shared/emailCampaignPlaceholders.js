/** Replace {{Token}} placeholders in a string. Unknown tokens are left as-is. */
export function applyEmailPlaceholders(text, vars = {}) {
  if (text == null) return "";
  const s = String(text);
  return s.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v != null && String(v).trim() !== "" ? String(v) : `{{${key}}}`;
  });
}

/** Deep-replace placeholders across an email doc (subject, preheader, block fields). */
export function applyPlaceholdersToDoc(doc, vars = {}) {
  if (!doc || typeof doc !== "object") return doc;
  try {
    const json = JSON.stringify(doc);
    return JSON.parse(applyEmailPlaceholders(json, vars));
  } catch {
    return doc;
  }
}

export function clientPlaceholderVars(client, sender = {}) {
  const firstName =
    client?.firstName?.trim() ||
    String(client?.name || "")
      .trim()
      .split(/\s+/)[0] ||
    "";
  return {
    FirstName: firstName,
    Company: client?.company || "",
    YourName: sender.name || "",
    YourTitle: sender.title || "",
    YourEmail: sender.email || "",
    CalendarLink: sender.calendarLink || "",
  };
}
