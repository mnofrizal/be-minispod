# Technology Stack - PaaS Backend

## Core Technologies

### Backend Framework

- **Express.js 4.18+**: Web application framework for Node.js
- **Node.js 18+**: JavaScript runtime environment

### Database & ORM

- **PostgreSQL 14+**: Primary database for application data
- **Prisma ORM**: Database toolkit and ORM for Node.js
- **Redis 7+**: Caching, session storage, and job queues

### Kubernetes Integration

- **@kubernetes/client-node**: Official Kubernetes client for Node.js
- **K3s**: Lightweight Kubernetes distribution for the cluster
- **kubectl**: Command-line tool for Kubernetes management

### Authentication & Security

- **jsonwebtoken**: JWT token generation and validation
- **bcryptjs**: Password hashing and validation
- **helmet**: Security middleware for Express
- **cors**: Cross-Origin Resource Sharing middleware
- **express-rate-limit**: Rate limiting middleware

### Background Jobs & Queues

- **Bull**: Redis-based job queue for Node.js
- **node-cron**: Task scheduler for Node.js
- **Agenda**: Alternative job scheduling library

### Validation & Middleware

- **joi**: Object schema validation
- **express-validator**: Express middleware for validation
- **multer**: Multipart/form-data handling
- **compression**: Response compression middleware

### Logging & Monitoring

- **winston**: Logging library for Node.js
- **morgan**: HTTP request logger middleware
- **prom-client**: Prometheus metrics client
- **@kubernetes/client-node**: K8s metrics collection

### Email & Notifications

- **nodemailer**: Email sending library
- **axios**: HTTP client for webhook delivery
- **socket.io**: Real-time communication (optional)

### Development Tools

- **nodemon**: Development server with auto-restart
- **dotenv**: Environment variable management
- **jest**: Testing framework
- **supertest**: HTTP assertion library for testing
- **eslint**: Code linting
- **prettier**: Code formatting

## Package.json Dependencies

### Production Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "postgresql": "^0.0.1",
    "redis": "^4.6.0",
    "@kubernetes/client-node": "^0.20.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^6.7.0",
    "bull": "^4.10.0",
    "node-cron": "^3.0.2",
    "joi": "^17.9.0",
    "express-validator": "^7.0.0",
    "winston": "^3.9.0",
    "morgan": "^1.10.0",
    "prom-client": "^14.2.0",
    "nodemailer": "^6.9.0",
    "axios": "^1.4.0",
    "dotenv": "^16.1.0",
    "compression": "^1.7.4",
    "multer": "^1.4.5"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "nodemon": "^2.0.22",
    "jest": "^29.5.0",
    "supertest": "^6.3.0",
    "eslint": "^8.42.0",
    "prettier": "^2.8.8",
    "@types/node": "^20.3.0",
    "@types/express": "^4.17.17",
    "@types/bcryptjs": "^2.4.2",
    "@types/jsonwebtoken": "^9.0.2"
  }
}
```

## Environment Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/paas_db"
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_SECRET="your-refresh-token-secret"
JWT_REFRESH_EXPIRES_IN="7d"

# Kubernetes Configuration
KUBECONFIG_PATH="/path/to/kubeconfig"
K8S_NAMESPACE_PREFIX="customer-"
K8S_CLUSTER_DOMAIN="yourdomain.com"

# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Webhook Configuration
WEBHOOK_SECRET="your-webhook-secret"
WEBHOOK_TIMEOUT=30000

# Monitoring Configuration
PROMETHEUS_PORT=9090
METRICS_ENABLED=true

# External Services
PAYMENT_GATEWAY_URL="https://api.payment-provider.com"
PAYMENT_WEBHOOK_SECRET="payment-webhook-secret"
```

## Development Setup

### Prerequisites

```bash
# Required software
Node.js 18+
PostgreSQL 14+
Redis 7+
Docker (for local development)
kubectl (for K8s management)
```

### Local Development Environment

```bash
# 1. Clone and setup
git clone <repository>
cd be-minispod
npm install

# 2. Database setup
createdb paas_db
npx prisma migrate dev
npx prisma generate

# 3. Redis setup (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# 4. Environment setup
cp .env.example .env
# Edit .env with your configuration

# 5. Start development server
npm run dev
```

### Docker Development Setup

```dockerfile
# Dockerfile for development
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

```yaml
# docker-compose.yml for local development
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: paas_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## Database Schema (Prisma)

### Core Schema Structure

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String          @id @default(cuid())
  email         String          @unique
  password      String
  name          String
  role          UserRole        @default(CUSTOMER)
  subscriptions Subscription[]
  webhooks      Webhook[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}

model Subscription {
  id              String            @id @default(cuid())
  userId          String
  serviceId       String
  status          SubscriptionStatus @default(ACTIVE)
  expiresAt       DateTime
  serviceInstance ServiceInstance?
  user            User              @relation(fields: [userId], references: [id])
  service         ServiceCatalog    @relation(fields: [serviceId], references: [id])
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum UserRole {
  CUSTOMER
  ADMIN
  SUPER_ADMIN
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  CANCELLED
}
```

## Production Deployment

### Production Environment

- **Server**: Ubuntu 20.04+ or CentOS 8+
- **Process Manager**: PM2 for Node.js process management
- **Reverse Proxy**: Nginx for load balancing and SSL termination
- **Database**: Managed PostgreSQL (AWS RDS, Google Cloud SQL)
- **Cache**: Managed Redis (AWS ElastiCache, Google Memorystore)
- **Monitoring**: Prometheus + Grafana stack

### Production Configuration

```javascript
// ecosystem.config.js (PM2)
module.exports = {
  apps: [
    {
      name: "paas-backend",
      script: "./src/server.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
    },
  ],
};
```

## Performance Considerations

### Optimization Strategies

- **Connection Pooling**: Database connection management
- **Caching**: Redis for frequently accessed data
- **Compression**: Gzip compression for API responses
- **Rate Limiting**: Prevent API abuse
- **Clustering**: Multi-process Node.js deployment
- **Database Indexing**: Optimize query performance

### Monitoring & Metrics

- **Application Metrics**: Response times, error rates
- **Business Metrics**: Active subscriptions, pod count
- **Infrastructure Metrics**: CPU, memory, disk usage
- **Custom Metrics**: Kubernetes pod status, billing data
