# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-31

### Added

- Publish Obsidian notes as WordPress posts and update linked posts.
- Draft, publish, pending, private, and scheduled statuses.
- Full category picker with search and category creation.
- Tag creation and reuse.
- Featured images from the vault, remote URLs, the first content image, or auto-selection.
- Local image upload to the WordPress media library with link rewriting.
- Optional remote image mirroring.
- Media cache keyed by site, path, size, and modification time.
- Slug, excerpt, post format, comments, pingbacks, sticky, password protection, and password removal.
- Multi-site profiles with per-site defaults.
- Live preview tab inside the publish dialog.
- Remote-change detection with explicit overwrite confirmation.
- Quick publish command, file context menu, ribbon action, and status bar.
- Publish history with open-post/open-note and clear actions.
- Complete Chinese and English UI.
- Frontmatter round-tripping for post ID, URL, site, status, categories, tags, featured media, slug, format, and sync timestamps.
- Wiki-link and internal-note link conversion.
- Unit tests for the REST client, media pipeline, link conversion, Markdown helpers, frontmatter, URLs, and dates.
- Open-source project files: MIT license, contributing guide, code of conduct, security policy, CI, release workflow, issue templates, and documentation.

### Security

- HTML is scrubbed of active content before publishing.
- Remote image downloads never include WordPress credentials.
- Credentials are never logged.
