# Contributing to spoti

## Local setup

Create a Spotify application in the [Developer Dashboard](https://developer.spotify.com/dashboard) and register:

```text
http://127.0.0.1:43821/callback
```

Set your public application client ID in the environment:

```bash
export SPOTIFY_CLIENT_ID="your-client-id"
```

Never commit client IDs, client secrets, access tokens, refresh tokens, authorization codes, or local credential files. `spoti` is a public PKCE client and does not use a client secret.

## Spotify API requirements

- Check endpoint paths, parameters, response schemas, status codes, and deprecation markers against Spotify's [OpenAPI specification](https://developer.spotify.com/reference/web-api/open-api-schema.yaml). Do not infer API fields.
- Use Authorization Code with PKCE for user data. Never use the deprecated Implicit Grant flow.
- Request only scopes required by implemented features.
- Use HTTPS redirect URIs except for explicit `http://127.0.0.1` local-development callbacks. Do not use `localhost` or wildcard redirects.
- Store user tokens only for authentication and immediate API use. Refresh expiring access tokens and require login again when a refresh token is invalid or revoked.
- Respect `Retry-After` on HTTP 429 responses and use bounded exponential backoff.
- Do not introduce deprecated endpoints. Use `/playlists/{id}/items` and `/me/library` for future playlist and library mutations.
- Preserve Spotify API error messages when presenting actionable errors to users.
- Do not persist Spotify catalog content beyond immediate use, download Spotify audio, train machine-learning models with Spotify data, or remove required Spotify attribution.
- Follow the [Spotify Developer Terms](https://developer.spotify.com/terms).

## Validation

Before opening a change, run:

```bash
npm run verify
```
