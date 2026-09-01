# Janta Power — Email Brand Tokens

Reference for all Gmail-ready templates in this pack. Source of truth: [jantaus.com](https://jantaus.com/).

## Colors

| Token | Hex | Use |
|-------|-----|-----|
| Zenith / header | `#1a2332` | Dark header backgrounds |
| Deep navy | `#151f28` | Theme / strongest dark |
| Mid blue | `#2a5080` | Accents, secondary text on dark |
| Horizon blue | `#3a84dc` | Links, CTAs, metric highlights |
| Body text | `#1a2332` | Primary copy on light backgrounds |
| Muted text | `#5a6a7a` | Secondary lines, meta |
| Divider | `#d8dee6` | Hairlines |
| Surface | `#ffffff` | Email body background |
| Soft surface | `#f4f7fa` | Metric row / subtle bands |

## Typography

Email-safe stack (with DM Sans when the client loads Google Fonts):

```
'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif
```

| Role | Size | Weight |
|------|------|--------|
| Email headline | 22–24px | 600–700 |
| Body | 15–16px | 400 |
| Metric value | 20–22px | 700 |
| Metric label | 11–12px | 500 |
| Footer / legal | 11–12px | 400 |

Line height: ~1.5 for body, ~1.25 for headlines.

## Voice

- Confident, concise, technical enough for infrastructure buyers
- Lead with **power density** and **land scarcity** for data centers
- One idea, one ask per email
- Prefer concrete proof (Munich Airport pilot, 50% more energy, 3× power/unit area) over adjectives
- Tagline: **More Power. Less Land.**

## Company facts (for copy)

- **Company:** Janta Power
- **Product:** Vertically scaling, sun-tracking 3D solar towers
- **Proof points:** ~50% more energy · 3× power per unit area · up to ~34% capacity factor (vs traditional solar)
- **Credibility:** Munich Airport pilot, Greentown Labs, DFW / industry press
- **Web:** https://jantaus.com/
- **Email:** info@jantaus.com
- **Phone:** (469) 694-3818
- **Address:** 2265 Monitor St, Dallas TX, 75207

## Hosted assets

| Asset | URL |
|-------|-----|
| Primary logo | `/assets/janta-logo.png` (local studio) — host on HTTPS for real sends |
| Vision banner (OG) | https://jantaus.com/marketing/vision-banner.png |

Logo is the official **P + sun** mark with a transparent background. Place it on dark headers (`#1a2332`) for contrast. Prefer public HTTPS for Gmail recipients. Images may be blocked until “Display images” is clicked.

## Placeholders

Replace before sending:

| Placeholder | Meaning |
|-------------|---------|
| `{{FirstName}}` | Prospect first name |
| `{{Company}}` | Prospect company / campus |
| `{{YourName}}` | Sender full name |
| `{{YourTitle}}` | Sender title |
| `{{YourEmail}}` | Sender email |
| `{{YourPhone}}` | Sender phone (optional) |
| `{{CalendarLink}}` | Booking / Calendly URL |

## Layout rules (Gmail)

- Max content width **600px**
- Table-based structure + **inline CSS** only in paste blocks
- Single primary CTA button (`#3a84dc` fill, white text)
- Dark header / light body for rich templates; logo sits on black or navy header bars
