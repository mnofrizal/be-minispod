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
- **Redis**: Queue storage and job persistence

### Validation & Middleware

- **joi**: Object schema validation
- **express-validator**: Express middleware for validation
- **multer**: Multipart/form-data handling
- **compression**: Response compression middleware

### Logging & Monitoring

- **winston**: Logging library for Node.js
- **morgan**: HTTP request logger middleware
- **prom-client**: Prometheus metrics client
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Dashboard and visualization

### Email & Notifications

- **nodemailer**: Email sending library
- **axios**: HTTP client for webhook delivery
- **HTML Templates**: Dynamic email template system

### Payment Integration

- **Midtrans**: Payment gateway integration
- **PDFKit**: PDF generation for invoices
- **Crypto utilities**: Secure payment processing

### Development Tools

- **nodemon**: Development server with auto-restart
- **dotenv**: Environment variable management
- **jest**: Testing framework (planned)
- **supertest**: HTTP assertion library for testing (planned)
- **eslint**: Code linting (planned)
- **prettier**: Code formatting (planned)

## Package.json Dependencies

### Production Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "pg": "^8.11.0",
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
    "multer": "^1.4.5",
    "pdfkit": "^0.13.0",
    "crypto": "^1.0.1"
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
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_DB=0

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
EMAIL_FROM_NAME="PaaS Platform"
EMAIL_FROM_ADDRESS="noreply@paas.com"

# Payment Gateway Configuration (Midtrans)
MIDTRANS_SERVER_KEY="your-midtrans-server-key"
MIDTRANS_CLIENT_KEY="your-midtrans-client-key"
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_NOTIFICATION_URL="https://your-domain.com/api/v1/billing/webhook"

# Frontend Integration
FRONTEND_URL="https://your-frontend-domain.com"

# Monitoring Configuration
PROMETHEUS_PORT=9090
METRICS_ENABLED=true

# Webhook Configuration
WEBHOOK_SECRET="your-webhook-secret"
WEBHOOK_TIMEOUT=30000
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
k3d (for local Kubernetes development)
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
npx prisma db seed

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

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - ./monitoring/grafana:/etc/grafana/provisioning

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
  role          UserRole        @default(USER)
  subscriptions Subscription[]
  balance       UserBalance?
  transactions  Transaction[]
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

model ServiceInstance {
  id             String       @id @default(cuid())
  subscriptionId String       @unique
  podName        String       @unique
  namespace      String
  status         PodStatus    @default(PENDING)
  externalUrl    String?
  internalUrl    String?
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model ServiceCatalog {
  id            String         @id @default(cuid())
  name          String         @unique
  displayName   String
  description   String
  category      String
  price         Int
  resourceLimits Json
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model WorkerNode {
  id                String            @id @default(cuid())
  name              String            @unique
  status            WorkerNodeStatus  @default(PENDING)
  cpuArchitecture   String?
  totalMemoryMB     Int?
  totalStorageGB    Int?
  allocatedCPU      Float?            @default(0)
  allocatedMemoryMB Int?              @default(0)
  allocatedPods     Int?              @default(0)
  maxPods           Int?              @default(110)
  isSchedulable     Boolean           @default(true)
  isReady           Boolean           @default(false)
  lastHeartbeat     DateTime?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
}

enum UserRole {
  USER
  ADMINISTRATOR
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  CANCELLED
  PENDING_DEPLOYMENT
}

enum PodStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
  UNKNOWN
}

enum WorkerNodeStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
  PENDING
  NOT_READY
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
- **Container Orchestration**: Kubernetes cluster (K3s or managed)

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

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: paas-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: paas-backend
  template:
    metadata:
      labels:
        app: paas-backend
    spec:
      containers:
        - name: paas-backend
          image: paas-backend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: paas-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: paas-secrets
                  key: redis-url
```

## Performance Considerations

### Optimization Strategies

- **Connection Pooling**: Database connection management with Prisma
- **Caching**: Redis for frequently accessed data and session storage
- **Compression**: Gzip compression for API responses
- **Rate Limiting**: API rate limiting to prevent abuse
- **Clustering**: Multi-process Node.js deployment with PM2
- **Database Indexing**: Optimized query performance with proper indexes
- **Queue Processing**: Background job processing with Bull and Redis
- **Template Caching**: Email template caching for improved performance

### Monitoring & Metrics

- **Application Metrics**: Response times, error rates, throughput
- **Business Metrics**: Active subscriptions, pod count, revenue
- **Infrastructure Metrics**: CPU, memory, disk usage, network
- **Custom Metrics**: Kubernetes pod status, billing data, queue metrics
- **Kubernetes Metrics**: Pod health, resource utilization, cluster status
- **Email Metrics**: Delivery rates, bounce rates, template performance

### Scalability Features

- **Horizontal Scaling**: Multiple backend instances with load balancing
- **Queue Scaling**: Multiple queue workers for background job processing
- **Database Scaling**: Read replicas and connection pooling
- **Kubernetes Scaling**: Auto-scaling pods based on resource usage
- **Cache Scaling**: Redis clustering for high availability
- **Email Scaling**: Queue-based email delivery with retry logic

## Security Implementation

### API Security

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: USER and ADMINISTRATOR roles
- **Input Validation**: Comprehensive request validation with Joi
- **Rate Limiting**: API endpoint protection against abuse
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Helmet Security**: Security headers and protection middleware

### Database Security

- **Connection Security**: SSL/TLS encrypted database connections
- **Query Protection**: Prisma ORM prevents SQL injection
- **Access Control**: Database user permissions and role separation
- **Data Encryption**: Sensitive data encryption at rest
- **Audit Logging**: Complete transaction and access logging

### Kubernetes Security

- **Namespace Isolation**: Customer workload separation
- **RBAC Integration**: Role-based access control for cluster operations
- **Resource Quotas**: Prevent resource abuse and ensure fair usage
- **Network Policies**: Traffic isolation between customer workloads
- **Secret Management**: Secure handling of sensitive configuration

### Payment Security

- **PCI DSS Compliance**: Secure payment processing via Midtrans
- **Webhook Validation**: Signature verification for payment webhooks
- **Transaction Encryption**: Secure handling of payment data
- **Audit Trail**: Complete payment transaction logging
- **Fraud Prevention**: Rate limiting and validation on payment endpoints

## Development Tools & Scripts

### Available Scripts

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "db:migrate": "npx prisma migrate dev",
    "db:generate": "npx prisma generate",
    "db:seed": "npx prisma db seed",
    "db:reset": "npx prisma migrate reset",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  }
}
```

### Development Utilities

- **auto-heartbeat-k3d.js**: Continuous heartbeat simulation for k3d development
- **test-k8s-connection.js**: Kubernetes connection testing utility
- **REST API Testing**: Comprehensive .rest files for all endpoints
- **Database Seeding**: Automated test data generation
- **Monitoring Setup**: Prometheus and Grafana configuration
- **Docker Support**: Complete containerization setup

## Production Readiness Checklist

### ✅ Completed Features

- [x] Complete Express.js backend with ES6 modules
- [x] JWT-based authentication and authorization
- [x] PostgreSQL database with Prisma ORM
- [x] Redis-based job queues and caching
- [x] Kubernetes integration with @kubernetes/client-node
- [x] Pod lifecycle management with service templates
- [x] Email notification system with HTML templates
- [x] Background job processing with Bull queues
- [x] Payment gateway integration with Midtrans
- [x] Comprehensive API testing with REST files
- [x] Production monitoring with Prometheus and Grafana
- [x] Docker containerization support
- [x] Security middleware and input validation
- [x] Error handling and logging system
- [x] Database migrations and seeding

### 🚀 Ready for Production

The technology stack is production-ready with:

1. **Scalable Architecture**: Microservices-oriented monolith design
2. **High Availability**: Multi-instance deployment with load balancing
3. **Monitoring & Alerting**: Comprehensive observability stack
4. **Security**: Multi-layer security implementation
5. **Performance**: Optimized for high throughput and low latency
6. **Maintainability**: Clean code architecture with proper separation of concerns
7. **Documentation**: Comprehensive setup and deployment guides

The system can handle production workloads and is ready for frontend integration and customer deployment.
