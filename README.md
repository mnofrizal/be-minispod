# PaaS Backend - Complete Phase 1 MVP

Backend API system for a Platform-as-a-Service (PaaS) that enables customers to deploy and manage containerized services (N8N, Ghost, WordPress, etc.) through monthly subscriptions with comprehensive Kubernetes worker node management.

## 🚀 Phase 1 Status - COMPLETE ✅

**Current Phase**: Phase 1 MVP Complete with Comprehensive Backend System

### ✅ Completed Features

#### Core Authentication System

- ✅ Express.js server with ES6 modules and security middleware
- ✅ JWT-based authentication with access/refresh tokens
- ✅ User registration, login, and profile management
- ✅ Password hashing with bcrypt and security middleware
- ✅ Role-based access control (USER, ADMINISTRATOR)

#### Admin User Management System

- ✅ Complete CRUD operations for user management
- ✅ User search and filtering capabilities
- ✅ User statistics and dashboard data
- ✅ Role assignment and account status management
- ✅ Bulk operations support

#### Service Catalog Management

- ✅ Complete service catalog CRUD operations
- ✅ Public catalog browsing for customers
- ✅ Admin service management interface
- ✅ Service search and categorization
- ✅ Role-based data filtering for security

#### Comprehensive Worker Node Management

- ✅ **Detailed 25+ field database schema** for complete K8s monitoring
- ✅ **Hardware specifications tracking** (CPU, memory, storage, architecture)
- ✅ **Resource allocation monitoring** (real-time CPU, memory, pod allocation)
- ✅ **Health monitoring system** (heartbeat, health checks, ready status)
- ✅ **Kubernetes integration** (labels, taints, kubelet version, container runtime)
- ✅ **5-state status management** (ACTIVE, INACTIVE, MAINTENANCE, PENDING, NOT_READY)
- ✅ **Schedulability control** and online/offline monitoring
- ✅ **Comprehensive statistics** for capacity planning and resource optimization
- ✅ **System endpoints** for K8s cluster integration (heartbeat, resource updates)

#### Technical Architecture

- ✅ PostgreSQL with Prisma ORM and centralized configuration
- ✅ Comprehensive validation system with proper architecture separation
- ✅ HTTP status constants and user role constants (no magic numbers/strings)
- ✅ Standardized API responses and error handling
- ✅ Winston logging system with comprehensive audit trails
- ✅ Database seeding with realistic test data
- ✅ Complete REST API testing files for all endpoints

### 🎯 Next Steps (Phase 2)

- [ ] Subscription lifecycle management
- [ ] Kubernetes pod provisioning and management
- [ ] Background job system (Bull/Agenda)
- [ ] Email notification system
- [ ] Webhook system for external integrations

## 🛠️ Tech Stack

- **Framework**: Express.js 4.18+ with ES6 modules
- **Database**: PostgreSQL 14+ with Prisma ORM
- **Authentication**: JWT tokens (access + refresh)
- **Validation**: Joi schema validation with proper architecture
- **Security**: Helmet, CORS, Rate limiting, bcrypt
- **Logging**: Winston with file and console outputs
- **Environment**: Node.js 18+
- **Architecture**: Functional programming, no classes

## 📋 Prerequisites

Before running this project, make sure you have:

- Node.js 18+ installed
- PostgreSQL 14+ running
- Redis 7+ running (for future Phase 2 features)
- Git for version control

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd be-minispod
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
# Default PostgreSQL connection:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/paas_db"
```

### 3. Database Setup

```bash
# Create database
createdb paas_db

# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed database with test data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 🔐 Test Credentials

After running the seed script, you can use these test accounts:

**Administrator User:**

- Email: `admin@paas.com`
- Password: `Admin123!@#`
- Role: `ADMINISTRATOR`

**Regular User:**

- Email: `user@paas.com`
- Password: `User123!@#`
- Role: `USER`

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication Endpoints

#### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!"
}
```

#### Login User

```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

#### Get Profile

```http
GET /auth/profile
Authorization: Bearer <access_token>
```

#### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh_token>"
}
```

### User Management Endpoints (Admin Only)

#### Get All Users

```http
GET /users?page=1&limit=10&search=john&role=USER
Authorization: Bearer <admin_access_token>
```

#### Create User

```http
POST /users
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "role": "USER"
}
```

#### Update User

```http
PUT /users/:userId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "role": "ADMINISTRATOR"
}
```

#### Delete User

```http
DELETE /users/:userId
Authorization: Bearer <admin_access_token>
```

### Service Catalog Endpoints

#### Get Public Services (All Users)

```http
GET /services/public?page=1&limit=10&category=automation
Authorization: Bearer <access_token>
```

#### Get All Services (Admin Only)

```http
GET /services?page=1&limit=10&search=n8n&status=ACTIVE
Authorization: Bearer <admin_access_token>
```

#### Create Service (Admin Only)

```http
POST /services
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "N8N Automation",
  "description": "Workflow automation platform",
  "category": "automation",
  "version": "1.0.0",
  "status": "ACTIVE",
  "pricing": {
    "monthly": 25000
  },
  "resources": {
    "cpu": "1 vCPU",
    "memory": "1GB RAM",
    "storage": "10GB SSD"
  }
}
```

### 🔧 Worker Node Management

The worker node management system provides comprehensive monitoring and control over Kubernetes worker nodes in your cluster.

#### Worker Node Registration

To register a new worker node in the system:

```http
POST /workers
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "name": "worker-node-01",
  "hostname": "worker01.cluster.local",
  "ipAddress": "192.168.1.100",
  "cpuCores": 8,
  "cpuArchitecture": "x86_64",
  "totalMemory": 32768,
  "totalStorage": 500000,
  "architecture": "amd64",
  "operatingSystem": "Ubuntu 22.04 LTS",
  "maxPods": 110,
  "labels": {
    "node-type": "worker",
    "zone": "us-west-1a"
  },
  "taints": [],
  "kubeletVersion": "v1.28.0",
  "containerRuntime": "containerd://1.7.0",
  "kernelVersion": "5.15.0-78-generic",
  "osImage": "Ubuntu 22.04.3 LTS"
}
```

#### Worker Node Management Endpoints

**Get All Worker Nodes:**

```http
GET /workers?page=1&limit=10&status=ACTIVE&isSchedulable=true&search=worker
Authorization: Bearer <admin_access_token>
```

**Get Worker Node by ID:**

```http
GET /workers/:nodeId
Authorization: Bearer <admin_access_token>
```

**Update Worker Node:**

```http
PUT /workers/:nodeId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "totalMemory": 65536,
  "maxPods": 150,
  "labels": {
    "node-type": "worker",
    "zone": "us-west-1a",
    "updated": "true"
  }
}
```

**Toggle Schedulable Status:**

```http
PATCH /workers/:nodeId/schedulable
Authorization: Bearer <admin_access_token>
```

**Update Node Status:**

```http
PATCH /workers/:nodeId/status
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

**Get Worker Statistics:**

```http
GET /workers/stats
Authorization: Bearer <admin_access_token>
```

**Get Online Worker Nodes:**

```http
GET /workers/online
Authorization: Bearer <admin_access_token>
```

**Get Offline Worker Nodes:**

```http
GET /workers/offline
Authorization: Bearer <admin_access_token>
```

#### System Integration Endpoints

These endpoints are designed for Kubernetes cluster integration:

**Update Node Heartbeat:**

```http
POST /workers/:nodeId/heartbeat
Content-Type: application/json
```

**Update Node Resources:**

```http
POST /workers/:nodeId/resources
Content-Type: application/json

{
  "allocatedCPU": 4.5,
  "allocatedMemory": 16384,
  "allocatedStorage": 100000,
  "currentPods": 25
}
```

#### Worker Node Status States

The system supports 5 different status states:

- **ACTIVE**: Node is healthy and ready for workloads
- **INACTIVE**: Node is offline or not responding
- **MAINTENANCE**: Node is under maintenance (scheduled downtime)
- **PENDING**: Node is being provisioned or joining cluster
- **NOT_READY**: Node has issues and is not ready for workloads

#### Worker Node Fields

The comprehensive worker node schema includes:

**Basic Information:**

- `name`, `hostname`, `ipAddress`

**Hardware Specifications:**

- `cpuCores`, `cpuArchitecture`, `totalMemory`, `totalStorage`
- `architecture`, `operatingSystem`

**Resource Allocation:**

- `allocatedCPU`, `allocatedMemory`, `allocatedStorage`
- `currentPods`, `maxPods`

**Status & Health:**

- `status`, `isReady`, `isSchedulable`
- `lastHeartbeat`, `lastHealthCheck`

**Kubernetes Metadata:**

- `labels`, `taints`, `kubeletVersion`
- `containerRuntime`, `kernelVersion`, `osImage`

### Response Format

All API responses follow this standardized format:

**Success Response:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "statusCode": 200
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "statusCode": 400
}
```

**Paginated Response:**

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {
    "workers": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## 🗄️ Database Schema

### Core Tables

- **users** - User accounts with role-based access
- **service_catalog** - Available services (N8N, Ghost, WordPress, etc.)
- **worker_nodes** - Comprehensive Kubernetes worker node monitoring
- **subscriptions** - Customer service subscriptions (Phase 2)
- **service_instances** - Running pods/containers (Phase 2)
- **usage_metrics** - Resource usage tracking (Phase 2)
- **transactions** - Billing and payment history (Phase 2)
- **webhooks** - Webhook configurations (Phase 2)

### Key Relationships

```
User (1) → (N) Subscriptions (1) → (1) ServiceInstance
ServiceCatalog (1) → (N) Subscriptions
WorkerNode (1) → (N) ServiceInstances (pod placement)
User (1) → (N) Webhooks
```

### Worker Node Schema

The WorkerNode model includes 25+ comprehensive fields for complete Kubernetes monitoring:

```prisma
model WorkerNode {
  id                String   @id @default(cuid())
  name              String   @unique
  hostname          String
  ipAddress         String
  cpuCores          Int
  cpuArchitecture   String
  totalMemory       BigInt   // in MB
  totalStorage      BigInt   // in MB
  architecture      String
  operatingSystem   String
  status            WorkerNodeStatus @default(PENDING)
  isReady           Boolean  @default(false)
  isSchedulable     Boolean  @default(false)
  maxPods           Int      @default(110)
  currentPods       Int      @default(0)
  allocatedCPU      Float    @default(0)
  allocatedMemory   BigInt   @default(0)
  allocatedStorage  BigInt   @default(0)
  labels            Json     @default("{}")
  taints            Json     @default("[]")
  kubeletVersion    String?
  containerRuntime  String?
  kernelVersion     String?
  osImage           String?
  lastHeartbeat     DateTime @default(now())
  lastHealthCheck   DateTime @default(now())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

enum WorkerNodeStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
  PENDING
  NOT_READY
}
```

## 🧪 Testing

### REST API Testing Files

The project includes comprehensive REST API testing files:

- `rest/auth.rest` - Authentication endpoints
- `rest/user.rest` - User management endpoints
- `rest/service.rest` - Service catalog endpoints
- `rest/worker.rest` - Worker node management endpoints

### Manual Testing with curl

**Register a new user:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!"
  }'
```

**Login:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Register a worker node (Admin only):**

```bash
curl -X POST http://localhost:3000/api/v1/workers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{
    "name": "worker-test-01",
    "hostname": "test-worker.cluster.local",
    "ipAddress": "192.168.1.200",
    "cpuCores": 4,
    "cpuArchitecture": "x86_64",
    "totalMemory": 16384,
    "totalStorage": 250000,
    "architecture": "amd64",
    "operatingSystem": "Ubuntu 22.04 LTS"
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

## 📁 Project Structure

```
be-minispod/
├── src/
│   ├── controllers/        # Request handlers
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── service.controller.js
│   │   └── worker.controller.js
│   ├── services/          # Business logic
│   │   ├── auth.service.js
│   │   ├── user.service.js
│   │   ├── service.service.js
│   │   └── worker.service.js
│   ├── routes/            # API routes
│   │   ├── auth.routes.js
│   │   ├── users.routes.js
│   │   ├── services.routes.js
│   │   ├── workers.routes.js
│   │   ├── subscriptions.routes.js (placeholder)
│   │   └── pods.routes.js (placeholder)
│   ├── validations/       # Joi validation schemas
│   │   ├── auth.validation.js
│   │   ├── user.validation.js
│   │   ├── service.validation.js
│   │   └── worker.validation.js
│   ├── middleware/        # Custom middleware
│   │   ├── auth.middleware.js
│   │   └── error.middleware.js
│   ├── utils/             # Helper utilities
│   │   ├── crypto.util.js
│   │   ├── logger.util.js
│   │   ├── response.util.js
│   │   ├── validation.util.js
│   │   ├── http-status.util.js
│   │   └── user-roles.util.js
│   ├── config/            # Configuration
│   │   └── database.js
│   └── server.js          # Express app setup
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.js            # Database seeding
│   └── migrations/        # Database migrations
├── rest/                  # REST API testing files
│   ├── auth.rest
│   ├── user.rest
│   ├── service.rest
│   └── worker.rest
├── logs/                  # Application logs
├── .env                   # Environment variables
└── package.json           # Dependencies
```

## 🔧 Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run db:migrate # Run database migrations
npm run db:generate # Generate Prisma client
npm run db:studio  # Open Prisma Studio
npm run db:seed    # Seed database with test data
npm test           # Run tests (coming soon)
```

## 🛡️ Security Features

- **JWT Authentication** with access and refresh tokens
- **Role-Based Access Control** (USER, ADMINISTRATOR)
- **Password Hashing** using bcrypt with salt rounds
- **Input Validation** with Joi schemas and proper architecture
- **Rate Limiting** to prevent API abuse
- **CORS Protection** with configurable origins
- **Security Headers** via Helmet middleware
- **Request Logging** for comprehensive audit trails
- **Constants System** eliminates magic numbers and strings

## 🚧 Development Notes

### Phase 1 Complete Features

This phase provides a complete backend foundation with:

- **Full Authentication System** with JWT and role-based access
- **Complete Admin User Management** with CRUD operations
- **Service Catalog Management** with public and admin interfaces
- **Comprehensive Worker Node Management** with 25+ monitoring fields
- **Modern Architecture** with ES6 modules and functional programming
- **Production-Ready** validation, error handling, and logging systems

### Phase 2 Development Plan

Phase 2 will implement:

- **Subscription Management**: Complete lifecycle management
- **Kubernetes Integration**: Pod provisioning and management
- **Background Jobs**: Automated tasks with Bull/Agenda
- **Email System**: Notifications with Nodemailer
- **Webhook System**: External integrations and notifications

## 🐛 Troubleshooting

### Common Issues

**Database Connection Error:**

- Ensure PostgreSQL is running
- Check DATABASE_URL in .env file
- Verify database exists: `createdb paas_db`

**JWT Token Errors:**

- Check JWT_SECRET in .env file
- Ensure tokens haven't expired
- Verify Authorization header format: `Bearer <token>`

**Worker Node Registration Issues:**

- Ensure you're using an ADMINISTRATOR token
- Verify all required fields are provided
- Check that worker node name is unique

**Port Already in Use:**

- Change PORT in .env file
- Kill existing process: `lsof -ti:3000 | xargs kill`

### Logs Location

Application logs are stored in the `logs/` directory:

- `logs/error.log` - Error logs only
- `logs/all.log` - All application logs

## 📞 Support

For development questions or issues:

1. Check the logs in `logs/` directory
2. Verify environment variables in `.env`
3. Ensure all prerequisites are installed
4. Review the comprehensive API documentation above
5. Use the REST testing files in `rest/` directory

---

**Project Status**: Phase 1 MVP Complete ✅  
**Current Features**: Authentication, User Management, Service Catalog, Worker Node Management  
**Next Milestone**: Phase 2 - Subscription Management & Kubernetes Integration  
**Architecture**: Modern ES6, Functional Programming, Comprehensive Monitoring
