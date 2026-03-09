# Docker Infrastructure Centralization

## Goal

Move all Docker orchestration files under a new `docker/` directory to reduce root clutter, and clean up stale references from the pre-Go era.

## Target Structure

```
docker/
├── docker-compose.yml          # Dev (postgres, redis, backend, frontend)
├── docker-compose.prod.yml     # Prod (postgres, redis, backend, frontend, nginx)
├── nginx/
│   └── proxy.conf              # Prod reverse proxy config
└── secrets/
    └── .gitkeep                # Gitignored prod secrets placeholder

backend/
├── Dockerfile                  # Unchanged
└── .dockerignore               # Cleaned (Python entries removed)

frontend/
├── Dockerfile                  # Unchanged
├── nginx.conf                  # Stays (needed by Dockerfile COPY)
└── .dockerignore               # Unchanged
```

## Changes

### Files moved
- `docker-compose.yml` -> `docker/docker-compose.yml`
- `docker-compose.prod.yml` -> `docker/docker-compose.prod.yml`

### Files deleted
- Root `.dockerignore` (only matters for builds from root, which never happens)

### Files created
- `docker/nginx/proxy.conf` — nginx reverse proxy config for prod
- `docker/secrets/.gitkeep` — placeholder for prod secrets

### Files modified

**`docker/docker-compose.yml` (dev)**
- Build contexts updated to `../backend` and `../frontend`
- Drop deprecated `version: '3.8'`
- Credential volume path updated to `../creds`

**`docker/docker-compose.prod.yml` (prod)**
- Full rewrite from MongoDB to PostgreSQL to match current Go stack
- Services: postgres, redis, backend, frontend, nginx
- Docker secrets for credentials
- Resource limits retained
- Nginx reverse proxy retained (easy to remove later)
- Build contexts point to `../backend` and `../frontend`
- Secret file paths point to `./secrets/`

**`backend/.dockerignore`**
- Remove Python/UV-specific entries
- Add Go-relevant entries (bin/, vendor/, tmp/)

**`Makefile`**
- All docker targets updated with `-f docker/docker-compose.yml`
- Prod targets updated with `-f docker/docker-compose.prod.yml`

**`CLAUDE.md`**
- Docker command references updated

### Files unchanged
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `frontend/.dockerignore`

## Design Decisions

1. **Dockerfiles stay in service dirs** — They need access to their build context. Moving them would require widening build contexts or restructuring COPY paths.
2. **`frontend/nginx.conf` stays** — It's COPY'd during `docker build` and must be inside the frontend build context.
3. **Root `.dockerignore` deleted** — No builds run from root; each service has its own `.dockerignore`.
4. **Nginx kept in prod compose** — User may handle proxying externally later, but keeping it for now provides a complete prod setup.
5. **Prod compose rewritten for PostgreSQL** — The old MongoDB/mongo-init.js references were from the Python era and no longer apply.
