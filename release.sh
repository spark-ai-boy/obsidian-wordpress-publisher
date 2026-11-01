#!/usr/bin/env bash
set -euo pipefail

# One-click release for Obsidian community plugins.
#
# Usage:
#   ./release.sh                 # patch bump, ask before committing dirty changes
#   ./release.sh minor           # minor bump
#   ./release.sh -y patch        # non-interactive, commit all changes
#   ./release.sh -y patch "release: 0.2.0"
#
# The tag intentionally has no "v" prefix: Obsidian requires the release tag
# to exactly match manifest.json's version.

cd "$(dirname "$0")"

usage() {
  sed -n '2,15p' "$0" | sed 's/^# //; s/^#$//'
}

ASSUME_YES=0
if [[ "${1:-}" == "-y" || "${1:-}" == "--yes" ]]; then
  ASSUME_YES=1
  shift
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

BUMP="${1:-patch}"
COMMIT_MESSAGE="${2:-}"

case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "Unknown bump type: $BUMP (expected patch, minor, or major)" >&2
    exit 1
    ;;
esac

if [[ ! -d .git ]]; then
  echo "release.sh must be run from the repository root." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No git remote named origin." >&2
  exit 1
fi

BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
if [[ -z "$BRANCH" ]]; then
  echo "Cannot release from a detached HEAD." >&2
  exit 1
fi

if [[ ! -f manifest.json || ! -f versions.json || ! -f scripts/version-bump.mjs ]]; then
  echo "Missing manifest.json, versions.json, or scripts/version-bump.mjs." >&2
  exit 1
fi

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"
if [[ "$PACKAGE_VERSION" != "$MANIFEST_VERSION" ]]; then
  echo "package.json ($PACKAGE_VERSION) and manifest.json ($MANIFEST_VERSION) versions do not match." >&2
  echo "Align them before releasing." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Working tree changes:"
  git status --short
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Commit all changes and release? [y/N] " answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *) echo "Aborted."; exit 1 ;;
    esac
  fi
fi

echo "Running checks and build..."
npm run check

echo "Bumping $BUMP version..."
npm version "$BUMP" --no-git-tag-version --tag-version-prefix="" >/dev/null

VERSION="$(node -p "require('./package.json').version")"

# Keep manifest.json and versions.json synchronized even if npm's version
# lifecycle was skipped by a custom configuration.
npm_package_version="$VERSION" node scripts/version-bump.mjs >/dev/null

if [[ "$(node -p "require('./manifest.json').version")" != "$VERSION" ]]; then
  echo "manifest.json was not updated to $VERSION." >&2
  exit 1
fi

git fetch --tags origin

if git rev-parse --verify --quiet "refs/tags/$VERSION" >/dev/null; then
  echo "Local tag $VERSION already exists." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1; then
  echo "Remote tag $VERSION already exists." >&2
  exit 1
fi

git add -A

if [[ -z "$COMMIT_MESSAGE" ]]; then
  COMMIT_MESSAGE="chore: release $VERSION"
fi

git commit -m "$COMMIT_MESSAGE"
git tag -a "$VERSION" -m "$VERSION"

echo "Pushing $BRANCH and tag $VERSION..."
git push origin "$BRANCH"
git push origin "$VERSION"

echo
echo "Released $VERSION"
echo "Tag: $VERSION (no v prefix)"
echo "GitHub Actions will build and publish the release."
