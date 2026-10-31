# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Describe the impact, affected versions, reproduction steps, and any suggested fix.

If private reporting is unavailable, contact the maintainer through the contact method listed on their GitHub profile and ask for a private channel.

Please include only the minimum data needed to reproduce the issue. Do not send WordPress application passwords, `data.json`, or live credentials; use a disposable test site.

## What to expect

- Acknowledgement within 7 days where possible.
- An assessment and, if confirmed, a coordinated fix and release.
- Credit in the release notes if you want it.

## Scope

Security-sensitive areas include:

- Credential storage and transmission
- URL handling and server-side request forgery through remote image uploads
- HTML/script injection into published posts
- Path traversal when resolving vault files
- Supply-chain risks in build dependencies
- Accidental disclosure of secrets in logs or error messages

## Design notes

- Authentication uses a WordPress Application Password over HTTP Basic.
- Credentials are stored unencrypted in the vault's plugin data (`data.json`). This is documented in the README; use HTTPS and protect the vault.
- WordPress credentials are never attached to third-party remote image downloads.
- Published HTML is scrubbed of scripts, styles, iframes, inline event handlers, and dangerous URL schemes before submission.
- The plugin has no telemetry and makes no network requests except to configured WordPress sites and explicitly enabled remote images.
