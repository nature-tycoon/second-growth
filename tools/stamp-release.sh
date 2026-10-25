#!/bin/sh
# Write this commit's date and short hash into js/release.js (or the copy named), for the deploy
# workflows, so each release reads differently in PostHog (renderer_revision and release).
set -e
f="${1:-js/release.js}"
id="$(git log -1 --format=%cs)-$(git rev-parse --short HEAD)"
sed -i.bak "s/RELEASE = 'dev'/RELEASE = '$id'/" "$f" && rm -f "$f.bak"
grep -q "RELEASE = '$id'" "$f" || { echo "Could not stamp the release into $f" >&2; exit 1; }
echo "Release $id"
