#!/bin/sh
# Package the game for itch.io: a zip with index.html at the top level, built from the last
# commit (the tested release), with only the game itself: no farms viewer, dev tools or screenshots.
# Upload dist/second-growth-itch.zip on the game's itch.io Edit page ("This file will be played
# in the browser").
set -e
cd "$(dirname "$0")/.."
# Tests and the archive must refer to the same code. Screenshots and ignored reports are fine.
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard index.html styles.css manifest.json js assets vendor tools .github)" ]; then
  echo "Commit the release changes before packaging: checks run on the working tree, while the zip is built from HEAD." >&2
  exit 1
fi
node tools/check-release.mjs
mkdir -p dist
rm -f dist/second-growth-itch.zip
git archive --format=zip -o dist/second-growth-itch.zip HEAD index.html styles.css manifest.json js assets vendor
echo "dist/second-growth-itch.zip: $(du -h dist/second-growth-itch.zip | cut -f1), $(unzip -l dist/second-growth-itch.zip | tail -1 | awk '{print $2}') files, from commit $(git rev-parse --short HEAD)"
