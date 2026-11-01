#!/usr/bin/env bash
set -euo pipefail

# Create the Obsidian release tag.
#
# Usage:
#   ./release.sh                # patch bump, commit version files, tag, push
#   ./release.sh minor          # minor bump
#   ./release.sh major          # major bump
#   ./release.sh --tag-only     # tag the current manifest version without bumping
#
# Auto-bump mode requires a clean working tree and commits ONLY
# package.json, package-lock.json, manifest.json, and versions.json.
# It does not commit any other changes.
#
# Tags never use a "v" prefix: Obsidian requires the tag to exactly match
# manifest.json's version.

cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Create the Obsidian release tag.

Usage:
  ./release.sh                # patch bump, commit version files, tag, push
  ./release.sh minor          # minor bump
  ./release.sh major          # major bump
  ./release.sh --tag-only     # tag current manifest version without bumping

Auto-bump mode requires a clean working tree and commits ONLY
package.json, package-lock.json, manifest.json, and versions.json.
It does not commit any other changes.

Tags never use a "v" prefix: Obsidian requires the tag to exactly match
manifest.json's version.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

TAG_ONLY=0
if [[ "${1:-}" == "--tag-only" ]]; then
  TAG_ONLY=1
  shift
fi

BUMP="${1:-patch}"
if [[ "$TAG_ONLY" -eq 1 && $# -gt 0 ]]; then
  echo "--tag-only takes no additional arguments." >&2
  exit 1
fi

if [[ "$TAG_ONLY" -eq 0 ]]; then
  case "$BUMP" in
    patch|minor|major) ;;
    *)
      echo "Unknown bump type: $BUMP (expected patch, minor, or major)." >&2
      exit 1
      ;;
  esac
fi

if [[ $# -gt 1 ]]; then
  echo "Too many arguments. Run ./release.sh --help." >&2
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "release.sh must be run from the repository root." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No git remote named origin." >&2
  exit 1
fi

if ! git symbolic-ref --short HEAD >/dev/null 2>&1; then
  echo "Cannot tag from a detached HEAD." >&2
  exit 1
fi

BRANCH="$(git symbolic-ref --short HEAD)"

for file in manifest.json package.json versions.json scripts/version-bump.mjs; do
  if [[ ! -f "$file" ]]; then
    echo "Missing $file." >&2
    exit 1
  fi
done

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"

if [[ "$PACKAGE_VERSION" != "$MANIFEST_VERSION" ]]; then
  echo "package.json ($PACKAGE_VERSION) and manifest.json ($MANIFEST_VERSION) versions do not match." >&2
  exit 1
fi

if ! node -e "const versions=require('./versions.json'); process.exit(versions[process.argv[1]] ? 0 : 1)" "$MANIFEST_VERSION"; then
  echo "versions.json does not contain $MANIFEST_VERSION." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit your changes before releasing." >&2
  echo
  git status --short
  exit 1
fi

git fetch --tags origin

if [[ "$TAG_ONLY" -eq 1 ]]; then
  TARGET_VERSION="$MANIFEST_VERSION"
else
  TARGET_VERSION="$(node -e '
    const [major, minor, patch] = require("./package.json").version.split(".").map(Number);
    let m = major, n = minor, p = patch;
    if (process.argv[1] === "major") { m += 1; n = 0; p = 0; }
    else if (process.argv[1] === "minor") { n += 1; p = 0; }
    else { p += 1; }
    console.log(`${m}.${n}.${p}`);
  ' "$BUMP")"
fi

if git rev-parse --verify --quiet "refs/tags/$TARGET_VERSION" >/dev/null; then
  echo "Local tag $TARGET_VERSION already exists." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$TARGET_VERSION" >/dev/null 2>&1; then
  echo "Remote tag $TARGET_VERSION already exists." >&2
  exit 1
fi

if [[ "$TAG_ONLY" -eq 0 ]]; then
  echo "Bumping $BUMP version to $TARGET_VERSION..."
  npm version "$BUMP" --no-git-tag-version --tag-version-prefix="" >/dev/null

  if [[ "$(node -p "require('./package.json').version")" != "$TARGET_VERSION" ]]; then
    echo "Version bump did not produce $TARGET_VERSION." >&2
    exit 1
  fi

  npm_package_version="$TARGET_VERSION" node scripts/version-bump.mjs >/dev/null

  if [[ "$(node -p "require('./manifest.json').version")" != "$TARGET_VERSION" ]]; then
    echo "manifest.json was not updated to $TARGET_VERSION." >&2
    exit 1
  fi

  git add package.json package-lock.json manifest.json versions.json
  git commit -m "chore: release $TARGET_VERSION"
else
  echo "Tagging current manifest version $TARGET_VERSION without bumping."
fi

echo "Creating tag $TARGET_VERSION at $(git rev-parse --short HEAD)..."
git tag -a "$TARGET_VERSION" -m "$TARGET_VERSION"

if [[ "$TAG_ONLY" -eq 0 ]]; then
  echo "Pushing $BRANCH and tag $TARGET_VERSION..."
  git push origin "$BRANCH"
else
  echo "Pushing tag $TARGET_VERSION only..."
fi

git push origin "$TARGET_VERSION"

echo
echo "Tagged $TARGET_VERSION"
echo "GitHub Actions will build the release from this tag."
