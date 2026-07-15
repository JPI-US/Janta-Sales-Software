# HubSpot link (local + company server)

Same steps everywhere: one **Private App token** in `.env` on the machine that runs the app.

## 1. HubSpot (once per company)

1. HubSpot → **Settings** → **Integrations** → **Private Apps** → **Create**
2. Scopes: `crm.objects.contacts` read/write, `crm.objects.deals` read/write, `crm.objects.owners` read
3. Copy the **access token**

## 2. This project

Create `.env` in the project root (copy from `.env.example`):

```env
HUBSPOT_ENABLED=true
HUBSPOT_ACCESS_TOKEN=pat-your-token-here
```

**HubSpot is OFF unless `HUBSPOT_ENABLED=true`.** Having a token alone does nothing.

Optional — map deal stages (copy `server/hubspot.config.example.json` → `server/hubspot.config.json` and fill stage IDs from HubSpot → Deals → Pipelines).

## 3. Run locally

**Development (hot reload):**

```bash
npm run dev
```

Open the URL shown (e.g. http://localhost:5173).

**Same as production (built app + API on one port):**

```bash
npm run build
npm start
```

Open http://localhost:3001

## 4. In the app

1. Sign in with the **same email you use in HubSpot**
2. Open **Projects**
3. Click **Sync HubSpot** (or wait for auto-sync on load)
4. HubSpot **deals** appear as projects; saving a project updates HubSpot

No per-user HubSpot login — one company token on the server.

## 5. Move to a shared company server

On the server:

1. Clone/copy this repo (or deploy `dist/` + `server/`)
2. Copy the **same** `.env` (or set `HUBSPOT_ACCESS_TOKEN` in host secrets)
3. Set a persistent data path (optional):

   ```env
   PROPOSALS_DATA_DIR=/var/janta/proposals
   PORT=3001
   ```

4. Run:

   ```bash
   npm install
   npm run build
   npm start
   ```

5. Point users at `http://your-server:3001` (or put nginx/HTTPS in front)

Back up `PROPOSALS_DATA_DIR` and `.env`. Do not commit `.env` to git.
