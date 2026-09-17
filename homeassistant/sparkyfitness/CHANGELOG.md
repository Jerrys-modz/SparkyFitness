# Changelog

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
