#!/usr/bin/env bash
# Lists the feat commits that changed the mobile app since the What's New
# content was last bumped. Prints "<short sha>|<subject>" lines on stdout and
# nothing when no such commit exists. Needs full history (fetch-depth: 0 in CI)
# and can be run from any directory inside the repo.
#
# This is a heads-up, not a complete audit: it only matches commit subjects that
# start with feat(, feat: or feat!, so a feature committed under another type is
# missed. Pass --marker to print the last bump commit instead, then audit the
# rest with:
#   git log --no-merges --format='%h %s' "$(.github/scripts/whats-new-drift.sh --marker)..HEAD" -- SparkyFitnessMobile/src
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

version_file=SparkyFitnessMobile/src/services/whatsNewBanner.ts
version_pattern='WHATS_NEW_CONTENT_VERSION = [0-9]+'

# The number assigned to WHATS_NEW_CONTENT_VERSION in a revision of the file,
# or nothing when the file or the line does not exist there.
version_at() {
  git show "$1:$version_file" 2>/dev/null |
    grep -oE "$version_pattern" | grep -oE '[0-9]+$' || true
}

# -G also matches edits that keep the number (an added comment, a reformat), so
# take the newest commit whose value really differs from its first parent's.
marker=
while read -r commit; do
  if [ "$(version_at "$commit")" != "$(version_at "$commit^")" ]; then
    marker=$commit
    break
  fi
done < <(git log --format=%H -G"$version_pattern" -- "$version_file")

if [ -z "$marker" ]; then
  echo "Could not find a WHATS_NEW_CONTENT_VERSION change in history" >&2
  exit 1
fi

if [ "${1:-}" = "--marker" ]; then
  echo "$marker"
  exit 0
fi

echo "Last What's New bump: $(git log -1 --format='%h %ad %s' --date=short "$marker")" >&2

git log --no-merges --format='%h|%s' "$marker"..HEAD -- SparkyFitnessMobile/src |
  grep -E '^[0-9a-f]+\|feat(\(|:|!)' || true
