# Supabase Authentication Setup

GitFable uses **Supabase Auth** with GitHub OAuth.

## 1) Create Supabase project

1. Go to `https://supabase.com/dashboard`
2. Create a new project
3. Copy these values from Project Settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (backend only)
   - `SUPABASE_ANON_KEY` (frontend)

## 2) Enable GitHub OAuth in Supabase

1. Open `Authentication -> Providers -> GitHub`
2. Create a GitHub OAuth App at `https://github.com/settings/developers`
3. Use callback URL from Supabase provider settings
4. Paste Client ID/Secret into Supabase

## 3) Configure backend env

Set in `docker/.env`:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

## 4) Configure frontend env

Set in `docker/.env`:

```bash
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
REACT_APP_BACKEND_URL=http://localhost:8001
```

## 5) Auth flow

1. Frontend starts GitHub OAuth with Supabase JS client
2. Supabase returns access token (JWT)
3. Frontend sends `Authorization: Bearer <token>`
4. Backend verifies token with Supabase GoTrue
5. Backend loads/creates user in PostgreSQL using `auth_id`

## 6) Notes

- Keep service role key secret; never expose in frontend
- Keep anon key in frontend only
- `firebase_uid` is currently retained for backward-compatible DB transition and mirrors `auth_id`
