# Backend Architecture - PaaS Platform

## System Overview

The backend is designed as a **microservices-oriented monolith** using Express.js, providing REST APIs for customer management, subscription lifecycle, and Kubernetes pod orchestration with webhook integration.

## Current Implementation Status

### ✅ Phase 1 Complete - Authentication System

**Implemented Components:**

- **Express.js Server**: ES6 modules with modern syntax
- **Authentication System**: JWT-based auth with access/refresh tokens
- **User Management**: Registration, login, profile management
- **Database Layer**: PostgreSQL with Prisma ORM
- **Security Middleware**: Password hashing, JWT validation, rate limiting
- **Role System**: Simplified USER and ADMINISTRATOR roles
- **Development Tools**: REST API testing, logging, error handling

**Current File Structure:**

```
src/
├── server.js                    # ✅ Main Express server
├── controllers/
│   └── auth.controller.js       # ✅ Authentication handlers
├── middleware/
│   ├── auth.middleware.js       # ✅ JWT auth & authorization
│   └── error.middleware.js      # ✅ Global error handling
├── routes/
│   ├── auth.routes.js          # ✅ Authentication endpoints
│   ├── users.routes.js         # 🔄 Placeholder (Phase 2)
│   ├── services.routes.js      # 🔄 Placeholder (Phase 2)
│   ├── subscriptions.routes.js # 🔄 Placeholder (Phase 2)
│   └── pods.routes.js          # 🔄 Placeholder (Phase 2)
├── services/
│   └── auth.service.js         # ✅ Authentication business logic
└── utils/
    ├── crypto.util.js          # ✅ Password hashing
    ├── logger.util.js          # ✅ Winston logging
    ├── response.util.js        # ✅ API response formatting
    └── validation.util.js      # ✅ Input validation
```

### 🔄 Phase 2 Planned - Business Logic

**Next Implementation Priority:**

- Service catalog management
- Subscription lifecycle APIs
- User management for administrators
- Database schema expansion

### 🔄 Phase 3 Planned - Kubernetes Integration

**Future Implementation:**

- Kubernetes client integration
- Pod provisioning and management
- Webhook system for events
- Background job processing

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
├── auth.routes.js          # Authentication endpoints
├── users.routes.js         # User management endpoints
├── services.routes.js      # Service catalog endpoints
├── subscriptions.routes.js # Subscription management endpoints
├── pods.routes.js          # Pod management endpoints
├── admin.routes.js         # Admin dashboard endpoints
├── webhooks.routes.js      # Webhook endpoints (incoming)
└── notifications.routes.js # Notification endpoints
```

### 2. Controller Layer (`/src/controllers/`)

**Purpose**: Request/response handling and validation

**Structure**:

```
/controllers/
├── auth.controller.js        # Authentication logic
├── users.controller.js       # User CRUD operations
├── services.controller.js    # Service catalog operations
├── subscriptions.controller.js # Subscription lifecycle
├── pods.controller.js        # Pod management operations
├── admin.controller.js       # Admin operations
├── webhooks.controller.js    # Webhook handlers (incoming)
└── notifications.controller.js # Notification management
```

### 3. Service Layer (`/src/services/`)

**Purpose**: Core business logic and orchestration

**Structure**:

```
/services/
├── auth.service.js           # JWT, password hashing, sessions
├── users.service.js          # User management operations
├── subscriptions.service.js  # Subscription lifecycle management
├── pods.service.js           # Kubernetes pod operations
├── services.service.js       # Service catalog management
├── billing.service.js        # Usage tracking & billing
├── notifications.service.js  # Email & webhook notifications
├── webhooks.service.js       # Webhook processing & validation
└── monitoring.service.js     # Metrics collection
```

### 4. Webhook System (`/src/webhooks/`)

**Purpose**: Webhook handling for external integrations and notifications

**Components**:

```
/webhooks/
├── handlers/
│   ├── kubernetes.webhook.js    # K8s cluster events
│   ├── payment.webhook.js       # Payment gateway webhooks
│   ├── monitoring.webhook.js    # Monitoring alerts
│   └── custom.webhook.js        # Custom service webhooks
├── senders/
│   ├── customer.webhook.js      # Customer notification webhooks
│   ├── admin.webhook.js         # Admin alert webhooks
│   └── integration.webhook.js   # Third-party integrations
├── validators/
│   ├── signature.validator.js   # Webhook signature validation
│   └── payload.validator.js     # Payload structure validation
└── webhook.manager.js           # Webhook registration & management
```

### 5. Kubernetes Integration Layer (`/src/k8s/`)

**Purpose**: Kubernetes cluster management and pod orchestration

**Components**:

```
/k8s/
├── kubernetes.client.js      # K8s API client wrapper
├── pods.manager.js           # Pod CRUD operations
├── namespaces.manager.js     # Customer namespace management
├── templates/                # Pre-configured service templates
│   ├── n8n.template.yaml
│   ├── ghost.template.yaml
│   └── wordpress.template.yaml
├── configs.manager.js        # ConfigMaps & Secrets
├── resources.monitor.js      # Resource usage tracking
└── events.listener.js        # K8s event webhook listener
```

### 6. Data Access Layer (`/src/models/`)

**Purpose**: Database operations using Prisma ORM

**Core Models**:

```
/models/
├── users.model.js            # User entity operations
├── subscriptions.model.js    # Subscription management
├── service-instances.model.js # Running service instances
├── service-catalog.model.js  # Available services
├── usage-metrics.model.js    # Resource usage tracking
├── worker-nodes.model.js     # K8s worker node info
├── transactions.model.js     # Billing transactions
├── webhooks.model.js         # Webhook configurations
└── notifications.model.js    # Notification history
```

### 7. Background Jobs (`/src/jobs/`)

**Purpose**: Automated tasks and scheduled operations

**Job Types**:

```
/jobs/
├── subscription-expiry.job.js  # Daily expiry checker
├── resource-usage.job.js       # Hourly usage collection
├── pod-health-check.job.js     # Pod monitoring
├── cleanup.job.js              # Expired resource cleanup
├── notifications.job.js        # Customer notifications
├── webhook-retry.job.js        # Failed webhook retry
└── backup.job.js               # Data backup operations
```

### 8. Middleware (`/src/middleware/`)

**Purpose**: Request processing and validation

**Structure**:

```
/middleware/
├── auth.middleware.js        # JWT validation
├── validation.middleware.js  # Request validation
├── rate-limit.middleware.js  # API rate limiting
├── error.middleware.js       # Error handling
├── logging.middleware.js     # Request logging
└── webhook.middleware.js     # Webhook signature validation
```

### 9. Utilities (`/src/utils/`)

**Purpose**: Helper functions and common utilities

**Structure**:

```
/utils/
├── logger.util.js           # Winston logging setup
├── crypto.util.js           # Encryption/hashing utilities
├── validation.util.js       # Data validation helpers
├── response.util.js         # API response formatting
├── webhook.util.js          # Webhook utilities
└── constants.util.js        # Application constants
```

## Webhook Architecture

### Incoming Webhooks (External → Our System)

```
External Service → webhooks.routes.js → webhooks.controller.js
        ↓                ↓                      ↓
Signature Validation → Payload Processing → Business Logic
        ↓                ↓                      ↓
webhook.middleware.js → webhooks.service.js → Appropriate Service
```

**Webhook Sources**:

- **Kubernetes Events**: Pod status changes, node events
- **Payment Gateway**: Payment confirmations, failures
- **Monitoring Systems**: Alerts, threshold breaches
- **Customer Services**: N8N workflows, Ghost events

### Outgoing Webhooks (Our System → External)

```
Business Event → webhooks.service.js → Webhook Queue (Redis)
      ↓                ↓                      ↓
Event Trigger → Payload Generation → Delivery Attempt
      ↓                ↓                      ↓
Database Log → HTTP Request → Success/Retry Logic
```

**Webhook Targets**:

- **Customer Systems**: Service status updates, billing alerts
- **Admin Systems**: System alerts, capacity warnings
- **Third-party Integrations**: CRM updates, analytics

### Webhook Security

- **Signature Validation**: HMAC-SHA256 signature verification
- **IP Whitelisting**: Restrict webhook sources
- **Rate Limiting**: Prevent webhook abuse
- **Payload Validation**: Schema validation for incoming data
- **Retry Logic**: Exponential backoff for failed deliveries

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
Webhooks (1) ←→ (N) WebhookDeliveries (delivery tracking)
```

### Webhook-Related Tables

```sql
-- Webhook configurations
webhooks: id, user_id, url, events[], secret, active, created_at

-- Webhook delivery tracking
webhook_deliveries: id, webhook_id, event_type, payload,
                   status, attempts, last_attempt, created_at

-- Notification history
notifications: id, user_id, type, channel, content,
              webhook_id, status, created_at
```

## Integration Patterns

### Request Flow Architecture

```
Route → Controller → Service → Model/K8s/Webhook → External Systems
  ↓         ↓          ↓         ↓                      ↓
Validation → Business → Data → External → Response/Event
            Logic     Access   Systems
```

### Event-Driven Webhook Flow

```
Business Event → webhooks.service.js → Webhook Queue
      ↓                ↓                    ↓
Event Detection → Payload Generation → Delivery Job
      ↓                ↓                    ↓
Database Log → HTTP Request → Success/Retry Tracking
```

### Kubernetes Event Integration

```
K8s Event → events.listener.js → webhooks.service.js
    ↓              ↓                    ↓
Pod Status → Event Processing → Customer Notification
    ↓              ↓                    ↓
Database → Business Logic → Webhook Delivery
```

## Critical Implementation Paths

### 1. Pod Provisioning with Webhooks

```
subscriptions.controller.js → subscriptions.service.js → pods.service.js
        ↓                           ↓                        ↓
Order Processing → Subscription Creation → K8s Pod Deployment
        ↓                           ↓                        ↓
Database Update → webhooks.service.js → Customer Webhook
        ↓                           ↓                        ↓
Notification Log → HTTP Delivery → Success Tracking
```

### 2. Webhook Event Processing

```
webhooks.routes.js → webhook.middleware.js → webhooks.controller.js
       ↓                    ↓                        ↓
Incoming Webhook → Signature Validation → Event Processing
       ↓                    ↓                        ↓
Payload Extract → Business Logic → Database Update
       ↓                    ↓                        ↓
Response → Acknowledgment → Event Completion
```

### 3. System Event Broadcasting

```
System Event → webhooks.service.js → Webhook Queue (Redis)
     ↓               ↓                      ↓
Event Trigger → Payload Generation → Background Job
     ↓               ↓                      ↓
Database Log → HTTP Delivery → Retry Logic
```

## Performance Targets

- **API Response Time**: < 200ms for standard operations
- **Webhook Delivery**: < 5 seconds for outgoing webhooks
- **Webhook Processing**: < 1 second for incoming webhooks
- **Pod Provisioning**: 2-5 minutes end-to-end
- **Event Processing**: < 30 seconds from trigger to delivery

## File Naming Conventions

- **Routes**: `{feature}.routes.js` - Express route definitions
- **Controllers**: `{feature}.controller.js` - Request/response handling
- **Services**: `{feature}.service.js` - Business logic
- **Models**: `{feature}.model.js` - Database operations
- **Middleware**: `{feature}.middleware.js` - Request processing
- **Utilities**: `{feature}.util.js` - Helper functions
- **Jobs**: `{feature}.job.js` - Background tasks
- **Webhooks**: `{feature}.webhook.js` - Webhook handlers
- **Templates**: `{service}.template.yaml` - K8s templates
