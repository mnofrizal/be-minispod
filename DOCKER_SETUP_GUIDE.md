# Docker Setup Guide - PaaS Backend

## Overview

This guide covers the Docker Compose setup for the PaaS backend development environment, including all supporting services for monitoring, database management, and caching.

## Services Included

### Core Infrastructure

1. **PostgreSQL Database** (`postgres`)

   - **Port**: 5432
   - **Image**: postgres:14-alpine
   - **Credentials**: postgres/password
   - **Database**: paas_db
   - **Volume**: postgres_data (persistent)

2. **Redis Cache** (`redis`)
   - **Port**: 6379
   - **Image**: redis:7-alpine
   - **Volume**: redis_data (persistent)

### Management Tools

3. **Adminer** (`adminer`)

   - **Port**: 8080
   - **URL**: http://localhost:8080
   - **Purpose**: PostgreSQL database management GUI
   - **Login**: Server: postgres, Username: postgres, Password: password, Database: paas_db

4. **Redis Commander** (`redis-commander`)
   - **Port**: 8081
   - **URL**: http://localhost:8081
   - **Purpose**: Redis management GUI

### Monitoring Stack

5. **Prometheus** (`prometheus`)

   - **Port**: 9090
   - **URL**: http://localhost:9090
   - **Purpose**: Metrics collection and monitoring
   - **Config**: ./monitoring/prometheus.yml

6. **Grafana** (`grafana`)
   - **Port**: 3001
   - **URL**: http://localhost:3001
   - **Purpose**: Monitoring dashboards and visualization
   - **Credentials**: admin/admin
   - **Datasource**: Prometheus (auto-configured)

## Quick Start

### 1. Start Infrastructure Services

```bash
# Start all infrastructure services
docker-compose up -d postgres redis redis-commander adminer prometheus grafana
```

### 2. Check Service Status

```bash
# View running containers
docker-compose ps

# View logs for specific service
docker-compose logs postgres
docker-compose logs grafana
```

### 3. Access Services

- **Database GUI**: http://localhost:8080 (Adminer)
- **Redis GUI**: http://localhost:8081 (Redis Commander)
- **Monitoring**: http://localhost:9090 (Prometheus)
- **Dashboards**: http://localhost:3001 (Grafana)

## Service Management

### Start Services

```bash
# Start specific services
docker-compose up -d postgres redis

# Start with logs (foreground)
docker-compose up postgres redis

# Start all infrastructure
docker-compose up -d postgres redis redis-commander adminer prometheus grafana
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: Data loss)
docker-compose down -v

# Stop specific services
docker-compose stop postgres redis
```

### View Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs postgres
docker-compose logs -f grafana  # Follow logs

# Last 100 lines
docker-compose logs --tail=100 prometheus
```

## Database Setup

### Initial Connection

1. **Via Adminer** (http://localhost:8080):

   - Server: `postgres`
   - Username: `postgres`
   - Password: `password`
   - Database: `paas_db`

2. **Via Command Line**:

   ```bash
   # Connect to PostgreSQL container
   docker-compose exec postgres psql -U postgres -d paas_db

   # Or from host (if psql installed)
   psql -h localhost -p 5432 -U postgres -d paas_db
   ```

### Run Prisma Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed
```

## Monitoring Setup

### Prometheus Configuration

- **Config File**: `./monitoring/prometheus.yml`
- **Targets**: Backend app, Node exporter, PostgreSQL exporter, Redis exporter
- **Scrape Interval**: 15s (global), 30s (app-specific)

### Grafana Setup

1. **Access**: http://localhost:3001
2. **Login**: admin/admin (change on first login)
3. **Datasource**: Prometheus (auto-configured at http://prometheus:9090)
4. **Dashboards**: Located in `./monitoring/grafana/dashboards/`

### Custom Dashboards

- **PaaS Backend**: Pre-configured dashboard for API metrics
- **Location**: `./monitoring/grafana/dashboards/paas-backend.json`
- **Metrics**: Response time, request rate, active users, worker nodes

## Development Workflow

### 1. Start Infrastructure

```bash
# Start supporting services
docker-compose up -d postgres redis redis-commander adminer prometheus grafana
```

### 2. Run Backend Locally

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with database connection: postgresql://postgres:password@localhost:5432/paas_db

# Run migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### 3. Monitor and Debug

- **Database**: Use Adminer at http://localhost:8080
- **Redis**: Use Redis Commander at http://localhost:8081
- **Metrics**: Check Prometheus at http://localhost:9090
- **Dashboards**: View Grafana at http://localhost:3001

## Troubleshooting

### Common Issues

1. **Port Conflicts**:

   ```bash
   # Check what's using the port
   lsof -i :5432
   lsof -i :6379

   # Stop conflicting services or change ports in docker-compose.yml
   ```

2. **Permission Issues**:

   ```bash
   # Fix volume permissions
   sudo chown -R $USER:$USER ./monitoring
   ```

3. **Service Won't Start**:

   ```bash
   # Check logs
   docker-compose logs service-name

   # Restart specific service
   docker-compose restart service-name
   ```

4. **Database Connection Issues**:

   ```bash
   # Check PostgreSQL health
   docker-compose exec postgres pg_isready -U postgres

   # Reset database
   docker-compose down postgres
   docker volume rm be-minispod_postgres_data
   docker-compose up -d postgres
   ```

### Health Checks

```bash
# Check service health
docker-compose ps

# Test database connection
docker-compose exec postgres pg_isready -U postgres

# Test Redis connection
docker-compose exec redis redis-cli ping
```

## Environment Variables

### Required for Backend App

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/paas_db"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_SECRET="your-refresh-token-secret"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
NODE_ENV="development"
PORT="3000"
```

## Data Persistence

### Volumes

- **postgres_data**: PostgreSQL database files
- **redis_data**: Redis persistence files
- **prometheus_data**: Prometheus metrics storage
- **grafana_data**: Grafana dashboards and settings

### Backup

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U postgres paas_db > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U postgres paas_db < backup.sql
```

## Production Considerations

1. **Security**: Change default passwords and secrets
2. **Volumes**: Use named volumes or bind mounts for data persistence
3. **Networks**: Configure proper network isolation
4. **Resources**: Set memory and CPU limits
5. **Monitoring**: Configure alerting rules in Prometheus
6. **Backup**: Implement automated backup strategies

## Next Steps

1. **Backend Integration**: Connect the locally running backend to these services
2. **Custom Metrics**: Add application-specific metrics to Prometheus
3. **Advanced Dashboards**: Create detailed Grafana dashboards
4. **Alerting**: Configure Prometheus alerting rules
5. **Load Testing**: Test the setup under load
