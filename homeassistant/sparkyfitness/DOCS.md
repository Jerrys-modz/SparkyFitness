# SparkyFitness Home Assistant add-on

This add-on runs the SparkyFitness **server** (web app, API, and PostgreSQL)
inside Home Assistant OS. It is the HA equivalent of the Docker Compose
install — not the mobile app.

The reporter of [#2383](https://github.com/CodeWithCJ/SparkyFitness/issues/2383)
wanted something like Mealie or Donetick: one-click install from the Add-on
Store, no second Raspberry Pi.

## Installation

1. In Home Assistant, open **Settings → Add-ons → Add-on Store**.
2. Open the three-dot menu (top right) → **Repositories**.
3. Add `https://github.com/CodeWithCJ/SparkyFitness` and wait for the store
   to refresh (the first fetch clones this whole git repo and can take a
   minute).
4. Find **SparkyFitness**, install it, and wait for the image build. The
   add-on **reuses the published Docker images**; it does not compile the
   app on your Pi, but the first pull is still several hundred MB.
5. Open the **Configuration** tab:
   - Set **Public URL** to how you will actually open the app, for example
     `http://homeassistant.local:3004` or `http://192.168.1.50:3004`.
   - Set **Timezone** to your TZ name (`America/New_York`, `Europe/Brussels`, …).
6. Start the add-on. The first boot initializes the database and can take a
   couple of minutes, especially on a Pi.
7. Open the web UI via the add-on **Open Web UI** button, or visit
   `http://homeassistant.local:3004`.
8. Create your account. Optionally set **Admin email** to that address and
   restart so the user becomes an admin, then enable **Disable signup**.

## Testing a branch (before it is on `main`)

The Add-on Store only reads the repository default branch. To try this
add-on from a PR branch, copy `homeassistant/sparkyfitness/` onto the HA
host as a local add-on:

1. Enable the **Samba share** or **Advanced SSH** add-on.
2. Copy the `sparkyfitness` folder to `/addons/sparkyfitness`.
3. In the Add-on Store, refresh; it appears under **Local add-ons**.

## Mobile app

In the SparkyFitness iOS/Android app, use the **same Public URL** (including
the port). Do not use a Home Assistant ingress / `/api/hassio_ingress/…`
URL — the SPA talks to `/api` on the same origin, and the phone needs a
stable host:port.

On Android 13+, allow **Alarms & reminders** if you want rest-timer alerts
on time.

## Sidebar shortcut

The add-on does not use Ingress (see [Why not HACS / Ingress?](#why-not-hacs--ingress)
below), so it can't register a native Ingress panel. Instead, **Show in
sidebar** (on by default in the Configuration tab) has the add-on create its
own Lovelace dashboard for you on start, pointing at the same Public URL you
already configured — no editing `configuration.yaml` by hand.

This uses the "Home Assistant API" access the add-on requests
(`homeassistant_api: true`), which Home Assistant grants automatically; you
don't need to approve anything separately. On each start the add-on:

- Creates a storage-mode dashboard (`sparkyfitness`) with a full-page iframe
  pointing at **Public URL**, and pins it to the sidebar, if one doesn't
  already exist.
- Updates that dashboard's URL if you change **Public URL**.
- Removes the dashboard again if you turn **Show in sidebar** off.

This step is best-effort and logged with a `[sidebar-panel]` prefix in the
add-on log — if Home Assistant's API isn't reachable yet or the dashboard
already exists with different settings, the add-on still starts normally,
it just skips or retries that part.

If you'd rather manage it yourself (or you're on an older add-on version
without this option), you can add the same kind of shortcut manually with a
`panel_iframe` entry in Home Assistant's own `configuration.yaml`:

```yaml
panel_iframe:
  sparkyfitness:
    title: SparkyFitness
    icon: mdi:dumbbell
    url: "http://homeassistant.local:3004"
```

Use the same Public URL you set in the add-on's Configuration tab, then
restart **Home Assistant Core** (not the add-on) to pick it up.

## Configuration

These map to the add-on **Configuration** tab in Home Assistant.

| Option | Meaning |
| --- | --- |
| Show in sidebar | Auto-creates (and keeps in sync) a Lovelace dashboard pinning SparkyFitness to the HA sidebar. See [Sidebar shortcut](#sidebar-shortcut). |
| Public URL | CORS / Better Auth origin. Must match the URL in your browser and in the mobile app. |
| Timezone | Server TZ database name. |
| Disable signup | Block new registrations after you have created your user. |
| Admin email | If set, that user is granted admin on server start. |
| Log level | `ERROR` (default), `WARN`, `INFO`, or `DEBUG`. |
| Extra trusted origins | Comma-separated extra origins (another LAN hostname, a reverse proxy URL). |
| Allow private-network AI URLs | Let non-admin users point custom AI providers at LAN IPs. |
| Public API docs | Expose Swagger without login. |
| Force email login | Fail-safe so OIDC cannot lock you out. |
| Disable email login | Hide password login (use with OIDC). |
| **Enable Garmin** | Starts the Garmin Connect microservice in this add-on. Link Garmin from SparkyFitness **Settings → External providers** after it is up. |
| Garmin China region | Use garmin.cn. |
| Email host / port / TLS / user / password / from | SMTP for password resets. Leave blank to disable mail. |
| Extra environment variables | Any other `SPARKY_FITNESS_*` / `GARMIN_*` / proxy var from the [environment variables list](https://codewithcj.github.io/SparkyFitness/install/environment-variables). Example name `SPARKY_FITNESS_OIDC_ISSUER_URL`. |

Database passwords and encryption keys are **generated on first start** and
stored in the add-on `/data` volume (`secrets.env`). Do not delete that
volume. Changing generated secrets after the first start will lock you out
of encrypted data and 2FA. You can override them via Extra environment
variables if you really need to.

LAN CORS is enabled automatically (`ALLOW_PRIVATE_NETWORK_CORS`), so a
phone on `http://192.168.x.x:3004` works even when Public URL is
`http://homeassistant.local:3004`.

## Persistence and backups

Home Assistant snapshots include the add-on `/data` directory (PostgreSQL,
uploads, backups, secrets). Use HA backups; do not treat a reinstall without
`/data` as an upgrade.

## Updating

Rebuild/reinstall the add-on to pick up newer `codewithcj/sparkyfitness`
and `codewithcj/sparkyfitness_server` images (`latest`). The database in
`/data` is kept.

## Why not HACS / Ingress?

- **HACS** is for frontend cards and Python integrations. This is a
  Supervisor **add-on** (a container), which is what Mealie and Donetick
  use to host an app.
- **Ingress** (the sidebar iframe at `/api/hassio_ingress/…`) breaks this
  SPA, because the web app calls `/api` on the Home Assistant origin. Use
  the mapped port instead. See [Sidebar shortcut](#sidebar-shortcut) above
  for a way to still get a sidebar icon without Ingress.

## Hardware

Tested design target: HAOS on Raspberry Pi 5 (aarch64) and amd64. The
add-on needs roughly 1 GB RAM free on top of Home Assistant. 32-bit ARM
(armv7) is not supported — those images are not published.

Garmin Connect sync is optional: turn on **Enable Garmin** in the
Configuration tab. First add-on install is slower because the Garmin Python
dependencies are built into the image.

## Alternative: Portainer

If you already run the Portainer add-on, you can keep using
[the Portainer compose guide](https://codewithcj.github.io/SparkyFitness/install/portainer)
instead. This add-on exists so you do not have to.
