# Security policy

## Reporting a vulnerability

Please do not disclose authentication or credential vulnerabilities in a public issue. Report them privately through the repository host's security-advisory feature.

Never include Spotify client secrets, access tokens, refresh tokens, authorization codes, or credential files in a report. Redact client IDs from screenshots and logs even though OAuth client IDs are public identifiers.

## Supported versions

Only the latest published version receives security fixes. After `1.0.0`, security fixes target the latest stable `1.x` release unless a newer major version's policy says otherwise.

## Credential model

`spoti` uses Authorization Code with PKCE and does not use or accept a Spotify client secret. Each user saves a public Spotify application client ID with `spoti setup`; `SPOTIFY_CLIENT_ID` remains available as an explicit environment override.

Tokens are stored outside the project directory. On POSIX systems, the credential directory and file are created with user-only permissions. Run `spoti config path` to locate the adjacent configuration directory on the active platform. Never include the credential file or an npm authentication token in a report.
