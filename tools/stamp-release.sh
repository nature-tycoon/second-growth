#!/bin/sh
# Write this commit's date and short hash into js/release.js (or the copy named), for the deploy
# workflows, so each release reads differently in PostHog (renderer_revision and release). Also
# write version.json beside index.html: the release and the game's files, which the game fetches
# (no-store) at launch and now and then to learn a newer version is live (js/fresh-version.js).
set -e
f="${1:-js/release.js}"
id="$(git log -1 --format=%cs)-$(git rev-parse --short HEAD)"
sed -i.bak "s/RELEASE = 'dev'/RELEASE = '$id'/" "$f" && rm -f "$f.bak"
grep -q "RELEASE = '$id'" "$f" || { echo "Could not stamp the release into $f" >&2; exit 1; }
root="$(dirname "$(dirname "$f")")"
files="$(cd "$root" && find js -name '*.js' | sort | sed 's/.*/"&"/' | paste -sd, -)"
printf '{ "release": "%s", "files": [%s] }\n' "$id" "$files" > "$root/version.json"
echo "Release $id"
