# GitHub OAuth Setup

GitFable uses a self-hosted GitHub OAuth flow and signs its own JWTs.

## Local Development

1. Create a GitHub OAuth App at `https://github.com/settings/developers`.
2. Use these local values:

```text
Homepage URL: http://localhost:3000
Authorization callback URL: http://localhost:8001/api/v1/oauth/github/callback
```

3. Copy the client ID and client secret into `docker/.env`.
4. Set a strong `JWT_SECRET` with at least 32 characters.

Example:

```bash
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
GITHUB_OAUTH_CALLBACK_URL=http://localhost:8001/api/v1/oauth/github/callback
JWT_SECRET=replace_with_a_strong_random_secret
```

## Production

Use your deployed domain for the callback URL:

```text
https://gitfable.app/api/v1/oauth/github/callback
```

For a separate dev environment, use:

```text
https://dev.gitfable.app/api/v1/oauth/github/callback
```

## Related Settings

- `FRONTEND_URL` should match the frontend origin.
- `CORS_ORIGINS` should include the frontend origin.
- `REACT_APP_BACKEND_URL` should point at the backend origin, not `/api/v1`.
