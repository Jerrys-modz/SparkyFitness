#!/bin/sh
# Post-processes the already-built SparkyFitness frontend static files
# (copied in from the published codewithcj/sparkyfitness image) so the app
# can be embedded under Home Assistant Ingress, WITHOUT touching the
# SparkyFitnessFrontend source that every other deployment (Docker Compose,
# Helm, mobile) uses unmodified.
#
# Ingress serves this app's pages from a per-install path like
# /api/hassio_ingress/<token>/, but the frontend build assumes it is served
# from "/": index.html references "/assets/...", the router has no basename,
# and the bundle requests root-absolute URLs. Fixed here by:
#   1. Injecting <base href="/"> (nginx rewrites it per request from the
#      X-Ingress-Path header, see nginx.conf) plus ingress-shim.js, and making
#      index.html's own asset/icon/manifest references relative to that base.
#   2. Giving React Router a runtime basename (window.__SPARKY_BASE__, set by
#      the shim) so routes still match under the ingress prefix.
#   3. Pointing the post-logout full-page redirect at that basename too.
# Everything else root-absolute (API calls, auth client, translations,
# images, lazy-loaded CSS) is prefixed at runtime by ingress-shim.js.
#
# For direct port access <base href> stays "/", window.__SPARKY_BASE__ is
# "", and every patched expression evaluates exactly as before.
#
# Intentionally loud on failure: if a future frontend release changes how
# these are built or bundled, this script must fail the Docker build rather
# than silently ship a broken Ingress panel.

set -eu

HTML_ROOT="${1:-/usr/share/nginx/html}"
SHIM_SRC="${2:-/tmp/ingress-shim.js}"
INDEX_HTML="${HTML_ROOT}/index.html"

fail() {
  echo "patch-ingress-paths: $*" >&2
  exit 1
}

# Counts literal/regex matches across files that are minified onto one line,
# where `grep -c` (lines) would undercount.
count_matches() {
  pattern="$1"
  shift
  cat "$@" | grep -oE "${pattern}" | wc -l | tr -d ' '
}

[ -f "${INDEX_HTML}" ] || fail "${INDEX_HTML} not found"
[ -f "${SHIM_SRC}" ] || fail "${SHIM_SRC} not found"
grep -q '<head>' "${INDEX_HTML}" || fail "<head> not found in ${INDEX_HTML}"
ls "${HTML_ROOT}"/assets/*.js >/dev/null 2>&1 || fail "no JS bundles in ${HTML_ROOT}/assets"

# 1a. <base> first in <head>, then the shim so it runs before any module.
cp "${SHIM_SRC}" "${HTML_ROOT}/ingress-shim.js"
if ! grep -q '<base href=' "${INDEX_HTML}"; then
  sed -i 's#<head>#<head><base href="/"><script src="ingress-shim.js"></script>#' "${INDEX_HTML}"
fi

# 1b. index.html's own references, relative to that <base>. registerSW.js is
#     left absolute on purpose: under Ingress it then 404s on Home
#     Assistant's origin instead of registering a service worker scoped to
#     all of Home Assistant.
grep -q 'src="/assets/' "${INDEX_HTML}" \
  || fail "no /assets/ script found in ${INDEX_HTML} (frontend build layout changed?)"
sed -i \
  -e 's#href="/assets/#href="assets/#g' \
  -e 's#src="/assets/#src="assets/#g' \
  -e 's#href="/favicon.ico"#href="favicon.ico"#g' \
  -e 's#href="/images/#href="images/#g' \
  -e 's#href="/manifest\.#href="manifest.#g' \
  "${INDEX_HTML}"

# 2. React Router: createBrowserRouter(routes, opts) forwards opts.basename,
#    which the app never sets. Fall back to the runtime ingress prefix.
#    Minified as `basename:t?.basename,getContext:t?.getContext,...`.
ROUTER_RE='basename:([A-Za-z_$][A-Za-z0-9_$]*)\?\.basename,getContext:'
ROUTER_HITS=$(count_matches "${ROUTER_RE}" "${HTML_ROOT}"/assets/*.js)
[ "${ROUTER_HITS}" -gt 0 ] \
  || fail "React Router basename option not found (react-router build changed?)"
sed -i -E \
  "s#${ROUTER_RE}#basename:\\1?.basename||window.__SPARKY_BASE__||void 0,getContext:#g" \
  "${HTML_ROOT}"/assets/*.js
grep -q 'basename||window.__SPARKY_BASE__' "${HTML_ROOT}"/assets/*.js \
  || fail "React Router basename patch did not apply"

# 3. Sign-out does `window.location.href = '/'`, which under Ingress would
#    load Home Assistant's own UI inside the panel iframe. (The backticks are
#    the minifier's JS template literals, not shell expansions.)
# shellcheck disable=SC2016
LOGOUT_HITS=$(count_matches 'location\.href=`/`' "${HTML_ROOT}"/assets/*.js)
if [ "${LOGOUT_HITS}" -gt 0 ]; then
  # shellcheck disable=SC2016
  sed -i 's#location\.href=`/`#location.href=(window.__SPARKY_BASE__||``)+`/`#g' \
    "${HTML_ROOT}"/assets/*.js
else
  echo "patch-ingress-paths: WARNING: sign-out redirect not found; skipping" >&2
fi

echo "patch-ingress-paths: patched ${INDEX_HTML}, ${ROUTER_HITS} router basename(s), ${LOGOUT_HITS} sign-out redirect(s)."
