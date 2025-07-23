# Service Variants/Plans System Design

## Overview

Design a system where services can have multiple variants/plans (e.g., N8N Basic, Plus, Pro) while presenting a unified frontend experience where users see one service card but can choose from multiple plans.

## Current vs Proposed Architecture

### Current System

```
ServiceCatalog Table:
- id: "n8n-basic"
- name: "n8n-basic"
- displayName: "N8N Basic"
- cpuLimit: "1"
- memLimit: "1Gi"
- monthlyPrice: 50000

ServiceCatalog Table:
- id: "n8n-plus"
- name: "n8n-plus"
- displayName: "N8N Plus"
- cpuLimit: "1.5"
- memLimit: "1.5Gi"
- monthlyPrice: 75000

ServiceCatalog Table:
- id: "n8n-pro"
- name: "n8n-pro"
- displayName: "N8N Pro"
- cpuLimit: "2"
- memLimit: "2Gi"
- monthlyPrice: 100000
```

**Frontend Impact**: Shows 3 separate cards

### Proposed System

```
ServiceCatalog Table (Enhanced):
- id: "n8n-basic"
- name: "n8n"              # Base service name
- displayName: "N8N Workflow Automation"
- variant: "basic"         # NEW: Plan variant
- variantDisplayName: "Basic Plan"  # NEW: Plan display name
- cpuLimit: "1"
- memLimit: "1Gi"
- monthlyPrice: 50000
- sortOrder: 1             # NEW: For ordering variants

ServiceCatalog Table:
- id: "n8n-plus"
- name: "n8n"              # Same base service
- displayName: "N8N Workflow Automation"
- variant: "plus"          # NEW: Plan variant
- variantDisplayName: "Plus Plan"   # NEW: Plan display name
- cpuLimit: "1.5"
- memLimit: "1.5Gi"
- monthlyPrice: 75000
- sortOrder: 2             # NEW: For ordering variants

ServiceCatalog Table:
- id: "n8n-pro"
- name: "n8n"              # Same base service
- displayName: "N8N Workflow Automation"
- variant: "pro"           # NEW: Plan variant
- variantDisplayName: "Pro Plan"    # NEW: Plan display name
- cpuLimit: "2"
- memLimit: "2Gi"
- monthlyPrice: 100000
- sortOrder: 3             # NEW: For ordering variants
```

**Frontend Impact**: Shows 1 card with 3 plan options

## Database Schema Changes

### Enhanced ServiceCatalog Model

```prisma
model ServiceCatalog {
  id          String  @id @default(cuid())
  name        String  // Base service name: "n8n", "ghost", "wordpress"
  displayName String  // Service display name: "N8N Workflow Automation"
  description String
  version     String  @default("latest")
  isActive    Boolean @default(true)

  // NEW: Variant/Plan fields
  variant             String  // "basic", "plus", "pro", "standard"
  variantDisplayName  String  // "Basic Plan", "Plus Plan", "Pro Plan"
  sortOrder          Int     @default(1) // For ordering variants
  isDefaultVariant   Boolean @default(false) // Mark default plan

  // Resource specifications (per variant)
  cpuRequest String @default("0.25")
  cpuLimit   String @default("1")
  memRequest String @default("512Mi")
  memLimit   String @default("1Gi")

  // Pricing (per variant)
  monthlyPrice Decimal @default(0)

  // Template configuration
  dockerImage     String
  containerPort   Int    @default(80)
  environmentVars Json?

  // NEW: Service metadata
  category    String? // "automation", "cms", "database"
  tags        String[] // ["workflow", "automation", "integration"]
  icon        String? // Icon URL or identifier

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  subscriptions Subscription[]

  // NEW: Composite unique constraint
  @@unique([name, variant])
  @@map("service_catalog")
}
```

## API Design

### Frontend-Friendly Endpoints

#### 1. Get Grouped Services (for frontend cards)

```
GET /api/v1/services/grouped
```

**Response**:

```json
{
  "success": true,
  "data": {
    "services": [
      {
        "name": "n8n",
        "displayName": "N8N Workflow Automation",
        "description": "Powerful workflow automation platform",
        "category": "automation",
        "tags": ["workflow", "automation", "integration"],
        "icon": "n8n-icon.svg",
        "variants": [
          {
            "id": "n8n-basic",
            "variant": "basic",
            "variantDisplayName": "Basic Plan",
            "cpuLimit": "1",
            "memLimit": "1Gi",
            "monthlyPrice": 50000,
            "isDefault": true,
            "features": ["1 vCPU", "1GB RAM", "Basic Support"]
          },
          {
            "id": "n8n-plus",
            "variant": "plus",
            "variantDisplayName": "Plus Plan",
            "cpuLimit": "1.5",
            "memLimit": "1.5Gi",
            "monthlyPrice": 75000,
            "isDefault": false,
            "features": ["1.5 vCPU", "1.5GB RAM", "Priority Support"]
          },
          {
            "id": "n8n-pro",
            "variant": "pro",
            "variantDisplayName": "Pro Plan",
            "cpuLimit": "2",
            "memLimit": "2Gi",
            "monthlyPrice": 100000,
            "isDefault": false,
            "features": [
              "2 vCPU",
              "2GB RAM",
              "24/7 Support",
              "Advanced Features"
            ]
          }
        ]
      },
      {
        "name": "ghost",
        "displayName": "Ghost Blog Platform",
        "description": "Modern publishing platform",
        "category": "cms",
        "variants": [
          {
            "id": "ghost-starter",
            "variant": "starter",
            "variantDisplayName": "Starter",
            "monthlyPrice": 25000,
            "isDefault": true
          },
          {
            "id": "ghost-pro",
            "variant": "pro",
            "variantDisplayName": "Professional",
            "monthlyPrice": 50000,
            "isDefault": false
          }
        ]
      }
    ]
  }
}
```

#### 2. Get Service Variants

```
GET /api/v1/services/:serviceName/variants
```

**Response**:

```json
{
  "success": true,
  "data": {
    "serviceName": "n8n",
    "displayName": "N8N Workflow Automation",
    "variants": [
      {
        "id": "n8n-basic",
        "variant": "basic",
        "variantDisplayName": "Basic Plan",
        "cpuLimit": "1",
        "memLimit": "1Gi",
        "monthlyPrice": 50000,
        "isDefault": true
      }
      // ... other variants
    ]
  }
}
```

#### 3. Get Specific Variant Details

```
GET /api/v1/services/:serviceId
```

**Response**: Same as current, but includes variant information

## Frontend Implementation Strategy

### Service Card Component

```jsx
// ServiceCard.jsx
function ServiceCard({ service }) {
  const [selectedVariant, setSelectedVariant] = useState(
    service.variants.find((v) => v.isDefault) || service.variants[0]
  );

  return (
    <div className="service-card">
      <div className="service-header">
        <img src={service.icon} alt={service.displayName} />
        <h3>{service.displayName}</h3>
        <p>{service.description}</p>
      </div>

      <div className="variant-selector">
        <label>Choose Plan:</label>
        <select
          value={selectedVariant.id}
          onChange={(e) =>
            setSelectedVariant(
              service.variants.find((v) => v.id === e.target.value)
            )
          }
        >
          {service.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.variantDisplayName} - {formatPrice(variant.monthlyPrice)}
            </option>
          ))}
        </select>
      </div>

      <div className="variant-details">
        <h4>{selectedVariant.variantDisplayName}</h4>
        <div className="features">
          {selectedVariant.features.map((feature) => (
            <span key={feature} className="feature">
              {feature}
            </span>
          ))}
        </div>
        <div className="price">
          {formatPrice(selectedVariant.monthlyPrice)}/month
        </div>
      </div>

      <button
        onClick={() => createSubscription(selectedVariant.id)}
        className="subscribe-btn"
      >
        Subscribe to {selectedVariant.variantDisplayName}
      </button>
    </div>
  );
}
```

### Service Grid Component

```jsx
// ServiceGrid.jsx
function ServiceGrid() {
  const [groupedServices, setGroupedServices] = useState([]);

  useEffect(() => {
    fetch("/api/v1/services/grouped")
      .then((res) => res.json())
      .then((data) => setGroupedServices(data.data.services));
  }, []);

  return (
    <div className="service-grid">
      {groupedServices.map((service) => (
        <ServiceCard key={service.name} service={service} />
      ))}
    </div>
  );
}
```

## Migration Strategy

### Step 1: Database Schema Update

```sql
-- Add new columns to existing table
ALTER TABLE service_catalog
ADD COLUMN variant VARCHAR(50) DEFAULT 'standard',
ADD COLUMN variant_display_name VARCHAR(100),
ADD COLUMN sort_order INTEGER DEFAULT 1,
ADD COLUMN is_default_variant BOOLEAN DEFAULT false,
ADD COLUMN category VARCHAR(50),
ADD COLUMN tags TEXT[],
ADD COLUMN icon VARCHAR(255);

-- Update existing records
UPDATE service_catalog
SET variant = 'standard',
    variant_display_name = 'Standard Plan',
    is_default_variant = true
WHERE variant IS NULL;

-- Add unique constraint
ALTER TABLE service_catalog
ADD CONSTRAINT unique_name_variant UNIQUE (name, variant);
```

### Step 2: Data Migration

```javascript
// Migration script to convert existing services
const existingServices = await prisma.serviceCatalog.findMany();

for (const service of existingServices) {
  // If service name contains variant info, extract it
  if (service.name.includes("-")) {
    const [baseName, variant] = service.name.split("-");
    await prisma.serviceCatalog.update({
      where: { id: service.id },
      data: {
        name: baseName,
        variant: variant || "standard",
        variantDisplayName: `${
          variant.charAt(0).toUpperCase() + variant.slice(1)
        } Plan`,
      },
    });
  }
}
```

### Step 3: API Enhancement

- Add grouped services endpoint
- Add variant-specific endpoints
- Maintain backward compatibility

### Step 4: Frontend Update

- Update service cards to show variants
- Add variant selection UI
- Update subscription flow

## Benefits

### For Users

- ✅ **Cleaner Interface**: One card per service type
- ✅ **Easy Comparison**: All plans visible in one place
- ✅ **Flexible Choice**: Can easily switch between plans
- ✅ **Clear Pricing**: Transparent plan comparison

### For Business

- ✅ **Upselling**: Easy to showcase premium plans
- ✅ **Plan Management**: Centralized plan configuration
- ✅ **Analytics**: Better tracking of plan preferences
- ✅ **Scalability**: Easy to add new plans

### For Development

- ✅ **Maintainable**: Logical service grouping
- ✅ **Flexible**: Easy to add new variants
- ✅ **Consistent**: Unified data model
- ✅ **Backward Compatible**: Existing subscriptions work

## Implementation Timeline

1. **Database Schema Update** (Day 1)
2. **Data Migration** (Day 1)
3. **Backend API Enhancement** (Day 2)
4. **Frontend Service Components** (Day 3)
5. **Testing & Integration** (Day 4)
6. **Documentation Update** (Day 5)

This design provides a clean separation between service types and their variants while maintaining a user-friendly frontend experience.
