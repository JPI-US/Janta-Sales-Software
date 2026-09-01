import { renderBlock } from "./compile.js";
import { enableGridLayout } from "./grid.js";

function uid(prefix = "block") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function b(type, props = {}) {
  return { id: uid("block"), type, align: props.align || "left", ...props };
}

/** Shared Janta starter copy helpers */
const hi = (extra = "") =>
  `Hi {{FirstName}},${extra ? `<br><br>${extra}` : "<br><br>Write your message here for {{Company}}."}`;

/**
 * Preset catalog — structure + approximate length for Gmail drafts.
 * `wire` drives the home wireframe; `build` creates the doc blocks.
 */
export const PRESET_GROUPS = [
  {
    id: "length",
    label: "By length",
    presets: [
      {
        id: "blank",
        label: "Blank",
        size: "Short",
        blurb: "Empty canvas — drag blocks from the palette",
        wire: [],
        build: () => [],
        subject: (t) => t,
        preheader: "",
      },
      {
        id: "micro",
        label: "Micro note",
        size: "XS",
        blurb: "2–3 lines + one link — inbox-light",
        wire: ["text", "button"],
        build: () => [
          b("text", {
            html: `Hi {{FirstName}},<br><br>Quick note for {{Company}} — happy to share a one-pager on denser on-site solar when useful.`,
            fontSize: 15,
          }),
          b("button", { label: "See Janta Power", href: "https://jantaus.com/", align: "left" }),
        ],
        subject: () => "Quick note — {{Company}}",
        preheader: "One-pager on denser on-site solar",
      },
      {
        id: "short",
        label: "Short cold intro",
        size: "Short",
        blurb: "Compact outreach — one screen",
        wire: ["header", "text", "button", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Data center",
            heading: "Denser solar without the acreage",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "Data campuses rarely have spare acres for flat solar—but they need denser clean power next to load.<br><br>Janta’s 3D towers: ~50% more energy and ~3× power per unit area vs traditional arrays.",
            ),
          }),
          b("button", { label: "Explore Janta Power", href: "https://jantaus.com/" }),
          b("text", {
            html: "Best,<br>{{YourName}}<br>{{YourTitle}} · Janta Power",
            fontSize: 14,
            color: "#5a6a7a",
          }),
        ],
        subject: () => "{{Company}} + denser on-site solar",
        preheader: "3D solar for land-tight campuses",
      },
      {
        id: "medium",
        label: "Standard outreach",
        size: "Medium",
        blurb: "Proof metrics + CTA — default sales shape",
        wire: ["header", "text", "metrics", "button", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Data center",
            heading: "Denser on-site solar for land-tight campuses",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "Data centers rarely have spare acres for flat solar—but they need denser clean power next to load.",
            ),
          }),
          b("metrics", {
            align: "center",
            items: [
              { value: "~50%", label: "More energy" },
              { value: "3×", label: "Power / area" },
              { value: "~34%", label: "Capacity factor" },
            ],
          }),
          b("button", { label: "Explore Janta Power", href: "https://jantaus.com/" }),
          b("text", { html: "{{YourName}} · {{YourTitle}}<br>Janta Power · {{YourEmail}}" }),
          b("attachments", { items: [] }),
        ],
        subject: () => "More power per acre for {{Company}}",
        preheader: "~50% more energy · 3× power / area",
      },
      {
        id: "long",
        label: "Long narrative",
        size: "Long",
        blurb: "Multi-section story — scroll-length",
        wire: ["header", "text", "image", "columns", "callout", "list", "button", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Deep dive",
            heading: "Why land-tight campuses choose vertical density",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "When every square foot of {{Company}}’s campus is spoken for, traditional solar often loses to parking, cooling, and future halls.",
            ),
          }),
          b("image", {
            align: "center",
            src: "",
            alt: "Janta 3D solar towers",
            caption: "Add a site or product image",
            width: 536,
          }),
          b("columns", {
            left: "<strong>The constraint</strong><br>Acreage next to load is scarce. Flat arrays compete with core operations.",
            right: "<strong>The approach</strong><br>Sun-tracking 3D towers stack generation upward—more power per unit area.",
          }),
          b("callout", {
            html: "Proof points: ~50% more energy · 3× power per unit area · up to ~34% capacity factor vs traditional solar.",
            accent: "#3a84dc",
            calloutBg: "#f4f7fa",
          }),
          b("list", {
            items: [
              "Fit for constrained parcels and interconnection-aware siting",
              "Infrastructure-grade ops mindset (airports, campuses, industry)",
              "Next step: lightweight site brief for {{Company}}",
            ],
          }),
          b("button", { label: "Request a site brief", href: "https://jantaus.com/" }),
          b("text", { html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}}" }),
        ],
        subject: () => "Vertical density for {{Company}}’s campus",
        preheader: "A longer look at land-constrained on-site solar",
      },
    ],
  },
  {
    id: "structure",
    label: "By structure",
    presets: [
      {
        id: "outreach",
        label: "Metrics hero",
        size: "Medium",
        blurb: "Header → story → 3 metrics → CTA",
        wire: ["header", "text", "metrics", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Data center",
            heading: "Denser on-site solar for land-tight campuses",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "Janta’s 3D solar towers deliver about 50% more energy and roughly 3× power per unit area versus traditional arrays.",
            ),
          }),
          b("metrics", {
            align: "center",
            items: [
              { value: "~50%", label: "More energy" },
              { value: "3×", label: "Power / area" },
              { value: "~34%", label: "Capacity factor" },
            ],
          }),
          b("button", { label: "Explore Janta Power", href: "https://jantaus.com/" }),
          b("attachments", { items: [] }),
        ],
        subject: () => "3× power density for land-tight data campuses",
        preheader: "Proof metrics up front",
      },
      {
        id: "meeting",
        label: "Meeting ask",
        size: "Short",
        blurb: "Agenda list + calendar CTA",
        wire: ["header", "text", "list", "button", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Site brief",
            heading: "20 minutes on power density for {{Company}}",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "I’d like to walk your team through how Janta’s sun-tracking 3D solar towers could fit a data campus where land is tight.",
            ),
          }),
          b("list", {
            items: [
              "Where 3D towers beat flat arrays on constrained parcels",
              "Proof points (~50% more energy, ~3× power/area)",
              "Next step: a lightweight site brief for {{Company}}",
            ],
          }),
          b("button", { label: "Schedule a call", href: "{{CalendarLink}}" }),
          b("text", {
            html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}} · (469) 694-3818",
          }),
        ],
        subject: () => "20 minutes on on-site solar density for {{Company}}",
        preheader: "Site brief walkthrough",
      },
      {
        id: "follow-up",
        label: "Follow-up",
        size: "Short",
        blurb: "Light bump — proof + soft ask",
        wire: ["header", "text", "callout", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Follow-up",
            heading: "Circling back on power density",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "Following up on denser on-site solar for {{Company}}. Happy to send a one-page site brief or book 15 minutes if useful.",
            ),
          }),
          b("callout", {
            html: "Munich Airport pilot · Greentown Labs · ~50% more energy · ~3× power/area",
            accent: "#3a84dc",
            calloutBg: "#f4f7fa",
          }),
          b("button", { label: "Book a call", href: "{{CalendarLink}}" }),
        ],
        subject: () => "Following up — on-site solar for {{Company}}",
        preheader: "Brief or 15 minutes — your call",
      },
      {
        id: "proof",
        label: "Proof / case",
        size: "Medium",
        blurb: "Credibility first — callout + CTA",
        wire: ["header", "text", "callout", "button", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Proof",
            heading: "Built for land-constrained infrastructure",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: hi(
              "Sharing a proof point that maps to data campus constraints: Munich Airport and Janta Power are piloting a three-dimensional energy production solution.",
            ),
          }),
          b("callout", {
            html: "Same story for {{Company}}: if flat solar can’t compete for land on campus, vertical density is the path to meaningful on-site generation.",
            accent: "#3a84dc",
            calloutBg: "#f4f7fa",
          }),
          b("button", { label: "See Janta Power", href: "https://jantaus.com/" }),
          b("text", { html: "{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}}" }),
        ],
        subject: () => "Infrastructure proof — Munich Airport × Janta",
        preheader: "Pilot proof for land-constrained campuses",
      },
      {
        id: "two-column",
        label: "Two-column compare",
        size: "Medium",
        blurb: "Side-by-side layout + CTA",
        wire: ["header", "text", "columns", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Compare",
            heading: "Flat arrays vs vertical density",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", { html: hi("A quick side-by-side for {{Company}}’s siting conversation.") }),
          b("columns", {
            left: "<strong>Traditional flat</strong><br>• Needs open acreage<br>• Competes with ops footprint<br>• Familiar — but land-limited",
            right: "<strong>Janta 3D towers</strong><br>• ~3× power per unit area<br>• Built for constrained parcels<br>• Sun-tracking vertical stack",
          }),
          b("button", { label: "Talk through fit", href: "{{CalendarLink}}" }),
        ],
        subject: () => "Flat vs vertical — for {{Company}}",
        preheader: "A simple compare for land-tight sites",
      },
      {
        id: "visual",
        label: "Visual + caption",
        size: "Medium",
        blurb: "Image-led — drop a GIF or photo",
        wire: ["header", "image", "text", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Visual",
            heading: "See the density difference",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("image", {
            align: "center",
            src: "",
            alt: "Product or site visual",
            caption: "Drop a photo or GIF in the builder",
            width: 536,
            rounded: true,
          }),
          b("text", {
            html: hi(
              "Happy to walk {{Company}} through how this footprint compares to a conventional array on a constrained parcel.",
            ),
          }),
          b("button", { label: "Learn more", href: "https://jantaus.com/" }),
        ],
        subject: () => "Visual — denser solar for {{Company}}",
        preheader: "Image-led intro",
      },
      {
        id: "checklist",
        label: "Checklist brief",
        size: "Medium",
        blurb: "Bullets + files checklist",
        wire: ["header", "text", "list", "attachments", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Brief",
            heading: "What we’ll cover for {{Company}}",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", { html: hi("Here’s a lightweight outline before we meet.") }),
          b("list", {
            items: [
              "Campus footprint & land constraints",
              "Indicative energy density vs flat solar",
              "What a site screen looks like",
              "Open questions from your team",
            ],
          }),
          b("attachments", { items: [] }),
          b("button", { label: "Confirm time", href: "{{CalendarLink}}" }),
        ],
        subject: () => "Agenda + brief for {{Company}}",
        preheader: "Checklist before the call",
      },
      {
        id: "announcement",
        label: "Announcement",
        size: "Short",
        blurb: "Bold header band + single ask",
        wire: ["header", "text", "button", "divider", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Update",
            heading: "More Power. Less Land.",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", {
            html: "Hi {{FirstName}},<br><br>Sharing a concise update from Janta Power relevant to land-constrained campuses like {{Company}}.",
            align: "left",
          }),
          b("button", { label: "Read more", href: "https://jantaus.com/", align: "center" }),
          b("divider"),
          b("text", {
            html: "Janta Power · Dallas, TX · info@jantaus.com",
            align: "center",
            fontSize: 12,
            color: "#5a6a7a",
          }),
        ],
        subject: () => "Update from Janta Power",
        preheader: "For land-constrained campuses",
      },
      {
        id: "newsletter",
        label: "Multi-section",
        size: "Long",
        blurb: "Newsletter-style stacked sections",
        wire: ["header", "text", "divider", "text", "metrics", "divider", "callout", "button"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Janta notes",
            heading: "This month in power density",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("text", { html: "Hi {{FirstName}},<br><br>A few items worth a skim for {{Company}}’s energy & real-estate planning." }),
          b("divider"),
          b("text", {
            html: "<strong>1 · Land is the scarce resource</strong><br>Data campuses keep expanding load without expanding acres. Vertical generation is how on-site stays viable.",
          }),
          b("metrics", {
            align: "center",
            items: [
              { value: "~50%", label: "More energy" },
              { value: "3×", label: "Power / area" },
              { value: "~34%", label: "Capacity factor" },
            ],
          }),
          b("divider"),
          b("callout", {
            html: "<strong>2 · Proof in the field</strong><br>Munich Airport pilot and industry coverage — built for infrastructure constraints, not open fields.",
            accent: "#3a84dc",
            calloutBg: "#f4f7fa",
          }),
          b("button", { label: "Visit jantaus.com", href: "https://jantaus.com/" }),
        ],
        subject: () => "Janta notes — power density for {{Company}}",
        preheader: "Land, proof, and what to do next",
      },
      {
        id: "soft-ask",
        label: "Soft ask",
        size: "XS",
        blurb: "No hard CTA button — reply-friendly",
        wire: ["text", "text"],
        build: () => [
          b("text", {
            html: `Hi {{FirstName}},<br><br>If denser on-site solar is anywhere on {{Company}}’s roadmap, I’m happy to send a one-page brief—or just answer a couple of siting questions over email.`,
          }),
          b("text", {
            html: "Either way, no rush.<br><br>{{YourName}}<br>{{YourTitle}} · Janta Power<br>{{YourEmail}}",
            fontSize: 14,
          }),
        ],
        subject: () => "One-pager for {{Company}}? (optional)",
        preheader: "Happy to send a brief — no rush",
      },
      {
        id: "spacer-rhythm",
        label: "Airy / spacious",
        size: "Medium",
        blurb: "Extra spacers — premium pacing",
        wire: ["header", "spacer", "text", "spacer", "button", "spacer", "text"],
        build: () => [
          b("header", {
            showLogo: true,
            eyebrow: "Janta Power",
            heading: "More Power. Less Land.",
            bgColor: "#1a2332",
            bgOpacity: 100,
          }),
          b("spacer", { size: 28 }),
          b("text", {
            html: hi(
              "A paced note for {{Company}} on putting meaningful generation next to load—without the acreage.",
            ),
          }),
          b("spacer", { size: 20 }),
          b("button", { label: "Explore the approach", href: "https://jantaus.com/", align: "center" }),
          b("spacer", { size: 28 }),
          b("text", {
            html: "{{YourName}} · Janta Power",
            align: "center",
            fontSize: 13,
            color: "#5a6a7a",
          }),
        ],
        subject: () => "A paced note for {{Company}}",
        preheader: "Breathing room, clear ask",
      },
    ],
  },
];

export function listPresets() {
  return PRESET_GROUPS.flatMap((g) => g.presets.map((p) => ({ ...p, group: g.label, groupId: g.id })));
}

export function getPreset(id) {
  return listPresets().find((p) => p.id === id) || listPresets().find((p) => p.id === "blank");
}

export function buildPresetDoc(presetId, title = "Untitled email") {
  const preset = getPreset(presetId);
  const blocks = preset.build(title).map((block) => ({
    ...block,
    id: uid("block"),
  }));
  return {
    subject: typeof preset.subject === "function" ? preset.subject(title) : title,
    preheader: typeof preset.preheader === "function" ? preset.preheader(title) : preset.preheader || "",
    blocks,
  };
}

/** Home structure preview — same block HTML as the editor canvas, scaled to fit */
export function renderPresetWireframe(presetId) {
  const preset = getPreset(presetId);
  const doc = buildPresetDoc(presetId, "Preview");
  enableGridLayout(doc, { growCanvas: true });
  const body =
    doc.blocks?.length > 0
      ? doc.blocks
          .map(
            (b) =>
              `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${renderBlock(b)}</table>`,
          )
          .join("")
      : `<div class="mail-empty"><p>Empty preset</p></div>`;

  return `
    <div class="wire-frame wire-frame-live" data-size="${escapeAttr(preset.size || "")}">
      <div class="wire-frame-meta">
        <span class="wire-frame-name">${escapeAttr(preset.label)}</span>
        <span class="wire-frame-size">${escapeAttr(preset.size)}</span>
      </div>
      <div class="wire-preview-clip">
        <div class="mail-sheet wire-mail-sheet">
          ${body}
          <div class="mail-footer-note">Janta Power · Dallas, TX · jantaus.com</div>
        </div>
      </div>
      <p class="wire-frame-blurb">${escapeAttr(preset.blurb || "")}</p>
    </div>`;
}

function escapeAttr(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
