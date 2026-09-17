#!/bin/sh
# Post-processes the already-built SparkyFitness frontend static files
# (copied in from the published codewithcj/sparkyfitness image) so the app
# can be embedded under Home Assistant Ingress, WITHOUT touching the
# SparkyFitnessFrontend source that every other deployment (Docker Compose,
# Helm, mobile) uses unmodified.
#
# Ingress serves this app's pages from a per-install path like
# /api/hassio_ingress/<token>/, but the frontend build emits root-absolute
# references ("/assets/x.js", and the API client's "/api" fetch base). A
# browser resolves those against Home Assistant's own origin, bypassing the
# ingress path prefix entirely, so both the page's JS bundles and its API
# calls 404 under ingress. Fixed here by:
#   1. Making index.html's script/modulepreload/stylesheet references
#      relative, behind a <base href="/"> tag that nginx rewrites
#      per-request from the X-Ingress-Path header (see nginx.conf). Left at
#      "/" by default, this is a byte-for-byte no-op for direct port access.
#   2. Making the bundled API base URL relative too, so fetch() resolves
#      against that same <base href>.
#
# This only ever touches files inside the HA add-on's own image layer; it
# never modifies the SparkyFitnessFrontend git source.
#
# Intentionally loud on failure: if a future frontend release changes how
# these are built or bundled, this script must fail the Docker build rather
# than silently ship a broken Ingress panel.

set -eu

HTML_ROOT="${1:-/usr/share/nginx/html}"
INDEX_HTML="${HTML_ROOT}/index.html"

fail() {
  echo "patch-ingress-paths: $*" >&2
  exit 1
}

[ -f "${INDEX_HTML}" ] || fail "${INDEX_HTML} not found"
grep -q '<head>' "${INDEX_HTML}" || fail "<head> not found in ${INDEX_HTML}"

# 1a. Inject a <base> tag as the first thing in <head>, defaulting to "/".
if ! grep -q '<base href=' "${INDEX_HTML}"; then
  sed -i 's#<head>#<head>\n    <base href="/">#' "${INDEX_HTML}"
fi

# 1b. Make the built script/modulepreload/stylesheet tags relative to that
#     <base> instead of root-absolute.
grep -q 'href="/assets/' "${INDEX_HTML}" || grep -q 'src="/assets/' "${INDEX_HTML}" \
  || fail "no /assets/ references found in ${INDEX_HTML} (frontend build layout changed?)"
sed -i \
  -e 's#href="/assets/#href="assets/#g' \
  -e 's#src="/assets/#src="assets/#g' \
  "${INDEX_HTML}"

# 2. The SPA's API client bundles its base URL ("/api") as a standalone
#    string literal (see SparkyFitnessFrontend/src/api/api.ts). Absolute
#    paths ignore <base href> entirely, so make that one literal relative
#    too, wherever it landed after chunking/minification. Handle all three
#    quote styles a minifier might use, plainly (no regex alternation or
#    backreferences, so this doesn't depend on a particular sed dialect).
API_HITS=0
for f in "${HTML_ROOT}"/assets/*.js; do
  [ -f "${f}" ] || continue
  if grep -q '`/api`' "${f}" || grep -q '"/api"' "${f}" || grep -q "'/api'" "${f}"; then
    sed -i \
      -e 's#`/api`#`api`#g' \
      -e 's#"/api"#"api"#g' \
      -e "s#'/api'#'api'#g" \
      "${f}"
    API_HITS=$((API_HITS + 1))
  fi
done
[ "${API_HITS}" -gt 0 ] || fail "no bundled '/api' base URL literal found (frontend build changed?)"

echo "patch-ingress-paths: patched ${INDEX_HTML} and ${API_HITS} JS file(s) for Ingress."
