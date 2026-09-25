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

When you pull down new commits and copy them over an already-installed
local add-on, hitting **Update** rebuilds the image, but the Supervisor UI
can keep showing a stale **Configuration** tab (missing new options) until
you fully **uninstall and reinstall** the local add-on. Data in `/data`
(database, uploads, secrets) is tied to the slug and normally survives
that, but back it up first if you're unsure.

## Mobile app

In the SparkyFitness iOS/Android app, use the **same Public URL** (including
the port). Do not use a Home Assistant Ingress / `/api/hassio_ingress/…`
URL — that path is per-install and can change, and it requires an active,
authenticated Home Assistant session to even resolve, neither of which the
mobile app can rely on. The phone needs a stable, directly-reachable
host:port.

On Android 13+, allow **Alarms & reminders** if you want rest-timer alerts
on time.

## Sidebar

The add-on uses Home Assistant **Ingress**, so it gets a real sidebar entry
automatically — no dashboard to create, no `configuration.yaml` editing,
and (unlike a plain `http://` iframe) it works over HTTPS too, including
through **Nabu Casa Cloud remote access**, because Ingress is proxied
through Home Assistant Core's own connection rather than needing its own
certificate.

- Icon and sidebar entry appear as soon as the add-on is installed and
  started. If you don't want it in the sidebar, use the add-on's own
  **Show in sidebar** toggle on its Info page (this is a stock Supervisor
  feature for any Ingress add-on, not something this add-on adds).
- Click the add-on, or **Open Web UI**, to open it embedded in the Home
  Assistant UI.
- This is on top of, not instead of, direct port access — **Public URL**
  (`http://homeassistant.local:3004` by default) still works for opening
  SparkyFitness in its own tab, and is still what the mobile app and
  Extra trusted origins need (see [Mobile app](#mobile-app)).

### How this works without changing the shared frontend

SparkyFitnessFrontend (used by every install method — Docker Compose,
Helm, this add-on, and the mobile app's web view) builds root-absolute
asset and API paths (`/assets/...`, `/api/...`). Under Ingress, Home
Assistant serves the page from a per-install path like
`/api/hassio_ingress/<token>/`; a browser resolves those root-absolute
paths against Home Assistant's own origin instead, bypassing Ingress
entirely and 404ing.

Rather than changing that shared frontend source, this add-on's own
`Dockerfile` post-processes the already-built static files (copied from
the published `codewithcj/sparkyfitness` image) with
[`patch-ingress-paths.sh`](patch-ingress-paths.sh):

- `index.html` gets a `<base href="/">` tag, which `nginx.conf` rewrites
  per request to the `X-Ingress-Path` prefix, and its asset references
  become relative to it.
- [`ingress-shim.js`](ingress-shim.js) loads before the app and, only
  under Ingress, prefixes the bundle's remaining root-absolute requests
  (API calls, sign-in, translations, images, lazily loaded CSS) with that
  prefix.
- React Router and the sign-out redirect get the prefix as their base
  path, so pages, deep links, and reloads stay inside the panel.

Nginx only honours `X-Ingress-Path` from the Supervisor (`172.30.32.2`).
Under Ingress the browser's origin is Home Assistant's own URL, so nginx
also presents **Public URL** as the origin on API calls; without that,
sign-in would be rejected as coming from an untrusted origin. Direct port
access never has the header, so `<base href="/">` stays untouched and the
app behaves exactly as before. No other deployment is affected, because
nothing outside this add-on's image runs that patch.

Emailed links (password reset, magic link) and third-party OAuth callbacks
(Fitbit, Withings, and so on) still point at the address the page was
opened from, which under Ingress is Home Assistant. Start those flows from
**Public URL** instead of the sidebar panel.

This is intentionally brittle-but-loud: if a future frontend release
changes how these paths get bundled, the patch script fails the Docker
build (rather than silently shipping a broken sidebar), which is your
signal to update the patterns in `patch-ingress-paths.sh`.

## Configuration

These map to the add-on **Configuration** tab in Home Assistant.

| Option | Meaning |
| --- | --- |
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

## Why not HACS?

**HACS** is for frontend cards and Python integrations. This is a
Supervisor **add-on** (a container), which is what Mealie and Donetick use
to host an app. See [Sidebar](#sidebar) above for how the add-on gets a
native Ingress sidebar panel without HACS.

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
