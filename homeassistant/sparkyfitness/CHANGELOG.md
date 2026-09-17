# Changelog

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
