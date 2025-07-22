# Complete Beginner's Guide to Local Kubernetes Development for PaaS

## 🎯 What You'll Learn

This guide will teach you **from zero** how to set up a local Kubernetes environment on your Mac to develop and test your PaaS backend. No prior Kubernetes knowledge required!

## 📚 What is Kubernetes? (Simple Explanation)

Think of Kubernetes like a **smart apartment building manager**:

- **Master Node** = Building Manager (makes decisions, keeps records)
- **Worker Nodes** = Apartment Buildings (where people actually live)
- **Pods** = Individual Apartments (where your applications run)
- **Services** = Building Address System (how people find apartments)

In your PaaS project:

- **Master Node** = Your main server (Ryzen 3900X) that manages everything
- **Worker Nodes** = Your other servers (Ryzen 6900HS, Intel i7) that run customer services
- **Pods** = Customer services like N8N, Ghost, WordPress

## 🛠️ What We'll Build Locally

We'll create a **miniature version** of your production setup on your Mac:

```
Your Mac (Local Development)
├── k3d Master Node (simulates Ryzen 3900X)
├── k3d Worker Node 1 (simulates Ryzen 6900HS)
├── k3d Worker Node 2 (simulates Intel i7)
└── Your PaaS Backend API (connects to all nodes)
```

## 📋 Prerequisites

### What You Need Installed

1. **Homebrew** (Mac package manager)
2. **Docker Desktop** (to run containers)
3. **Node.js 18+** (for your backend)
4. **PostgreSQL** (your database)

### Check What You Have

Open Terminal and run these commands:

```bash
# Check if Homebrew is installed
brew --version
# If not installed: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Check if Docker is installed
docker --version
# If not installed: Download from https://www.docker.com/products/docker-desktop

# Check if Node.js is installed
node --version
# If not installed: brew install node

# Check if PostgreSQL is installed
psql --version
# If not installed: brew install postgresql
```

## 🚀 Step 1: Install Required Tools

### Install k3d (Kubernetes in Docker)

```bash
# Install k3d - this runs Kubernetes in Docker containers
brew install k3d

# Verify installation
k3d version
```

### Install kubectl (Kubernetes Command Tool)

```bash
# Install kubectl - this is how you talk to Kubernetes
brew install kubectl

# Verify installation
kubectl version --client
```

### Install jq (JSON processor - helpful for testing)

```bash
# Install jq - helps read JSON responses
brew install jq

# Verify installation
jq --version
```

## 🏗️ Step 2: Create Your Local Kubernetes Cluster

### Understanding the Command

We'll create a cluster that simulates your production setup:

```bash
k3d cluster create paas-dev \
  --servers 1 \
  --agents 2 \
  --port "9080:80@loadbalancer" \
  --port "9443:443@loadbalancer"
```

**What this means:**

- `paas-dev` = Name of your cluster
- `--servers 1` = 1 master node (like your Ryzen 3900X)
- `--agents 2` = 2 worker nodes (like your Ryzen 6900HS + Intel i7)
- `--port` = Expose ports so you can access services

### Create the Cluster

```bash
# Create your local Kubernetes cluster
k3d cluster create paas-dev \
  --servers 1 \
  --agents 2 \
  --port "9080:80@loadbalancer" \
  --port "9443:443@loadbalancer"

# This will take 1-2 minutes to download and start
```

### Verify Your Cluster

```bash
# Check if cluster is running
k3d cluster list

# Check if nodes are ready
kubectl get nodes

# You should see something like:
# NAME                     STATUS   ROLES                  AGE   VERSION
# k3d-paas-dev-server-0    Ready    control-plane,master   1m    v1.27.4+k3s1
# k3d-paas-dev-agent-0     Ready    <none>                 1m    v1.27.4+k3s1
# k3d-paas-dev-agent-1     Ready    <none>                 1m    v1.27.4+k3s1
```

**🎉 Congratulations!** You now have a 3-node Kubernetes cluster running on your Mac!

## 🔍 Step 3: Understanding Your Cluster

### What Just Happened?

k3d created 3 Docker containers on your Mac:

1. **k3d-paas-dev-server-0** = Master node (manages the cluster)
2. **k3d-paas-dev-agent-0** = Worker node 1 (runs customer services)
3. **k3d-paas-dev-agent-1** = Worker node 2 (runs customer services)

### Explore Your Cluster

```bash
# Get detailed information about nodes
kubectl get nodes -o wide

# Describe a specific node (lots of details)
kubectl describe node k3d-paas-dev-agent-0

# See all running containers (pods) in the cluster
kubectl get pods --all-namespaces
```

### Understanding the Output

When you run `kubectl get nodes -o wide`, you'll see:

- **NAME** = Node identifier
- **STATUS** = Ready means the node is working
- **ROLES** = control-plane/master vs worker
- **AGE** = How long the node has been running
- **VERSION** = Kubernetes version
- **INTERNAL-IP** = IP address inside the cluster
- **EXTERNAL-IP** = IP address from outside (usually none for local)

## 🔧 Step 4: Connect Your PaaS Backend

### Update Your Environment Variables

Create or update your `.env` file:

```bash
# .env for local development
NODE_ENV=development
PORT=3000

# Database (your existing PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/paas_db"

# Kubernetes configuration (k3d sets this up automatically)
K3S_MASTER_URL=https://0.0.0.0:6443
WORKER_REGISTRATION_TOKEN=test-local-token
HEARTBEAT_TIMEOUT_MINUTES=2

# JWT secrets (for testing)
JWT_SECRET=your-local-jwt-secret
JWT_REFRESH_SECRET=your-local-refresh-secret
```

### Test Kubernetes Connection

Create a simple test file to verify your backend can connect to Kubernetes:

```javascript
// test-k8s-connection.js
import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromDefault(); // k3d automatically configures this

const k8sApi = kc.makeApiClient(CoreV1Api);

async function testConnection() {
  try {
    console.log("Testing Kubernetes connection...");

    const nodes = await k8sApi.listNode();
    console.log("✅ Connected to Kubernetes!");
    console.log(`Found ${nodes.body.items.length} nodes:`);

    nodes.body.items.forEach((node) => {
      console.log(
        `  - ${node.metadata.name} (${
          node.status.conditions.find((c) => c.type === "Ready")?.status
        })`
      );
    });
  } catch (error) {
    console.error("❌ Failed to connect to Kubernetes:", error.message);
  }
}

testConnection();
```

Run the test:

```bash
# Install Kubernetes client if not already installed
npm install @kubernetes/client-node

# Run the test
node test-k8s-connection.js
```

## 🧪 Step 5: Test Your Worker Management System

### Start Your Backend

```bash
# Make sure your database is running
brew services start postgresql

# Start your PaaS backend
npm run dev
```

### Auto-Register K3d Workers

Instead of manual registration, let's create an **automatic registration system** that detects your k3d nodes and registers them automatically.

#### Create Auto-Registration Script

Create a file called `auto-register-workers.js` in your project root:

```javascript
#!/usr/bin/env node

/**
 * Auto-registration script for k3d worker nodes
 * This simulates how real worker nodes would auto-register with your PaaS backend
 */

import { KubeConfig, CoreV1Api } from "@kubernetes/client-node";
import axios from "axios";

// Configuration
const BACKEND_URL = "http://localhost:3000/api/v1";
const REGISTRATION_TOKEN = "test-local-token"; // From your .env
const ADMIN_TOKEN = "your-admin-jwt-token"; // You'll need to get this from login

async function autoRegisterWorkers() {
  try {
    console.log("🚀 Starting auto-registration of k3d workers...");

    // 1. Connect to Kubernetes
    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(CoreV1Api);

    // 2. Get all nodes from k3d cluster
    const nodesResponse = await k8sApi.listNode();
    const nodes = nodesResponse.body.items;

    console.log(`📋 Found ${nodes.length} nodes in k3d cluster`);

    // 3. Filter worker nodes (exclude master)
    const workerNodes = nodes.filter(
      (node) =>
        !node.metadata.labels["node-role.kubernetes.io/control-plane"] &&
        !node.metadata.labels["node-role.kubernetes.io/master"]
    );

    console.log(`👷 Found ${workerNodes.length} worker nodes to register`);

    // 4. Register each worker node
    for (const node of workerNodes) {
      await registerWorkerNode(node);
    }

    console.log("✅ Auto-registration completed!");
  } catch (error) {
    console.error("❌ Auto-registration failed:", error.message);
    process.exit(1);
  }
}

async function registerWorkerNode(node) {
  try {
    const nodeName = node.metadata.name;
    console.log(`📝 Registering worker: ${nodeName}`);

    // Extract node information
    const nodeInfo = {
      hostname: nodeName,
      ipAddress: getNodeIP(node),
      cpuCores: parseInt(node.status.capacity.cpu),
      cpuArchitecture: node.status.nodeInfo.architecture,
      totalMemory: node.status.capacity.memory,
      totalStorage: node.status.capacity["ephemeral-storage"],
      architecture: node.status.nodeInfo.architecture,
      operatingSystem: node.status.nodeInfo.osImage,
      kernelVersion: node.status.nodeInfo.kernelVersion,
      kubeletVersion: node.status.nodeInfo.kubeletVersion,
      containerRuntimeVersion: node.status.nodeInfo.containerRuntimeVersion,
      registrationToken: REGISTRATION_TOKEN,
    };

    // Check if worker already exists
    const existingWorker = await checkExistingWorker(nodeName);

    if (existingWorker) {
      console.log(`   ↻ Worker ${nodeName} already registered, updating...`);
      await updateWorkerHeartbeat(existingWorker.id, nodeInfo);
    } else {
      console.log(`   + Registering new worker ${nodeName}...`);
      await registerNewWorker(nodeInfo);
    }

    console.log(`   ✅ Worker ${nodeName} registered successfully`);
  } catch (error) {
    console.error(
      `   ❌ Failed to register ${node.metadata.name}:`,
      error.message
    );
  }
}

function getNodeIP(node) {
  // Try to get internal IP
  const internalIP = node.status.addresses?.find(
    (addr) => addr.type === "InternalIP"
  );
  if (internalIP) return internalIP.address;

  // Fallback to hostname
  const hostname = node.status.addresses?.find(
    (addr) => addr.type === "Hostname"
  );
  return hostname?.address || "unknown";
}

async function checkExistingWorker(hostname) {
  try {
    const response = await axios.get(`${BACKEND_URL}/workers`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      params: { search: hostname },
    });

    const workers = response.data.data.workers || [];
    return workers.find((w) => w.hostname === hostname);
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

async function registerNewWorker(nodeInfo) {
  const response = await axios.post(
    `${BACKEND_URL}/workers/register`,
    nodeInfo,
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  return response.data;
}

async function updateWorkerHeartbeat(workerId, nodeInfo) {
  const heartbeatData = {
    cpuUsage: Math.random() * 100, // Simulate CPU usage
    memoryUsage: Math.random() * 100, // Simulate memory usage
    diskUsage: Math.random() * 100, // Simulate disk usage
    currentPods: Math.floor(Math.random() * 10), // Simulate pod count
  };

  const response = await axios.patch(
    `${BACKEND_URL}/workers/${workerId}/heartbeat`,
    heartbeatData,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
    }
  );

  return response.data;
}

// Run the auto-registration
autoRegisterWorkers();
```

#### Make the Script Executable

````bash
# Make the script executable
chmod +x auto-register-workers.js

# Install required dependencies if not already installed
npm install axios @kubernetes/client-node
## 🤖 Automated Worker Management

### Quick Start Auto-Registration

For the fastest setup, create this all-in-one script:

```bash
# Create setup-auto-workers.sh
cat > setup-auto-workers.sh << 'EOF'
#!/bin/bash

echo "🚀 Setting up automated worker registration..."

# 1. Create the auto-registration script
cat > auto-register-workers.js << 'JSEOF'
#!/usr/bin/env node
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3000/api/v1';
const REGISTRATION_TOKEN = 'test-local-token';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-jwt-token';

async function autoRegisterWorkers() {
  try {
    console.log('🚀 Auto-registering k3d workers...');

    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(CoreV1Api);

    const nodesResponse = await k8sApi.listNode();
    const workerNodes = nodesResponse.body.items.filter(node =>
      !node.metadata.labels['node-role.kubernetes.io/control-plane']
    );

    for (const node of workerNodes) {
      const nodeInfo = {
        hostname: node.metadata.name,
        ipAddress: node.status.addresses?.find(a => a.type === 'InternalIP')?.address || 'unknown',
        cpuCores: parseInt(node.status.capacity.cpu),
        cpuArchitecture: node.status.nodeInfo.architecture,
        totalMemory: node.status.capacity.memory,
        totalStorage: node.status.capacity['ephemeral-storage'],
        architecture: node.status.nodeInfo.architecture,
        operatingSystem: node.status.nodeInfo.osImage,
        registrationToken: REGISTRATION_TOKEN
      };

      try {
        await axios.post(`${BACKEND_URL}/workers/register`, nodeInfo);
        console.log(`✅ Registered: ${node.metadata.name}`);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`↻ Already registered: ${node.metadata.name}`);
        } else {
          console.error(`❌ Failed: ${node.metadata.name}`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('❌ Auto-registration failed:', error.message);
  }
}

autoRegisterWorkers();
JSEOF

chmod +x auto-register-workers.js

echo "✅ Auto-registration script created!"
echo ""
echo "Next steps:"
echo "1. Get admin token: curl -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"admin@test.com\",\"password\":\"admin123\"}'"
echo "2. Set token: export ADMIN_TOKEN='your-token-here'"
echo "3. Run: node auto-register-workers.js"
EOF

chmod +x setup-auto-workers.sh
./setup-auto-workers.sh
````

### Complete Automated Workflow

```bash
# 1. Start cluster and backend
k3d cluster create paas-dev --servers 1 --agents 2 --port "9080:80@loadbalancer" --port "9443:443@loadbalancer"
npm run dev

# 2. Setup admin user and get token
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin123","role":"ADMINISTRATOR"}'

TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}' | jq -r '.data.accessToken')

# 3. Auto-register workers
export ADMIN_TOKEN="$TOKEN"
node auto-register-workers.js

# 4. Verify registration
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/workers | jq '.data.workers[] | {name, status, hostname}'
```

### One-Command Setup

For ultimate convenience, create a single command that does everything:

```bash
# Create complete-setup.sh
cat > complete-setup.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Complete PaaS Local Development Setup"
echo "======================================"

# 1. Create k3d cluster
echo "📦 Creating k3d cluster..."
k3d cluster delete paas-dev 2>/dev/null || true
k3d cluster create paas-dev --servers 1 --agents 2 --port "9080:80@loadbalancer" --port "9443:443@loadbalancer"

# 2. Wait for cluster to be ready
echo "⏳ Waiting for cluster to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=60s

# 3. Start backend in background
echo "🔧 Starting PaaS backend..."
npm run dev &
BACKEND_PID=$!

# 4. Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 10

# 5. Create admin user
echo "👤 Creating admin user..."
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin123","role":"ADMINISTRATOR"}' > /dev/null

# 6. Get admin token
echo "🔑 Getting admin token..."
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}' | jq -r '.data.accessToken')

# 7. Create and run auto-registration
echo "🤖 Auto-registering workers..."
export ADMIN_TOKEN="$TOKEN"

cat > temp-auto-register.js << 'JSEOF'
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3000/api/v1';
const REGISTRATION_TOKEN = 'test-local-token';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

async function autoRegisterWorkers() {
  try {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(CoreV1Api);

    const nodesResponse = await k8sApi.listNode();
    const workerNodes = nodesResponse.body.items.filter(node =>
      !node.metadata.labels['node-role.kubernetes.io/control-plane']
    );

    for (const node of workerNodes) {
      const nodeInfo = {
        hostname: node.metadata.name,
        ipAddress: node.status.addresses?.find(a => a.type === 'InternalIP')?.address || 'unknown',
        cpuCores: parseInt(node.status.capacity.cpu),
        cpuArchitecture: node.status.nodeInfo.architecture,
        totalMemory: node.status.capacity.memory,
        totalStorage: node.status.capacity['ephemeral-storage'],
        architecture: node.status.nodeInfo.architecture,
        operatingSystem: node.status.nodeInfo.osImage,
        registrationToken: REGISTRATION_TOKEN
      };

      try {
        await axios.post(`${BACKEND_URL}/workers/register`, nodeInfo);
        console.log(`✅ Registered: ${node.metadata.name}`);
      } catch (error) {
        console.log(`↻ Already registered: ${node.metadata.name}`);
      }
    }
  } catch (error) {
    console.error('❌ Auto-registration failed:', error.message);
  }
}

autoRegisterWorkers();
JSEOF

node temp-auto-register.js
rm temp-auto-register.js

# 8. Show results
echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo "✅ k3d cluster running with 2 worker nodes"
echo "✅ PaaS backend running on http://localhost:3000"
echo "✅ Admin user created (admin@test.com / admin123)"
echo "✅ Workers auto-registered"
echo ""
echo "🔍 Verify setup:"
echo "curl -H \"Authorization: Bearer $TOKEN\" http://localhost:3000/api/v1/workers | jq '.data.workers[] | {name, status}'"
echo ""
echo "🛑 To stop:"
echo "kill $BACKEND_PID"
echo "k3d cluster delete paas-dev"

EOF

chmod +x complete-setup.sh
```

Now you can set up everything with just:

```bash
./complete-setup.sh
```

This will:

1. ✅ Create k3d cluster with 2 workers
2. ✅ Start your PaaS backend
3. ✅ Create admin user automatically
4. ✅ Auto-register all k3d workers
5. ✅ Show verification commands

**Perfect for zero-knowledge users!** 🎯

````

#### Get Admin Token for Testing

First, you need to get an admin token:

```bash
# 1. Register an admin user (if not already done)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@test.com",
    "password": "admin123",
    "role": "ADMINISTRATOR"
  }'

# 2. Login to get token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "admin123"
  }'

# Copy the "accessToken" from the response
````

#### Update the Script with Your Token

Edit `auto-register-workers.js` and replace `your-admin-jwt-token` with the actual token you got from login.

#### Run Auto-Registration

```bash
# Run the auto-registration script
node auto-register-workers.js
```

**Expected Output:**

```
🚀 Starting auto-registration of k3d workers...
📋 Found 3 nodes in k3d cluster
👷 Found 2 worker nodes to register
📝 Registering worker: k3d-paas-dev-agent-0
   + Registering new worker k3d-paas-dev-agent-0...
   ✅ Worker k3d-paas-dev-agent-0 registered successfully
📝 Registering worker: k3d-paas-dev-agent-1
   + Registering new worker k3d-paas-dev-agent-1...
   ✅ Worker k3d-paas-dev-agent-1 registered successfully
✅ Auto-registration completed!
```

#### Verify Auto-Registration

```bash
# Check registered workers
curl -X GET http://localhost:3000/api/v1/workers \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# You should see both k3d worker nodes registered automatically!
```

### Test Heartbeat System

```bash
# Send a heartbeat (simulating worker reporting status)
curl -X PATCH http://localhost:3000/api/v1/workers/WORKER_ID/heartbeat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "cpuUsage": 45.2,
    "memoryUsage": 67.8,
    "diskUsage": 23.1,
    "currentPods": 2
  }'
```

## 🎮 Step 6: Deploy Test Applications

### Deploy a Simple Application

Let's deploy a test application to see how pods work:

```bash
# Deploy nginx (a simple web server)
kubectl create deployment test-nginx --image=nginx --replicas=2

# Check if pods are running
kubectl get pods

# See which worker nodes the pods are running on
kubectl get pods -o wide
```

### Expose the Application

```bash
# Create a service to access the application
kubectl expose deployment test-nginx --port=80 --type=ClusterIP

# Check the service
kubectl get services

# Test the application (from inside the cluster)
kubectl run test-pod --image=busybox --rm -it --restart=Never -- wget -qO- test-nginx
```

### Access from Your Mac

```bash
# Forward port to access from your Mac
kubectl port-forward deployment/test-nginx 9090:80

# Open another terminal and test
curl http://localhost:9090
# You should see nginx welcome page HTML
```

## 🔄 Step 7: Simulate Production Scenarios

### Test Worker Node Failure

```bash
# Stop one worker node (simulating hardware failure)
docker stop k3d-paas-dev-agent-0

# Check cluster status
kubectl get nodes
# You'll see one node as "NotReady"

# Check if pods moved to the healthy node
kubectl get pods -o wide

# Restart the "failed" node
docker start k3d-paas-dev-agent-0

# Wait a moment and check status
kubectl get nodes
# Node should become "Ready" again
```

### Test Pod Scheduling

```bash
# Scale up your test application
kubectl scale deployment test-nginx --replicas=4

# See how pods are distributed across workers
kubectl get pods -o wide

# You should see pods spread across both worker nodes
```

## 📊 Step 8: Monitor Your Cluster

### Basic Monitoring Commands

```bash
# See resource usage of nodes
kubectl top nodes
# (Note: This might not work in k3d without metrics-server)

# See all resources in the cluster
kubectl get all --all-namespaces

# Watch pods in real-time (press Ctrl+C to stop)
kubectl get pods --watch

# Get cluster information
kubectl cluster-info

# See events (helpful for troubleshooting)
kubectl get events --sort-by=.metadata.creationTimestamp
```

### Advanced Monitoring

```bash
# Get detailed node information in JSON format
kubectl get nodes -o json | jq '.items[].status.conditions'

# Check node capacity and allocatable resources
kubectl describe nodes | grep -A 5 "Capacity:\|Allocatable:"

# See what's running on each node
kubectl get pods --all-namespaces -o wide --sort-by=.spec.nodeName
```

## 🧹 Step 9: Clean Up and Management

### Stop Your Cluster (Keep Data)

```bash
# Stop the cluster (keeps data)
k3d cluster stop paas-dev

# Start it again later
k3d cluster start paas-dev
```

### Delete Your Cluster (Remove Everything)

```bash
# Delete the entire cluster
k3d cluster delete paas-dev

# Create a new one when needed
k3d cluster create paas-dev --servers 1 --agents 2 --port "9080:80@loadbalancer" --port "9443:443@loadbalancer"
```

### List All Clusters

```bash
# See all k3d clusters
k3d cluster list

# See all kubectl contexts
kubectl config get-contexts
```

## 🚨 Troubleshooting Guide

### Problem: "kubectl: command not found"

**Solution:**

```bash
brew install kubectl
```

### Problem: "k3d: command not found"

**Solution:**

```bash
brew install k3d
```

### Problem: "Cannot connect to the Docker daemon"

**Solution:**

1. Open Docker Desktop application
2. Wait for it to start completely
3. Try again

### Problem: "No nodes found"

**Solution:**

```bash
# Check if cluster exists
k3d cluster list

# If no cluster, create one
k3d cluster create paas-dev --servers 1 --agents 2 --port "9080:80@loadbalancer" --port "9443:443@loadbalancer"

# If cluster exists but stopped, start it
k3d cluster start paas-dev
```

### Problem: "Connection refused" when testing backend

**Solution:**

```bash
# Check if your backend is running
curl http://localhost:3000/health

# Check if PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL if needed
brew services start postgresql
```

### Problem: Pods stuck in "Pending" state

**Solution:**

```bash
# Check what's wrong
kubectl describe pod POD_NAME

# Usually means not enough resources or node issues
# Check node status
kubectl get nodes

# Check node resources
kubectl describe nodes
```

### Problem: "Error from server (Forbidden)"

**Solution:**

```bash
# Check your kubectl context
kubectl config current-context

# Should show: k3d-paas-dev
# If not, switch to it
kubectl config use-context k3d-paas-dev
```

## 🎯 Testing Scenarios

### Scenario 1: Auto Worker Registration

```bash
# 1. Start with clean cluster
k3d cluster delete paas-dev
k3d cluster create paas-dev --servers 1 --agents 2 --port "9080:80@loadbalancer" --port "9443:443@loadbalancer"

# 2. Start your backend
npm run dev

# 3. Get admin token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "admin123"}'

# 4. Update auto-register-workers.js with the token

# 5. Run auto-registration
node auto-register-workers.js

# 6. Verify workers are registered
curl -X GET http://localhost:3000/api/v1/workers \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Scenario 2: Continuous Auto-Registration with Heartbeat

Create a continuous monitoring script that simulates real worker behavior:

```bash
# Create continuous-monitor.js
cat > continuous-monitor.js << 'EOF'
#!/usr/bin/env node

import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3000/api/v1';
const ADMIN_TOKEN = 'your-admin-jwt-token'; // Update this
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

async function continuousMonitoring() {
  console.log('🔄 Starting continuous worker monitoring...');

  setInterval(async () => {
    try {
      // 1. Get k3d nodes
      const kc = new KubeConfig();
      kc.loadFromDefault();
      const k8sApi = kc.makeApiClient(CoreV1Api);
      const nodesResponse = await k8sApi.listNode();

      // 2. Get registered workers from backend
      const workersResponse = await axios.get(`${BACKEND_URL}/workers`, {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
      });

      const registeredWorkers = workersResponse.data.data.workers || [];

      // 3. Send heartbeat for each registered worker
      for (const worker of registeredWorkers) {
        const heartbeatData = {
          cpuUsage: Math.random() * 100,
          memoryUsage: Math.random() * 100,
          diskUsage: Math.random() * 100,
          currentPods: Math.floor(Math.random() * 10)
        };

        try {
          await axios.patch(`${BACKEND_URL}/workers/${worker.id}/heartbeat`, heartbeatData, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ADMIN_TOKEN}`
            }
          });

          console.log(`💓 Heartbeat sent for ${worker.name}`);
        } catch (error) {
          console.error(`❌ Heartbeat failed for ${worker.name}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ Monitoring cycle failed:', error.message);
    }
  }, HEARTBEAT_INTERVAL);
}

continuousMonitoring();
EOF

# Make executable and run
chmod +x continuous-monitor.js
node continuous-monitor.js
```

This script will:

- Send heartbeats every 30 seconds
- Simulate realistic CPU/memory usage
- Keep workers in ACTIVE status
- Show real-time monitoring in your backend

### Scenario 3: Pod Deployment

```bash
# 1. Deploy a test service
kubectl create deployment customer-service --image=nginx

# 2. Check which worker it's running on
kubectl get pods -o wide

# 3. Test your pod management APIs
curl -X GET http://localhost:3000/api/v1/pods \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📈 Next Steps

Once you're comfortable with this local setup:

1. **Integrate with Your Backend**: Connect your worker management APIs to the real k3d nodes
2. **Test Service Deployment**: Deploy actual customer services (N8N, Ghost) to your local cluster
3. **Test Scaling**: Add more worker nodes and test pod distribution
4. **Test Failure Scenarios**: Simulate various failure modes
5. **Performance Testing**: Test with multiple services running

## 🎓 Key Concepts You've Learned

- **Kubernetes Cluster**: A group of machines working together
- **Master Node**: The brain that makes decisions
- **Worker Nodes**: The muscle that runs applications
- **Pods**: The smallest unit that runs your applications
- **Services**: How applications communicate with each other
- **kubectl**: The command-line tool to control Kubernetes
- **k3d**: A way to run Kubernetes locally in Docker

## 📚 Useful Commands Reference

```bash
# Cluster Management
k3d cluster create NAME --servers 1 --agents 2
k3d cluster start NAME
k3d cluster stop NAME
k3d cluster delete NAME
k3d cluster list

# Node Management
kubectl get nodes
kubectl describe node NODE_NAME
kubectl get nodes -o wide

# Pod Management
kubectl get pods
kubectl get pods -o wide
kubectl describe pod POD_NAME
kubectl logs POD_NAME

# Deployment Management
kubectl create deployment NAME --image=IMAGE
kubectl get deployments
kubectl scale deployment NAME --replicas=N
kubectl delete deployment NAME

# Service Management
kubectl expose deployment NAME --port=PORT
kubectl get services
kubectl port-forward deployment/NAME LOCAL_PORT:REMOTE_PORT

# Debugging
kubectl get events
kubectl cluster-info
kubectl config current-context
```

This guide gives you everything you need to start developing your PaaS backend with a local Kubernetes environment. Take it step by step, and don't hesitate to experiment!
