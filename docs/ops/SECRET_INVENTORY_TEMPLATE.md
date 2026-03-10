# Secret Inventory Template

Use this file as a template to track ownership and rotation of production secrets.

| Secret | Environment | Platform | Owner | Last Rotated | Next Rotation | Notes |
|--------|-------------|----------|-------|--------------|---------------|-------|
| `DATABASE_URL` | dev | Railway | | | | Supabase dev DB URL |
| `DATABASE_URL` | prod | Railway | | | | Supabase prod DB URL |
| `SUPABASE_SERVICE_ROLE_KEY` | dev | Railway | | | | Backend only |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Railway | | | | Backend only |
| `REACT_APP_SUPABASE_ANON_KEY` | dev | Cloudflare | | | | Public key |
| `REACT_APP_SUPABASE_ANON_KEY` | prod | Cloudflare | | | | Public key |
| `REDIS_URL` | dev | Railway | | | | Private Redis URL |
| `REDIS_URL` | prod | Railway | | | | Private Redis URL |
| `GITHUB_TOKEN` | dev | Railway | | | | PAT for sync |
| `GITHUB_TOKEN` | prod | Railway | | | | PAT for sync |
| `GITHUB_WEBHOOK_SECRET` | dev | Railway | | | | Webhook validation |
| `GITHUB_WEBHOOK_SECRET` | prod | Railway | | | | Webhook validation |

Recommended rotation cadence: every 90 days.
