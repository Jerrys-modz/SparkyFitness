#!/usr/bin/env bash
# Lists the feat commits that changed the mobile app since the What's New
# content was last bumped. Prints "<short sha>|<subject>" lines on stdout and
# nothing when the screen is up to date. Run from anywhere inside the repo with
# full history (fetch-depth: 0 in CI).
set -euo pipefail

version_file=SparkyFitnessMobile/src/services/whatsNewBanner.ts

marker=$(git log -1 --format=%H -G'WHATS_NEW_CONTENT_VERSION = [0-9]+' -- "$version_file")
if [ -z "$marker" ]; then
  echo "Could not find a WHATS_NEW_CONTENT_VERSION change in history" >&2
  exit 1
fi
echo "Last What's New bump: $(git log -1 --format='%h %ad %s' --date=short "$marker")" >&2

git log --no-merges --format='%h|%s' "$marker"..HEAD -- SparkyFitnessMobile/src |
  grep -E '^[0-9a-f]+\|feat(\(|:|!)' || true
