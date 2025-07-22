# Worker Integration Plan - PaaS Backend

## 🎯 **Overview**

This document outlines the complete plan for integrating worker nodes into the PaaS platform, including backend implementation, server setup, and automated registration processes.

## 📊 **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────────┐
│                        PaaS Cluster                            │
├─────────────────────────────────────────────────────────────────┤
│  Master Node (Ryzen 3900X - 64GB)                             │
│  ├── PaaS Backend API                                          │
│  ├── PostgreSQL Database                                       │
│  ├── Redis Cache                                               │
│  └── K3s Master                                                │
├─────────────────────────────────────────────────────────────────┤
│  Worker Node 1 (Ryzen 6900HS - 32GB)                         │
│  ├── K3s Agent                                                 │
│  ├── Auto-Registration Service                                 │
│  ├── Heartbeat Service                                         │
│  └── Customer Pods (N8N, Ghost, WordPress)                    │
├─────────────────────────────────────────────────────────────────┤
│  Worker Node 2 (Intel i7 Gen7 - 32GB)                        │
│  ├── K3s Agent                                                 │
│  ├── Auto-Registration Service                                 │
│  ├── Heartbeat Service                                         │
│  └── Customer Pods (N8N, Ghost, WordPress)                    │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 **Phase 1: Backend Implementation**

### **1.1 Current Status**

✅ **Completed:**

- Worker CRUD operations
- Status management (PENDING, ACTIVE, INACTIVE, MAINTENANCE, NOT_READY)
- Resource tracking (CPU, Memory, Storage, Pods)
- Statistics and monitoring
- Admin-only access control
- Comprehensive validation

### **1.2 Missing Implementation**

#### **A. Auto-Registration Endpoint**

**File:** `src/routes/workers.routes.js`

```javascript
// ADD THIS ROUTE
router.post(
  "/register",
  validateWorkerRegistration,
  registerWorkerNodeController
);
```

**File:** `src/controllers/worker.controller.js`

```javascript
// ADD THIS CONTROLLER
const registerWorkerNodeController = async (req, res) => {
  try {
    const registrationData = req.body;
    const { registrationToken } = registrationData;

    const result = await registerWorkerNode(
      registrationData,
      registrationToken
    );

    logger.info(`Worker auto-registered: ${result.worker.name}`);

    res.status(HTTP_STATUS.CREATED).json(
      responseUtil.success(
        {
          worker: result.worker,
          joinToken: result.joinToken,
          masterUrl: result.masterUrl,
          workerId: result.worker.id,
        },
        "Worker registered successfully"
      )
    );
  } catch (error) {
    logger.error("Error in registerWorkerNodeController:", error);

    if (error.message === "Invalid registration token") {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(responseUtil.error("Invalid registration token", "UNAUTHORIZED"));
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error("Worker registration failed", "REGISTRATION_FAILED")
      );
  }
};
```

**File:** `src/services/worker.service.js`

```javascript
// ADD THIS SERVICE FUNCTION
const registerWorkerNode = async (registrationData, registrationToken) => {
  try {
    // 1. Validate registration token
    if (registrationToken !== process.env.WORKER_REGISTRATION_TOKEN) {
      throw new Error("Invalid registration token");
    }

    // 2. Check if worker already exists (restart scenario)
    const existingWorker = await prisma.workerNode.findFirst({
      where: {
        OR: [
          { hostname: registrationData.hostname },
          { ipAddress: registrationData.ipAddress },
        ],
      },
    });

    if (existingWorker) {
      // Update existing worker (restart scenario)
      const updatedWorker = await prisma.workerNode.update({
        where: { id: existingWorker.id },
        data: {
          ...registrationData,
          status: "PENDING",
          isReady: false,
          lastHeartbeat: new Date(),
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Worker re-registered after restart: ${updatedWorker.name}`);

      return {
        worker: updatedWorker,
        joinToken: await generateK3sJoinToken(),
        masterUrl: process.env.K3S_MASTER_URL,
        isRestart: true,
      };
    }

    // Create new worker
    const workerNode = await createWorkerNode({
      ...registrationData,
      name: registrationData.hostname,
      status: "PENDING",
      isReady: false,
      isSchedulable: false,
    });

    return {
      worker: workerNode,
      joinToken: await generateK3sJoinToken(),
      masterUrl: process.env.K3S_MASTER_URL,
      isRestart: false,
    };
  } catch (error) {
    logger.error("Error in registerWorkerNode:", error);
    throw error;
  }
};

// Helper function to generate K3s join token
const generateK3sJoinToken = async () => {
  // For now, return the cluster token
  // In production, integrate with K3s API to generate unique tokens
  return process.env.K3S_CLUSTER_TOKEN;
};
```

#### **B. Health Monitoring Job**

**File:** `src/jobs/worker-health-monitor.job.js`

```javascript
import { prisma } from "../config/database.js";
import logger from "../utils/logger.util.js";

/**
 * Monitor worker node health based on heartbeat
 * Runs every minute via cron job
 */
const monitorWorkerHealth = async () => {
  try {
    const now = new Date();
    const heartbeatTimeout =
      parseInt(process.env.HEARTBEAT_TIMEOUT_MINUTES || 2) * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - heartbeatTimeout);

    // Find workers that haven't sent heartbeat in timeout period
    const staleWorkers = await prisma.workerNode.findMany({
      where: {
        AND: [
          { status: { in: ["ACTIVE", "PENDING"] } },
          {
            OR: [
              { lastHeartbeat: { lt: cutoffTime } },
              { lastHeartbeat: null },
            ],
          },
        ],
      },
    });

    // Update stale workers to INACTIVE
    for (const worker of staleWorkers) {
      await prisma.workerNode.update({
        where: { id: worker.id },
        data: {
          status: "INACTIVE",
          isReady: false,
          isSchedulable: false,
          updatedAt: new Date(),
        },
      });

      logger.warn(
        `Worker marked as INACTIVE due to missing heartbeat: ${worker.name}`
      );
    }

    // Find workers that have resumed heartbeat (recovery)
    const recoveredWorkers = await prisma.workerNode.findMany({
      where: {
        AND: [{ status: "INACTIVE" }, { lastHeartbeat: { gte: cutoffTime } }],
      },
    });

    // Update recovered workers to ACTIVE
    for (const worker of recoveredWorkers) {
      await prisma.workerNode.update({
        where: { id: worker.id },
        data: {
          status: "ACTIVE",
          isReady: true,
          isSchedulable: true,
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info(`Worker recovered and marked as ACTIVE: ${worker.name}`);
    }

    if (staleWorkers.length > 0 || recoveredWorkers.length > 0) {
      logger.info(
        `Health monitor: ${staleWorkers.length} workers down, ${recoveredWorkers.length} workers recovered`
      );
    }
  } catch (error) {
    logger.error("Error in worker health monitor:", error);
  }
};

export { monitorWorkerHealth };
```

**File:** `src/jobs/scheduler.js`

```javascript
import cron from "node-cron";
import { monitorWorkerHealth } from "./worker-health-monitor.job.js";
import logger from "../utils/logger.util.js";

/**
 * Initialize all scheduled jobs
 */
const initializeJobs = () => {
  // Worker health monitoring - every minute
  cron.schedule("* * * * *", async () => {
    try {
      await monitorWorkerHealth();
    } catch (error) {
      logger.error("Worker health monitor job failed:", error);
    }
  });

  logger.info("Background jobs initialized");
};

export { initializeJobs };
```

#### **C. Environment Configuration**

**Add to `.env`:**

```bash
# Worker Registration
WORKER_REGISTRATION_TOKEN=your-secure-registration-token-here
K3S_MASTER_URL=https://your-master-ip:6443
K3S_CLUSTER_TOKEN=your-k3s-cluster-token
WORKER_AUTH_SECRET=your-worker-auth-secret
HEARTBEAT_TIMEOUT_MINUTES=2
```

#### **D. Update Server Startup**

**File:** `src/server.js`

```javascript
// ADD THIS IMPORT
import { initializeJobs } from "./jobs/scheduler.js";

// ADD AFTER EXPRESS SETUP
// Initialize background jobs
initializeJobs();
```

## 🖥️ **Phase 2: Master Node Setup**

### **2.1 Master Server Requirements**

- **Hardware:** Ryzen 3900X (64GB RAM)
- **OS:** Ubuntu 22.04 LTS
- **Role:** K3s Master + PaaS Backend + Database + Redis

### **2.2 Master Node Installation Script**

**File:** `scripts/master-setup.sh`

```bash
#!/bin/bash
# master-setup.sh - Complete master node setup

set -e

echo "=== PaaS Master Node Setup ==="

# Variables
MASTER_IP=$(hostname -I | awk '{print $1}')
DB_PASSWORD="$(openssl rand -base64 32)"
JWT_SECRET="$(openssl rand -base64 64)"
WORKER_TOKEN="$(openssl rand -base64 32)"

echo "Master IP: $MASTER_IP"

# 1. Update system
echo "Updating system..."
apt update && apt upgrade -y

# 2. Install required packages
echo "Installing required packages..."
apt install -y curl wget git jq postgresql postgresql-contrib redis-server nginx certbot ufw

# 3. Configure firewall
echo "Configuring firewall..."
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 6443  # K3s API
ufw allow 3000  # PaaS API
ufw --force enable

# 4. Install Node.js 18
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# 5. Install K3s Master
echo "Installing K3s master..."
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik --bind-address $MASTER_IP --advertise-address $MASTER_IP" sh -

# Get K3s token
K3S_TOKEN=$(cat /var/lib/rancher/k3s/server/node-token)

# 6. Configure PostgreSQL
echo "Configuring PostgreSQL..."
sudo -u postgres createdb paas_db
sudo -u postgres createuser paas_user
sudo -u postgres psql -c "ALTER USER paas_user PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE paas_db TO paas_user;"

# 7. Setup PaaS backend directory
echo "Setting up PaaS backend..."
mkdir -p /opt/paas
cd /opt/paas

# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL="postgresql://paas_user:$DB_PASSWORD@localhost:5432/paas_db"
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_SECRET="$(openssl rand -base64 64)"
JWT_REFRESH_EXPIRES_IN="7d"

# Worker Registration
WORKER_REGISTRATION_TOKEN="$WORKER_TOKEN"
K3S_MASTER_URL="https://$MASTER_IP:6443"
K3S_CLUSTER_TOKEN="$K3S_TOKEN"
WORKER_AUTH_SECRET="$(openssl rand -base64 32)"
HEARTBEAT_TIMEOUT_MINUTES=2
EOF

# 8. Create systemd service for PaaS backend
cat > /etc/systemd/system/paas-backend.service << EOF
[Unit]
Description=PaaS Backend API
After=network.target postgresql.service redis.service k3s.service
Wants=postgresql.service redis.service k3s.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/paas
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/paas/.env

[Install]
WantedBy=multi-user.target
EOF

# 9. Configure Nginx reverse proxy
cat > /etc/nginx/sites-available/paas-api << EOF
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/paas-api /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 10. Enable services
systemctl enable postgresql redis-server nginx k3s paas-backend

echo "=== Master Node Setup Complete ==="
echo "Master IP: $MASTER_IP"
echo "K3s Token: $K3S_TOKEN"
echo "Worker Registration Token: $WORKER_TOKEN"
echo "Database Password: $DB_PASSWORD"
echo ""
echo "Next steps:"
echo "1. Clone your PaaS backend code to /opt/paas"
echo "2. Run 'npm install' in /opt/paas"
echo "3. Run 'npx prisma migrate deploy' to setup database"
echo "4. Start the service: systemctl start paas-backend"
echo "5. Setup SSL with: certbot --nginx -d your-domain.com"
```

## 🔧 **Phase 3: Worker Node Setup**

### **3.1 Worker Server Requirements**

- **Hardware:** Ryzen 6900HS (32GB) or Intel i7 Gen7 (32GB)
- **OS:** Ubuntu 22.04 LTS
- **Role:** K3s Agent + Customer Pods

### **3.2 Worker Node Installation Script**

**File:** `scripts/worker-setup.sh`

```bash
#!/bin/bash
# worker-setup.sh - Complete worker node setup

set -e

echo "=== PaaS Worker Node Setup ==="

# Configuration - EDIT THESE VALUES
MASTER_API="https://your-paas-domain.com/api/workers/register"
REGISTRATION_TOKEN="your-worker-registration-token"

# 1. Update system
echo "Updating system..."
apt update && apt upgrade -y

# 2. Install required packages
echo "Installing required packages..."
apt install -y curl wget git jq

# 3. Configure firewall
echo "Configuring firewall..."
ufw allow ssh
ufw allow from 10.0.0.0/8  # Allow cluster communication
ufw --force enable

# 4. Create worker registration script
cat > /opt/worker-register.sh << 'EOF'
#!/bin/bash
# worker-register.sh - Auto-registration script

# Configuration
MASTER_API="https://your-paas-domain.com/api/workers/register"
REGISTRATION_TOKEN="your-worker-registration-token"

echo "Starting worker registration..."

# Check if this is a restart (K3s config exists)
if [ -f /etc/rancher/k3s/k3s.yaml ]; then
    echo "Detected restart - cleaning up old K3s installation..."
    systemctl stop k3s-agent 2>/dev/null || true
    rm -rf /etc/rancher/k3s/
    rm -rf /var/lib/rancher/k3s/
fi

# Collect system information
HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')
CPU_CORES=$(nproc)
CPU_ARCH=$(lscpu | grep "Model name" | cut -d: -f2 | xargs)
TOTAL_MEMORY=$(free -h | grep Mem | awk '{print $2}')
TOTAL_STORAGE=$(df -h / | tail -1 | awk '{print $2}')
ARCHITECTURE=$(uname -m | sed 's/x86_64/amd64/')
OS_VERSION=$(lsb_release -d | cut -d: -f2 | xargs)
KERNEL_VERSION=$(uname -r)

echo "System Info:"
echo "  Hostname: $HOSTNAME"
echo "  IP: $IP_ADDRESS"
echo "  CPU Cores: $CPU_CORES"
echo "  CPU Architecture: $CPU_ARCH"
echo "  Memory: $TOTAL_MEMORY"
echo "  Storage: $TOTAL_STORAGE"

# Create registration payload
PAYLOAD=$(cat <<EOFPAYLOAD
{
  "hostname": "$HOSTNAME",
  "ipAddress": "$IP_ADDRESS",
  "cpuCores": $CPU_CORES,
  "cpuArchitecture": "$CPU_ARCH",
  "totalMemory": "${TOTAL_MEMORY}i",
  "totalStorage": "$TOTAL_STORAGE",
  "architecture": "$ARCHITECTURE",
  "operatingSystem": "$OS_VERSION",
  "kernelVersion": "$KERNEL_VERSION",
  "osImage": "$OS_VERSION",
  "registrationToken": "$REGISTRATION_TOKEN"
}
EOFPAYLOAD
)

echo "Sending registration request..."

# Send registration request
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$MASTER_API")

echo "Registration response received"

# Parse response and join cluster
if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
  IS_RESTART=$(echo "$RESPONSE" | jq -r '.data.isRestart // false')
  WORKER_ID=$(echo "$RESPONSE" | jq -r '.data.workerId')

  if [ "$IS_RESTART" = "true" ]; then
    echo "Worker re-registered after restart"
  else
    echo "New worker registered successfully"
  fi

  # Save worker ID for heartbeat service
  echo "$WORKER_ID" > /etc/worker-id

  # Get join configuration
  JOIN_TOKEN=$(echo "$RESPONSE" | jq -r '.data.joinToken')
  MASTER_URL=$(echo "$RESPONSE" | jq -r '.data.masterUrl')

  echo "Joining K3s cluster..."

  # Install K3s agent with join token
  curl -sfL https://get.k3s.io | K3S_URL="$MASTER_URL" K3S_TOKEN="$JOIN_TOKEN" sh -

  echo "K3s agent installed and joined cluster"

  # Enable and start heartbeat service
  systemctl enable worker-heartbeat
  systemctl start worker-heartbeat

  echo "Worker registration and setup complete!"
  echo "Worker ID: $WORKER_ID"

else
  echo "Registration failed: $(echo "$RESPONSE" | jq -r '.message // "Unknown error"')"
  exit 1
fi
EOF

chmod +x /opt/worker-register.sh

# 5. Create heartbeat script
cat > /opt/worker-heartbeat.sh << 'EOF'
#!/bin/bash
# worker-heartbeat.sh - Heartbeat service

WORKER_ID_FILE="/etc/worker-id"
API_BASE="https://your-paas-domain.com/api/workers"

# Check if worker ID exists
if [ ! -f "$WORKER_ID_FILE" ]; then
    echo "Worker ID not found. Attempting re-registration..."
    /opt/worker-register.sh
    exit $?
fi

WORKER_ID=$(cat "$WORKER_ID_FILE")

echo "Starting heartbeat service for worker: $WORKER_ID"

while true; do
    # Collect current system metrics
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d',' -f1)
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)

    # Count current pods (if kubectl is available)
    if command -v kubectl &> /dev/null; then
        CURRENT_PODS=$(kubectl get pods --all-namespaces --field-selector spec.nodeName=$(hostname) 2>/dev/null | wc -l)
        CURRENT_PODS=$((CURRENT_PODS - 1))  # Subtract header line
    else
        CURRENT_PODS=0
    fi

    # Create heartbeat payload
    PAYLOAD=$(cat <<EOFPAYLOAD
{
    "cpuUsage": ${CPU_USAGE:-0},
    "memoryUsage": ${MEMORY_USAGE:-0},
    "diskUsage": ${DISK_USAGE:-0},
    "currentPods": ${CURRENT_PODS:-0}
}
EOFPAYLOAD
)

    # Send heartbeat
    RESPONSE=$(curl -s -X PATCH \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$API_BASE/$WORKER_ID/heartbeat")

    # Check response
    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        echo "$(date): Heartbeat sent successfully"
    else
        echo "$(date): Heartbeat failed - attempting re-registration"
        /opt/worker-register.sh
    fi

    # Wait 30 seconds
    sleep 30
done
EOF

chmod +x /opt/worker-heartbeat.sh

# 6. Create systemd service for heartbeat
cat > /etc/systemd/system/worker-heartbeat.service << EOF
[Unit]
Description=Worker Heartbeat Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
ExecStart=/opt/worker-heartbeat.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 7. Enable heartbeat service (don't start yet)
systemctl enable worker-heartbeat

echo "=== Worker Node Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit /opt/worker-register.sh with correct MASTER_API and REGISTRATION_TOKEN"
echo "2. Edit /opt/worker-heartbeat.sh with correct API_BASE"
echo "3. Run: /opt/worker-register.sh"
echo "4. Verify worker status in PaaS admin dashboard"
```

## 📝 **Phase 4: Deployment Process**

### **4.1 Master Node Deployment**

```bash
# 1. Setup master server
wget https://raw.githubusercontent.com/your-repo/scripts/master-setup.sh
chmod +x master-setup.sh
sudo ./master-setup.sh

# 2. Clone and deploy PaaS backend
cd /opt/paas
git clone https://github.com/your-repo/be-minispod.git .
npm install

# 3. Setup database
npx prisma migrate deploy
npx prisma db seed

# 4. Start services
sudo systemctl start paas-backend
sudo systemctl status paas-backend

# 5. Setup SSL (optional)
sudo certbot --nginx -d your-domain.com
```

### **4.2 Worker Node Deployment**

```bash
# 1. Setup worker server
wget https://raw.githubusercontent.com/your-repo/scripts/worker-setup.sh
chmod +x worker-setup.sh
sudo ./worker-setup.sh

# 2. Configure registration
sudo nano /opt/worker-register.sh
# Edit MASTER_API and REGISTRATION_TOKEN

sudo nano /opt/worker-heartbeat.sh
# Edit API_BASE

# 3. Register worker
sudo /opt/worker-register.sh

# 4. Verify registration
curl -H "Authorization: Bearer <admin-token>" \
  https://your-domain.com/api/workers
```

## 🔍 **Phase 5: Monitoring & Verification**

### **5.1 Health Checks**

```bash
# Check master services
systemctl status paas-backend k3s postgresql redis-server

# Check worker services
systemctl status k3s-agent worker-heartbeat

# Check cluster status
kubectl get nodes
kubectl get pods --all-namespaces
```

### **5.2 API Testing**

```bash
# Test worker registration endpoint
curl -X POST https://your-domain.com/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "test-worker",
    "ipAddress": "192.168.1.100",
    "cpuCores": 8,
    "registrationToken": "your-token"
  }'

# Test worker list (admin)
curl -H "Authorization: Bearer <admin-token>" \
  https://your-domain.com/api/workers

# Test worker stats
curl -H "Authorization: Bearer <admin-token>" \
  https://your-domain.com/api/workers/stats
```

## 🚨 **Troubleshooting**

### **Common Issues**

1. **Worker Registration Fails**

   - Check registration token in .env
   - Verify network connectivity
   - Check firewall rules

2. **K3s Agent Won't Join**

   - Verify K3s master is running
   - Check join token validity
   - Ensure port 6443 is accessible

3. **Heartbeat Service Fails**

   - Check worker ID file exists
   - Verify API endpoint accessibility
   - Check service logs: `journalctl -u worker-heartbeat`

4. **Worker Shows as INACTIVE**
   - Check heartbeat service status
   - Verify network connectivity
   - Check backend health monitor job

### **Log Locations**

```bash
# Master logs
journalctl -u paas-backend
journalctl -u k3s
tail -f /opt/paas/logs/app.log

# Worker logs
journalctl -u k3s-agent
journalctl -u worker-heartbeat
```

## 📋 **Implementation Checklist**

### **Backend Implementation**

- [ ] Add auto-registration endpoint
- [ ] Implement health monitoring job
- [ ] Update environment configuration
- [ ] Add job scheduler to server startup
- [ ] Test registration API

### **Master Node Setup**

- [ ] Run master setup script
- [ ] Deploy PaaS backend code
- [ ] Configure database and migrations
- [ ] Setup SSL certificate
- [ ] Verify all services running

### **Worker Node Setup**

- [ ] Run worker setup script on each node
- [ ] Configure registration credentials
- [ ] Test worker registration
- [ ] Verify K3s cluster join
- [ ] Check heartbeat service

### **Testing & Verification**

- [ ] Test worker auto-registration
- [ ] Test worker crash recovery
- [ ] Test heartbeat monitoring
- [ ] Verify admin dashboard shows workers
- [ ] Test pod deployment to workers

## 🎯 **Success Criteria**

1. **Auto-Registration Works**

   - New workers can register automatically
   - Existing workers re-register after restart
   - Registration tokens are validated

2. **Health Monitoring Active**

   - Workers send heartbeats every 30 seconds
   - Backend detects offline workers within 2 minutes
   - Workers automatically recover when back online

3. **Cluster Management**

   - K3s cluster shows all nodes as Ready
   - Admin dashboard displays accurate worker status
   - Pod scheduling works across all workers

4. **Fault Tolerance**
   - Worker crashes are detected and handled
   - Worker restarts automatically rejoin cluster
   - No manual intervention required for common failures

This plan provides a complete roadmap for implementing worker integration in your PaaS platform, from backend code to server deployment scripts.
