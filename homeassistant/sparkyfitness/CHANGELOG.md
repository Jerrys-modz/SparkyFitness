# Changelog

## 1.3.1

- Fix the Ingress sidebar panel, which showed "Unable to preload CSS" and
  never loaded: lazily loaded chunks, translations, sign-in, images, and
  page routing all still used root-absolute paths that resolved against
  Home Assistant instead of the add-on. `ingress-shim.js` now prefixes
  those at runtime, and the router and sign-out redirect use the Ingress
  path as their base.
- Fix sign-in through Ingress being rejected as an untrusted origin when
  Home Assistant is reached by hostname or through Nabu Casa.
- Only trust `X-Ingress-Path` from the Supervisor.
- Fix boolean options (for example **Force email login**) being ignored
  when switched off.
- Stop the add-on when the API, database, or Garmin service exits, so the
  watchdog restarts it instead of Nginx serving a UI with no backend.

## 1.3.0

- Replace the **Show in sidebar** Lovelace-dashboard workaround with real
  Home Assistant **Ingress** support: the add-on now gets a native sidebar
  panel that works over HTTPS too (including Nabu Casa Cloud remote
  access), instead of an embedded `http://` iframe that Home Assistant
  refuses to load under HTTPS.
- This is implemented entirely inside the add-on's own `Dockerfile`
  (`patch-ingress-paths.sh` + a matching `nginx.conf` rewrite) rather than
  in the shared SparkyFitnessFrontend source, so Docker Compose, Helm, and
  mobile installs are unaffected. See
  [Sidebar](DOCS.md#sidebar) for how it works.
- Removed `homeassistant_api` access and the `show_in_sidebar` option —
  no longer needed now that Ingress provides the sidebar panel natively
  (with its own stock "Show in sidebar" toggle on the add-on's Info page).

## 1.2.2

- Document (and log a heads-up for) Home Assistant's "Unable to load
  iframes pointing at websites using http" banner: it appears whenever
  Home Assistant itself is reached over `https://` (Nabu Casa remote
  access, a reverse proxy, your own certificate) while Public URL is still
  `http://...`, since this add-on doesn't terminate TLS. See
  [Sidebar shortcut](DOCS.md#sidebar-shortcut) for the fix (a
  TLS-terminating reverse proxy in front of the add-on).

## 1.2.1

- Fix **Show in sidebar** always failing with `invalid_format` ("Url path
  needs to contain a hyphen"). Home Assistant rejects single-word Lovelace
  dashboard `url_path`s; the add-on now registers itself under
  `sparky-fitness` instead of `sparkyfitness`.

## 1.2.0

- Add **Show in sidebar** (on by default). The add-on now registers its own
  Lovelace dashboard in Home Assistant on start, so SparkyFitness shows up
  in the sidebar without hand-editing `configuration.yaml`. Requires the
  add-on's new `homeassistant_api: true` permission (granted automatically).
- Manual `panel_iframe` setup is still documented as a fallback.

## 1.1.1

- Fix the add-on failing to start with `nginx: [emerg] "limit_req_zone"
  directive is not allowed here`. Alpine's `nginx` package includes
  `conf.d/*.conf` at the top-level context and `http.d/*.conf` inside
  `http {}`; the generated site config now lands in `http.d` instead of
  `conf.d`.

## 1.1.0

- Configuration tab covers Garmin, email, login flags, private-network AI,
  public API docs, and a free-form env-var list for everything else.
- Optional bundled Garmin Connect microservice (toggle **Enable Garmin**).

## 1.0.0

- Initial Home Assistant add-on: bundled PostgreSQL, SparkyFitness server,
  and web UI from the official Docker images.
- Install from this repository on HAOS (including Raspberry Pi 5 / aarch64).
