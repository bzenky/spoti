# Security policy

## Reporting a vulnerability

Please do not disclose authentication or credential vulnerabilities in a public issue. Report them privately through the repository host's security-advisory feature.

Never include Spotify client secrets, access tokens, refresh tokens, authorization codes, or credential files in a report. Redact client IDs from screenshots and logs even though OAuth client IDs are public identifiers.

## Supported versions

Until the first stable release, only the latest published `0.x` version receives security fixes.

## Credential model

`spoti` uses Authorization Code with PKCE and does not use or accept a Spotify client secret. Each user supplies a Spotify application client ID through `SPOTIFY_CLIENT_ID`. Tokens are stored outside the project directory with user-only file permissions.
