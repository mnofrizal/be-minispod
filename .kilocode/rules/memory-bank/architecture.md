# Backend Architecture - PaaS Platform

## System Overview

The backend is designed as a **microservices-oriented monolith** using Express.js, providing REST APIs for customer management, subscription lifecycle, and Kubernetes pod orchestration with webhook integration.

## Current Implementation Status

### ✅ Phase 2 Complete - Production-Ready Backend System

**Implemented Components:**

- **Express.js Server**: ES6 modules with modern syntax
- **Authentication System**: JWT-based auth with access/refresh tokens
- **User Management**: Registration, login, profile management
- **Admin User Management**: Complete CRUD operations for user administration
- **Service Catalog Management**: Full service catalog system with public and admin endpoints
- **Production-Ready Worker Management**: Advanced Kubernetes worker node monitoring with auto-registration, realtime heartbeats, and proper architectural patterns
- **Credit-Based Billing System**: Complete billing system with Midtrans integration, unified transactions, CUID validation, and admin billing management
- **Database Layer**: PostgreSQL with Prisma ORM, centralized configuration
- **Security Middleware**: Password hashing, JWT validation, rate limiting
- **Role System**: Simplified USER and ADMINISTRATOR roles with constants
- **Development Tools**: REST API testing, logging, error handling
- **Background Job System**: Automated health monitoring and resource tracking
- **Local Development**: Complete k3d integration with auto-registration and heartbeat scripts
- **Production Deployment**: Kubernetes DaemonSet for automatic worker node agents
- **Kubernetes Integration**: Full @kubernetes/client-node integration with pod lifecycle management
- **Pod Management System**: Complete pod provisioning, monitoring, restart, stop, start, and cleanup with service templates, container port management, and local development access
- **Service Templates**: Pre-configured templates for N8N, Ghost, and WordPress with dynamic configuration
- **Email Notification System**: Complete email system with HTML templates and queue-based delivery
- **Monitoring Integration**: Prometheus and Grafana setup for production monitoring

**Current File Structure:**

```
src/
├── server.js                    # ✅ Main Express server with ES6 modules
├── controllers/
│   ├── auth.controller.js       # ✅ Authentication request handlers
│   ├── user.controller.js       # ✅ Admin user management handlers
│   ├── service.controller.js    # ✅ Service catalog handlers
│   ├── worker.controller.js     # ✅ Worker node management with ID/name resolution
│   ├── billing.controller.js    # ✅ Billing operations (balance, top-up, invoices, unified transactions)
│   ├── subscription.controller.js # ✅ Subscription lifecycle management
│   └── pod.controller.js        # ✅ Pod management with Kubernetes integration
├── middleware/
│   ├── auth.middleware.js       # ✅ JWT authentication & authorization
│   ├── error.middleware.js      # ✅ Global error handling
│   └── billing.middleware.js    # ✅ Balance validation and payment security
├── routes/
│   ├── index.routes.js         # ✅ Main route file with centralized route management
│   ├── auth.routes.js          # ✅ Authentication endpoints
│   ├── services.routes.js      # ✅ Service catalog with validation
│   ├── billing.routes.js       # ✅ Billing system endpoints with unified transactions
│   ├── subscriptions.routes.js # ✅ Subscription management with credit-based flow
│   └── admin/                  # ✅ Admin-only endpoints with proper security boundaries
│       ├── users.routes.js     # ✅ Admin user management with validation
│       ├── workers.routes.js   # ✅ Admin worker node management with flexible validation
│       ├── billing.routes.js   # ✅ Admin billing management endpoints
│       └── pods.routes.js      # ✅ Admin pod management endpoints with Kubernetes operations
├── services/
│   ├── auth.service.js         # ✅ Authentication business logic
│   ├── user.service.js         # ✅ User management business logic
│   ├── service.service.js      # ✅ Service catalog business logic
│   ├── worker.service.js       # ✅ Worker node management with focused functions
│   ├── billing.service.js      # ✅ Balance, top-up, and unified transaction management
│   ├── midtrans.service.js     # ✅ Midtrans payment gateway integration
│   ├── subscription.service.js # ✅ Credit-based subscription lifecycle
│   ├── pod.service.js          # ✅ Kubernetes pod lifecycle management
│   └── notification.service.js # ✅ Email notification system
├── validations/
│   ├── auth.validation.js      # ✅ Authentication validation schemas
│   ├── user.validation.js      # ✅ User management validation schemas
│   ├── service.validation.js   # ✅ Service catalog validation schemas
│   ├── worker.validation.js    # ✅ Worker node validation with flexible schemas
│   ├── billing.validation.js   # ✅ Billing operations validation with CUID support
│   └── subscription.validation.js # ✅ Subscription validation schemas
├── jobs/
│   ├── job-scheduler.js        # ✅ Enhanced job scheduler with queue integration
│   ├── queue.manager.js        # ✅ Bull queue management system
│   ├── health-monitor.job.js   # ✅ Background health monitoring job
│   ├── billing.jobs.js         # ✅ Payment processing and billing automation
│   ├── subscription.jobs.js    # ✅ Subscription lifecycle automation
│   ├── pod.jobs.js             # ✅ Pod monitoring and health checks
│   └── notification.jobs.js    # ✅ Email notification job processing
├── config/
│   ├── database.js             # ✅ Centralized Prisma configuration
│   └── kubernetes.js           # ✅ Kubernetes client configuration and management
├── templates/
│   ├── template.parser.js      # ✅ Service template processor for K8s deployments
│   └── emails/
│       ├── welcome.html        # ✅ Welcome email template
│       ├── subscription-created.html # ✅ Subscription confirmation template
│       ├── service-ready.html  # ✅ Service deployment ready notification
│       └── subscription-expiring.html # ✅ Subscription expiry warning
└── utils/
    ├── crypto.util.js          # ✅ Password hashing utilities
    ├── logger.util.js          # ✅ Winston logging setup
    ├── response.util.js        # ✅ API response formatting
    ├── validation.util.js      # ✅ Input validation and UUID detection helpers
    ├── http-status.util.js     # ✅ HTTP status code constants
    ├── user-roles.util.js      # ✅ User role constants
    └── pdf.util.js             # ✅ PDF generation using PDFKit for invoices

prisma/
├── schema.prisma               # ✅ Database schema with User, ServiceCatalog, WorkerNode, and unified Transaction models
├── seed.js                     # ✅ Database seeding with test data
└── migrations/                 # ✅ Database migration files

rest/
├── auth.rest                   # ✅ Authentication API testing
├── service.rest                # ✅ Service catalog API testing
├── billing.rest                # ✅ Billing system API testing with unified transactions
├── subscription.rest           # ✅ Subscription management API testing
├── pod.rest                    # ✅ Admin pod management API testing
├── worker.rest                 # ✅ Admin worker node management API testing
├── admin-billing.rest          # ✅ Admin billing management API testing
├── admin-users.rest            # ✅ Admin user management API testing
└── admin-routes.rest           # ✅ Admin route testing overview

monitoring/
├── prometheus.yml              # ✅ Prometheus configuration for metrics collection
└── grafana/
    ├── dashboards/
    │   └── paas-backend.json   # ✅ Grafana dashboard for backend monitoring
    └── datasources/
        └── prometheus.yml      # ✅ Grafana Prometheus datasource configuration

# Development Scripts
├── auto-heartbeat-k3d.js           # ✅ Continuous heartbeat script for k3d
├── test-k8s-connection.js          # ✅ Kubernetes connection testing
├── LOCAL_DEVELOPMENT_GUIDE.md      # ✅ Comprehensive k3d setup guide
└── scripts/
    ├── setup-k3d-external.sh       # ✅ k3d cluster setup for external access
    ├── ubuntu-setup-heartbeat.sh   # ✅ Ubuntu heartbeat agent setup
    ├── ubuntu-register-worker.sh   # ✅ Ubuntu worker registration
    └── verify-setup.sh             # ✅ System verification script
```

### ✅ Phase 2 Complete - Full Kubernetes Integration

**All Phase 2 objectives have been successfully achieved:**

1. **Kubernetes Client Integration** ✅ - Complete @kubernetes/client-node setup with multi-environment support
2. **Pod Management System** ✅ - Full pod lifecycle management with service templates
3. **Service Templates** ✅ - N8N, Ghost, and WordPress templates with dynamic configuration
4. **Background Job System** ✅ - Redis-based Bull queues with comprehensive job processing
5. **Email Notification System** ✅ - Complete email system with HTML templates and queue integration
6. **Enhanced Job Scheduler** ✅ - Hybrid scheduling with cron jobs and Bull queue system
7. **Production Monitoring** ✅ - Prometheus and Grafana integration for system monitoring

### 🚀 Phase 3 Ready - Production Deployment

**Next Implementation Priority:**

1. **Frontend Integration**: Connect with Next.js frontend for complete user experience
2. **Production Deployment**: Deploy to production Kubernetes cluster with monitoring
3. **Advanced Features**: Custom domains, advanced backup/restore, multi-region support
4. **Performance Optimization**: Caching strategies, connection pooling, load balancing
5. **Security Hardening**: Advanced security features, compliance, audit logging

## User Role System (Implemented)

**Current Roles:**

- **`USER`**: Standard user role (default for registrations)
- **`ADMINISTRATOR`**: Admin role with elevated privileges

**Authentication Middleware:**

- [`adminOnly`](src/middleware/auth.middleware.js:148): Requires `ADMINISTRATOR` role
- [`superAdminOnly`](src/middleware/auth.middleware.js:156): Requires `ADMINISTRATOR` role
- [`userOrAdmin`](src/middleware/auth.middleware.js:164): Allows both `USER` and `ADMINISTRATOR`

## Core Architecture Components

### 1. API Layer (`/src/routes/`)

**Purpose**: HTTP request routing and endpoint definitions

**Structure**:

```
/routes/
├── index.routes.js         # ✅ Main route file with centralized route management
├── auth.routes.js          # ✅ Authentication endpoints
├── services.routes.js      # ✅ Service catalog endpoints
├── billing.routes.js       # ✅ Billing system endpoints
├── subscriptions.routes.js # ✅ Subscription management endpoints
└── admin/                  # ✅ Admin-only endpoints with proper security boundaries
    ├── users.routes.js     # ✅ Admin user management endpoints
    ├── workers.routes.js   # ✅ Admin worker node management endpoints
    ├── billing.routes.js   # ✅ Admin billing management endpoints
    └── pods.routes.js      # ✅ Admin pod management endpoints
```

**Route Architecture**:

- **User Routes**: Mounted at `/api/v1/` for customer-facing endpoints
- **Admin Routes**: Mounted at `/api/v1/admin/` for administrative endpoints with proper security boundaries
- **Centralized Management**: All routes imported and mounted through `index.routes.js`

### 2. Controller Layer (`/src/controllers/`)

**Purpose**: Request/response handling and validation

**Structure**:

```
/controllers/
├── auth.controller.js        # ✅ Authentication logic
├── user.controller.js        # ✅ User CRUD operations
├── service.controller.js     # ✅ Service catalog operations
├── worker.controller.js      # ✅ Worker node management with ID/name resolution
├── billing.controller.js     # ✅ Billing operations
├── subscription.controller.js # ✅ Subscription lifecycle
└── pod.controller.js         # ✅ Pod management operations with individual function exports
```

### 3. Service Layer (`/src/services/`)

**Purpose**: Core business logic and orchestration

**Structure**:

```
/services/
├── auth.service.js           # ✅ JWT, password hashing, sessions
├── user.service.js           # ✅ User management operations
├── service.service.js        # ✅ Service catalog management
├── worker.service.js         # ✅ Worker node management with focused functions
├── billing.service.js        # ✅ Balance, top-up, and unified transaction management
├── midtrans.service.js       # ✅ Midtrans payment gateway integration
├── subscription.service.js   # ✅ Subscription lifecycle management
├── pod.service.js            # ✅ Kubernetes pod operations
└── notification.service.js   # ✅ Email & webhook notifications
```

### 4. Kubernetes Integration Layer (`/src/config/kubernetes.js`)

**Purpose**: Kubernetes cluster management and pod orchestration

**Components**:

```
/config/kubernetes.js         # ✅ Kubernetes API client wrapper
/services/pod.service.js      # ✅ Pod CRUD operations
/templates/template.parser.js # ✅ Service template processing
/jobs/pod.jobs.js            # ✅ Pod monitoring and health checks
```

**Key Features:**

- **Multi-Environment Support**: Automatic configuration for development and production
- **API Client Management**: Core V1, Apps V1, and Networking V1 API clients
- **Resource Management**: Pod, service, and ingress management
- **Namespace Isolation**: Customer-specific namespace creation and management
- **Template Processing**: Dynamic service template configuration

### 5. Background Jobs (`/src/jobs/`)

**Purpose**: Automated tasks and scheduled operations

**Job Types**:

```
/jobs/
├── job-scheduler.js            # ✅ Enhanced job scheduler with queue integration
├── queue.manager.js            # ✅ Bull queue management system
├── health-monitor.job.js       # ✅ Worker node health monitoring
├── billing.jobs.js             # ✅ Payment processing and billing automation
├── subscription.jobs.js        # ✅ Subscription lifecycle automation
├── pod.jobs.js                 # ✅ Pod monitoring and health checks
└── notification.jobs.js        # ✅ Email notification job processing
```

### 6. Email Notification System (`/src/services/notification.service.js`)

**Purpose**: Email notifications and template processing

**Components**:

```
/services/notification.service.js  # ✅ Email service with queue integration
/jobs/notification.jobs.js         # ✅ Email job processing
/templates/emails/                 # ✅ HTML email templates
├── welcome.html                   # ✅ User welcome email
├── subscription-created.html      # ✅ Subscription confirmation
├── service-ready.html             # ✅ Service deployment notification
└── subscription-expiring.html     # ✅ Subscription expiry warning
```

### 7. Service Templates (`/src/templates/`)

**Purpose**: Kubernetes deployment templates for services

**Components**:

```
/templates/template.parser.js      # ✅ Template processing engine
```

**Available Templates:**

- **N8N Workflow Automation**: Complete setup with authentication and webhook support
- **Ghost Blog Platform**: Production-ready blog deployment with database integration
- **WordPress CMS**: Full WordPress stack with MySQL database and persistent storage

### 8. Middleware (`/src/middleware/`)

**Purpose**: Request processing and validation

**Structure**:

```
/middleware/
├── auth.middleware.js        # ✅ JWT validation and role-based access
├── error.middleware.js       # ✅ Global error handling
└── billing.middleware.js     # ✅ Balance validation and payment security
```

### 9. Utilities (`/src/utils/`)

**Purpose**: Helper functions and common utilities

**Structure**:

```
/utils/
├── logger.util.js           # ✅ Winston logging setup
├── crypto.util.js           # ✅ Encryption/hashing utilities
├── validation.util.js       # ✅ Data validation and UUID detection helpers
├── response.util.js         # ✅ API response formatting
├── http-status.util.js      # ✅ HTTP status code constants
├── user-roles.util.js       # ✅ User role constants
└── pdf.util.js              # ✅ PDF generation using PDFKit
```

## Database Schema Design

### Core Tables Relationships

```
Users (1) ←→ (N) Subscriptions (1) ←→ (N) ServiceInstances
                     ↓
              (N) Transactions
                     ↓
              (N) UsageMetrics

ServiceCatalog (1) ←→ (N) ServiceInstances
WorkerNodes (1) ←→ (N) ServiceInstances (pod placement)
```

### Key Models (Prisma Schema)

```prisma
model User {
  id            String          @id @default(cuid())
  email         String          @unique
  password      String
  name          String
  role          UserRole        @default(USER)
  subscriptions Subscription[]
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
```

## Integration Patterns

### Request Flow Architecture

```
Route → Controller → Service → Model/K8s → External Systems
  ↓         ↓          ↓         ↓              ↓
Validation → Business → Data → Kubernetes → Response/Event
            Logic     Access   Operations
```

### Pod Provisioning Flow

```
Subscription Creation → Template Processing → Pod Deployment → Namespace Creation → Service Exposure → Ingress Configuration → Health Monitoring → User Notification
```

### Background Job Processing

```
Event Trigger → Queue Job → Process with Retry → Update Status → Send Notification → Log Result
```

### Email Notification Flow

```
System Event → Queue Notification → Template Processing → Email Delivery → Status Tracking → Retry if Failed
```

## Critical Implementation Paths

### 1. Pod Provisioning with Notifications

```
subscriptions.controller.js → subscriptions.service.js → pod.service.js
        ↓                           ↓                        ↓
Order Processing → Subscription Creation → K8s Pod Deployment
        ↓                           ↓                        ↓
Database Update → notification.service.js → Email Queue
        ↓                           ↓                        ↓
Status Update → Template Processing → Email Delivery
```

### 2. Background Job Processing

```
job-scheduler.js → queue.manager.js → specific.jobs.js
       ↓                ↓                    ↓
Cron Trigger → Queue Management → Job Processing
       ↓                ↓                    ↓
Job Queue → Redis Storage → Worker Processing
```

### 3. Kubernetes Integration

```
pod.service.js → kubernetes.js → Kubernetes API
      ↓              ↓                ↓
Pod Operations → Client Setup → Cluster Operations
      ↓              ↓                ↓
Status Update → Error Handling → Resource Management
```

## Performance Targets

- **API Response Time**: < 200ms for standard operations
- **Pod Provisioning**: 2-5 minutes end-to-end
- **Email Delivery**: < 10 seconds for notification emails
- **Job Processing**: < 30 seconds for background jobs
- **System Uptime**: > 99.5% availability target

## Security Implementation

### Kubernetes Security

- **Namespace Isolation**: Customer pods isolated in dedicated namespaces
- **RBAC Integration**: Role-based access control for Kubernetes operations
- **Resource Quotas**: Configurable limits to prevent resource abuse
- **Network Policies**: Traffic isolation between customer workloads

### API Security

- **JWT Authentication**: Secure API access with token validation
- **Input Validation**: Comprehensive request validation and sanitization
- **Rate Limiting**: API rate limiting to prevent abuse
- **Error Handling**: Secure error responses without information leakage

## File Naming Conventions

- **Routes**: `{feature}.routes.js` - Express route definitions
- **Controllers**: `{feature}.controller.js` - Request/response handling
- **Services**: `{feature}.service.js` - Business logic
- **Jobs**: `{feature}.jobs.js` - Background tasks
- **Utilities**: `{feature}.util.js` - Helper functions
- **Templates**: `{feature}.html` - Email templates
- **Validations**: `{feature}.validation.js` - Input validation schemas

## Production Readiness

The system is now **production-ready** with:

1. **Complete PaaS Functionality**: Full subscription-to-pod workflow
2. **Production Monitoring**: Comprehensive health monitoring and alerting
3. **User Experience**: Email notifications and real-time status updates
4. **Scalable Architecture**: Queue-based processing and Kubernetes integration
5. **Developer Experience**: Complete API testing and documentation
6. **Security**: Comprehensive authentication, authorization, and input validation
7. **Monitoring**: Prometheus and Grafana integration for system observability

The backend provides complete PaaS functionality and is ready for frontend integration and production deployment.
