# Docker Quick Start Guide

This guide shows you how to run the entire GitFable application using Docker.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- ~2GB free disk space

## Quick Start

### 1. Setup Environment

```bash
# Copy environment templates
make env

# Edit backend/.env with your Firebase credentials
# See docs/firebase-auth-setup.md for Firebase setup
```

### 2. Start Everything

```bash
# Build and start all services
make docker-up

# Or manually:
docker-compose up -d
```

This will start:
- **MongoDB** on port 27017
- **Redis** on port 6379
- **Backend** on port 8001
- **Frontend** on port 3000

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Health**: http://localhost:8001/health
- **API Ready**: http://localhost:8001/ready

### 4. View Logs

```bash
# All services
make docker-logs

# Just backend
make docker-backend-logs

# Just frontend
make docker-frontend-logs
```

### 5. Stop Everything

```bash
make docker-down

# Or:
docker-compose down
```

## Development Mode

The development setup includes:
- **Hot reload** for backend (code changes apply immediately)
- **Hot reload** for frontend (if using npm/yarn directly)
- **Persistent volumes** for MongoDB and Redis data
- **Network** between all services

### Making Changes

**Backend changes:**
- Edit files in `backend/`
- Changes are automatically detected and reloaded
- No need to restart container

**Frontend changes:**
- For Docker: Edit files, then rebuild: `docker-compose build frontend`
- For hot reload: Use `make dev-frontend` separately

## Useful Commands

```bash
# Rebuild all images
make docker-build

# Rebuild specific service
docker-compose build backend

# Run a command in the backend container
docker-compose exec backend bash

# Run Python in backend container
docker-compose exec backend python

# Access MongoDB
docker-compose exec mongodb mongosh -u admin -p password

# Access Redis
docker-compose exec redis redis-cli

# Clean everything (removes volumes too!)
make docker-clean
```

## Production Deployment

### Setup Secrets

```bash
# Create secrets directory
mkdir secrets

# Create secret files (do NOT commit these!)
echo "admin" > secrets/mongodb_root_username.txt
echo "your-secure-password" > secrets/mongodb_root_password.txt
echo "mongodb://admin:your-secure-password@mongodb:27017/gitfable?authSource=admin" > secrets/mongodb_url.txt
echo "your-secure-password" > secrets/redis_password.txt
echo "redis://:your-secure-password@redis:6379" > secrets/redis_url.txt
cp /path/to/firebase-private-key.pem secrets/firebase_private_key.txt

# Set permissions
chmod 600 secrets/*.txt
```

### Start Production

```bash
# Copy production environment
cp .env.prod .env

# Edit .env with production values
# Set CORS_ORIGINS to your domain
# Set BACKEND_URL to your API domain

# Start production stack
make docker-prod-up

# Or:
docker-compose -f docker-compose.prod.yml up -d
```

### Production Architecture

```
Internet
    │
    ▼
┌─────────────┐
│    Nginx    │ ← SSL termination, reverse proxy
│   (80/443)  │
└──────┬──────┘
       │
       ├──▶ Frontend (static files)
       │
       └──▶ Backend API (port 8001)
              │
              ├──▶ MongoDB (port 27017)
              └──▶ Redis (port 6379)
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill process or change port in docker-compose.yml
```

### MongoDB Connection Failed

```bash
# Check MongoDB logs
docker-compose logs mongodb

# Reset MongoDB (WARNING: deletes all data!)
docker-compose down -v
docker-compose up -d
```

### Backend Won't Start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Missing Firebase credentials in .env
# 2. MongoDB not ready yet (wait 30 seconds)
# 3. Invalid environment variables
```

### Hot Reload Not Working

Backend hot reload requires volume mount. Check that `docker-compose.yml` has:

```yaml
backend:
  volumes:
    - ./backend:/app
```

### Container Exits Immediately

```bash
# Check logs
docker-compose logs <service-name>

# Check environment variables
docker-compose config
```

## Environment Variables

### Development

Create `backend/.env`:

```bash
# PostgreSQL (handled by docker-compose)
DATABASE_URL=postgresql+asyncpg://gitfable:gitfable@postgres:5432/gitfable

# Firebase (required)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=...

# Other
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

### Production

See `docker-compose.prod.yml` for production configuration.

## Data Persistence

### Development

Data is stored in Docker volumes:
- `mongodb_data` - MongoDB database files
- `redis_data` - Redis data

```bash
# Backup data
docker-compose exec mongodb mongodump --uri="mongodb://admin:password@mongodb:27017/gitfable?authSource=admin" --out=/data/backup
docker cp gitfable-mongodb:/data/backup ./backup

# Restore data
docker cp ./backup gitfable-mongodb:/data/backup
docker-compose exec mongodb mongorestore --uri="mongodb://admin:password@mongodb:27017/gitfable?authSource=admin" /data/backup
```

### Clean Start

To start fresh with empty databases:

```bash
# Remove volumes (WARNING: deletes all data!)
docker-compose down -v

# Start fresh
docker-compose up -d
```

## Multi-Architecture Builds

For Apple Silicon (M1/M2) Macs or ARM servers:

```bash
# Build for multiple architectures
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t gitfable-backend:latest ./backend
```

## Updating Images

```bash
# Pull latest base images
docker-compose pull

# Rebuild with latest code
docker-compose up -d --build

# Clean up old images
docker image prune -f
```

## Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [MongoDB Docker Image](https://hub.docker.com/_/mongo)
- [Redis Docker Image](https://hub.docker.com/_/redis)
