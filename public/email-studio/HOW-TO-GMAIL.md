# How to use these emails in Gmail

Gmail-ready HTML for **Janta Power** lives under [`emails/`](./). Use the Email Studio (`npm run dev` → http://localhost:5173/) to preview and copy. Brand tokens: [`brand.md`](./brand.md).

## Before you send

1. Replace placeholders: `{{FirstName}}`, `{{Company}}`, `{{YourName}}`, `{{YourTitle}}`, `{{YourEmail}}`, `{{CalendarLink}}`.
2. Prefer **Chrome** when pasting HTML into Gmail.
3. Logo lives at [`assets/janta-logo.png`](./assets/janta-logo.png). **Copy HTML** in the studio rewrites it to your local server URL so images show while `npm run dev` is running. For real sends to prospects, host the logo publicly (e.g. on jantaus.com) and update the image `src` to that HTTPS URL.
4. For deliverability-sensitive outreach, use the matching `.txt` twin.

## Save message templates (Gmail Templates)

1. Gmail → **Settings** → **See all settings** → **Advanced**.
2. Enable **Templates** → **Save Changes**.
3. In Email Studio, pick a template → **Copy HTML** (or Open HTML and copy the body).
4. Compose a new email in Gmail → paste.
5. Replace placeholders and set the subject (suggested in each `.txt` file / HTML comments).
6. Compose → **More options** (⋮) → **Templates** → **Save draft as template** → **Save as new template**.
7. Reuse: Compose → ⋮ → **Templates** → **Insert template**.

### Recommended template set

| Gmail template name | File |
|---------------------|------|
| DC — Cold short | `data-center/cold-intro-short.html` |
| DC — Cold rich | `data-center/cold-intro-rich.html` |
| DC — Follow-up | `data-center/follow-up.html` |
| DC — Meeting | `data-center/meeting-request.html` |
| DC — Case study | `data-center/case-study.html` |

## Pasting HTML cleanly

- Paste into the **compose body**, not the subject line.
- Don’t nest rich templates inside long reply chains if you can avoid it.
- Calendar CTAs use `{{CalendarLink}}` — swap in Calendly, HubSpot Meetings, or your URL.

## Plain text

Each HTML file has a twin `.txt` in the same folder. Use when HTML may be stripped or you want a lighter first touch.

## Quick QA checklist

- [ ] Placeholders replaced
- [ ] Logo loads (public HTTPS URL for real sends)
- [ ] Links open (jantaus.com, mailto, calendar)
- [ ] Metrics and claims match current site messaging
- [ ] Test send to yourself in Gmail web + mobile
