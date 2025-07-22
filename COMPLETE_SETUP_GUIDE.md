# Complete Guide: k3d Master + Ubuntu Worker dengan Perfect Heartbeat

## 🎯 Overview

Panduan lengkap untuk setup PaaS cluster dengan k3d master di Mac dan Ubuntu worker server dengan heartbeat monitoring yang sempurna.

## 📋 Prerequisites

- **Mac**: Development machine dengan Tailscale
- **Ubuntu Server**: Physical server dengan Tailscale
- **Network**: Kedua server terhubung via Tailscale

---

## PART 1: SETUP k3d MASTER DI MAC

### Step 1.1: Install Prerequisites di Mac

```bash
# Install Homebrew (jika belum ada)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install k3d dan kubectl
brew install k3d kubectl

# Install Docker Desktop dari https://www.docker.com/products/docker-desktop

# Verify installations
k3d version
kubectl version --client
docker --version
```

### Step 1.2: Get Mac Tailscale IP

```bash
# Get Mac Tailscale IP
tailscale ip -4

# Catat IP ini, contoh: 100.90.149.26
# Kita sebut MAC_TAILSCALE_IP
```

### Step 1.3: Create k3d Cluster dengan External Access

```bash
# Ganti 100.90.149.26 dengan MAC_TAILSCALE_IP Anda
k3d cluster create paas-dev \
  --servers 1 \
  --agents 1 \
  --port "6443:6443@server:0" \
  --port "9080:80@loadbalancer" \
  --port "9443:443@loadbalancer" \
  --k3s-arg "--tls-san=0.0.0.0@server:0" \
  --k3s-arg "--tls-san=100.90.149.26@server:0" \
  --k3s-arg "--bind-address=0.0.0.0@server:0" \
  --k3s-arg "--advertise-address=100.90.149.26@server:0"

# Wait for cluster to be ready
kubectl wait --for=condition=Ready nodes --all --timeout=120s

# Verify cluster
kubectl get nodes -o wide
```

### Step 1.4: Get Node Token

```bash
# Get k3d server container name
K3D_SERVER=$(docker ps --format "table {{.Names}}" | grep k3d-paas-dev-server | head -1)

# Extract node token
NODE_TOKEN=$(docker exec $K3D_SERVER cat /var/lib/rancher/k3s/server/node-token)
echo "Node Token: $NODE_TOKEN"

# Catat token ini untuk Ubuntu server
```

### Step 1.5: Setup PaaS Backend

```bash
# Start PaaS backend (pastikan sudah running)
npm run dev

# Verify backend running
curl http://localhost:3000/health
```

---

## PART 2: SETUP UBUNTU WORKER SERVER

### Step 2.1: Connect to Ubuntu Server

```bash
# SSH ke Ubuntu server
ssh username@100.107.230.95
```

### Step 2.2: Install Prerequisites di Ubuntu

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop nano bc lm-sensors

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker
docker --version
docker run hello-world
```

### Step 2.3: Join Ubuntu Server to k3d Cluster

```bash
# Ganti dengan MAC_TAILSCALE_IP dan NODE_TOKEN dari Mac
curl -sfL https://get.k3s.io | \
  K3S_URL=https://100.90.149.26:6443 \
  K3S_TOKEN=K102f9da2f7a2c06f6e642540ceefc6fd2a72e59a339b6304399a68dd2877788709::server:OsaYxMcYrvHUmfBTKkTZ \
  K3S_NODE_NAME=$(hostname) \
  sh -

# Verify k3s agent running
sudo systemctl status k3s-agent
```

### Step 2.4: Verify Cluster Join (dari Mac)

```bash
# Di Mac, cek apakah Ubuntu server sudah join
kubectl get nodes -o wide

# Harus muncul 3 nodes:
# k3d-paas-dev-server-0    Ready    control-plane,master
# k3d-paas-dev-agent-0     Ready    <none>
# ubuntu-hostname          Ready    <none>
```

---

## PART 3: REGISTER WORKER KE PAAS BACKEND

### Step 3.1: Register Worker di Ubuntu Server

```bash
# Di Ubuntu server, registrasi ke PaaS backend
curl -X POST "http://100.90.149.26:3000/api/v1/workers/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$(hostname)\",
    \"hostname\": \"$(hostname)\",
    \"ipAddress\": \"$(hostname -I | awk '{print $1}')\",
    \"cpuCores\": $(nproc),
    \"cpuArchitecture\": \"$(uname -p)\",
    \"totalMemory\": \"$(free -m | awk 'NR==2{printf \"%d\", \$2}')Mi\",
    \"totalStorage\": \"$(df / | tail -1 | awk '{printf \"%.0f\", \$2/1024/1024}')Gi\",
    \"architecture\": \"amd64\",
    \"operatingSystem\": \"Ubuntu Server\",
    \"kernelVersion\": \"$(uname -r)\",
    \"kubeletVersion\": \"v1.31.5+k3s1\",
    \"containerRuntimeVersion\": \"docker://$(docker --version | cut -d' ' -f3 | cut -d',' -f1)\"
  }"

# Expected response: {"success":true,"message":"Worker node information updated successfully"...}
```

### Step 3.2: Verify Registration (dari Mac)

```bash
# Di Mac, cek worker registration
curl -s http://localhost:3000/api/v1/workers | jq '.data.workers[] | {name: .hostname, status}'
```

---

## PART 4: SETUP PERFECT HEARTBEAT MONITORING

### Step 4.1: Create Heartbeat Script di Ubuntu

```bash
# Di Ubuntu server, buat heartbeat script
cat > ~/heartbeat-agent.sh << 'EOF'
#!/bin/bash

PAAS_BACKEND_URL="http://100.90.149.26:3000/api/v1"
NODE_NAME=$(hostname)
HEARTBEAT_INTERVAL=30

echo "💓 Starting heartbeat for $NODE_NAME"

get_metrics() {
    # CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | tr -d ' ')
    if [ -z "$CPU_USAGE" ]; then CPU_USAGE="10"; fi

    # Memory usage
    MEMORY_INFO=$(free -m)
    TOTAL_MEM=$(echo "$MEMORY_INFO" | awk 'NR==2{print $2}')
    USED_MEM=$(echo "$MEMORY_INFO" | awk 'NR==2{print $3}')
    MEMORY_USAGE=$(echo "scale=1; $USED_MEM * 100 / $TOTAL_MEM" | bc -l 2>/dev/null || echo "20")

    # Disk usage
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    if [ -z "$DISK_USAGE" ]; then DISK_USAGE="30"; fi

    # Pod count - PERFECT: Use crictl without sudo (service runs as root)
    POD_COUNT="0"
    if command -v crictl &> /dev/null; then
        POD_COUNT=$(crictl pods | grep -v "POD ID" | wc -l 2>/dev/null || echo "0")
    fi

    # Ensure POD_COUNT is a valid number
    if ! [[ "$POD_COUNT" =~ ^[0-9]+$ ]]; then
        POD_COUNT="0"
    fi

    # Allocated resources
    ALLOCATED_CPU=$(echo "scale=2; $CPU_USAGE / 100 * $(nproc)" | bc -l 2>/dev/null || echo "0.5")
    ALLOCATED_MEMORY="$USED_MEM"

    echo "$CPU_USAGE,$MEMORY_USAGE,$DISK_USAGE,$POD_COUNT,$ALLOCATED_CPU,$ALLOCATED_MEMORY"
}

send_heartbeat() {
    METRICS=$(get_metrics)
    IFS=',' read -r CPU_USAGE MEMORY_USAGE DISK_USAGE POD_COUNT ALLOCATED_CPU ALLOCATED_MEMORY <<< "$METRICS"

    # Debug: Print values before sending
    echo "[DEBUG] CPU: $CPU_USAGE, Mem: $MEMORY_USAGE, Disk: $DISK_USAGE, Pods: $POD_COUNT, AllocCPU: $ALLOCATED_CPU, AllocMem: $ALLOCATED_MEMORY"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$PAAS_BACKEND_URL/workers/$NODE_NAME/heartbeat" \
      -H "Content-Type: application/json" \
      --connect-timeout 10 \
      --max-time 30 \
      -d "{
        \"allocatedCPU\": $ALLOCATED_CPU,
        \"allocatedMemory\": $ALLOCATED_MEMORY,
        \"currentPods\": $POD_COUNT,
        \"status\": \"ACTIVE\",
        \"isReady\": true
      }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
        echo "[$(date '+%H:%M:%S')] 💓 Heartbeat OK - CPU: ${CPU_USAGE}%, Mem: ${MEMORY_USAGE}%, Pods: $POD_COUNT"
    else
        echo "[$(date '+%H:%M:%S')] ❌ Heartbeat failed - HTTP $HTTP_CODE"
        echo "[DEBUG] Response: $BODY"
    fi
}

# Graceful shutdown
cleanup() {
    echo ""
    echo "[$(date '+%H:%M:%S')] 🛑 Stopping heartbeat agent..."
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main loop
echo "[$(date '+%H:%M:%S')] 🚀 Heartbeat agent started"

while true; do
    send_heartbeat
    sleep $HEARTBEAT_INTERVAL
done
EOF

# Make executable
chmod +x ~/heartbeat-agent.sh

# IMPORTANT: Update PAAS_BACKEND_URL dengan MAC_TAILSCALE_IP Anda
nano ~/heartbeat-agent.sh
```

### Step 4.2: Create Systemd Service

```bash
# Di Ubuntu server, buat systemd service
sudo tee /etc/systemd/system/paas-heartbeat.service > /dev/null << EOF
[Unit]
Description=PaaS Heartbeat Agent
After=network-online.target k3s-agent.service
Wants=network-online.target
Requires=k3s-agent.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/home/$USER
ExecStart=/home/$USER/heartbeat-agent.sh
Restart=always
RestartSec=10
StartLimitInterval=0

# Resource limits
MemoryLimit=64M
CPUQuota=5%

# Security
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=paas-heartbeat

[Install]
WantedBy=multi-user.target
EOF
```

### Step 4.3: Enable dan Start Heartbeat Service

```bash
# Enable dan start service
sudo systemctl daemon-reload
sudo systemctl enable paas-heartbeat
sudo systemctl start paas-heartbeat

# Verify service running
sudo systemctl status paas-heartbeat

# Monitor heartbeat logs
sudo journalctl -u paas-heartbeat -f
```

---

## PART 5: VERIFICATION & TESTING

### Step 5.1: Verify Cluster Status

```bash
# Di Mac, cek cluster nodes
kubectl get nodes -o wide

# Expected output:
# NAME                     STATUS   ROLES                  AGE   VERSION
# k3d-paas-dev-server-0    Ready    control-plane,master   10m   v1.31.5+k3s1
# k3d-paas-dev-agent-0     Ready    <none>                 10m   v1.31.5+k3s1
# ubuntu-hostname          Ready    <none>                 5m    v1.31.5+k3s1
```

### Step 5.2: Test Pod Deployment

```bash
# Di Mac, deploy test application
kubectl create deployment test-ubuntu --image=nginx --replicas=1

# Force deployment to Ubuntu server
kubectl patch deployment test-ubuntu -p '{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":"UBUNTU_HOSTNAME"}}}}}'

# Verify pod running on Ubuntu server
kubectl get pods -o wide
```

### Step 5.3: Verify Heartbeat

```bash
# Di Ubuntu server, monitor heartbeat logs
sudo journalctl -u paas-heartbeat -f

# Expected output:
# [DEBUG] CPU: 0.3, Mem: 2.8, Disk: 8, Pods: 2, AllocCPU: 0, AllocMem: 448
# [15:53:49] 💓 Heartbeat OK - CPU: 0.3%, Mem: 2.8%, Pods: 2
```

### Step 5.4: Verify Worker Status in Backend

```bash
# Di Mac, cek worker status
curl -s http://localhost:3000/api/v1/workers | jq '.data.workers[] | {name: .hostname, status, lastHeartbeat, pods: .currentPods}'
```

---

## PART 6: TROUBLESHOOTING

### Common Issues & Solutions

#### Issue 1: Ubuntu tidak bisa join cluster

```bash
# Test koneksi dari Ubuntu ke Mac
curl -k https://MAC_TAILSCALE_IP:6443/version

# Cek k3s agent logs
sudo journalctl -u k3s-agent -f

# Restart k3s agent
sudo systemctl restart k3s-agent
```

#### Issue 2: Heartbeat gagal (HTTP 400/500)

```bash
# Test manual heartbeat
curl -v -X PUT "http://MAC_TAILSCALE_IP:3000/api/v1/workers/HOSTNAME/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"allocatedCPU": 0.5, "allocatedMemory": 1024, "currentPods": 1, "status": "ACTIVE", "isReady": true}'

# Cek PaaS backend logs
# Di Mac: npm run dev
```

#### Issue 3: Pod count = 0

```bash
# Test crictl manual
sudo crictl pods
sudo crictl pods | grep -v "POD ID" | wc -l

# Cek service permissions
sudo systemctl status paas-heartbeat
```

#### Issue 4: Service tidak start

```bash
# Cek service logs
sudo journalctl -u paas-heartbeat -n 20

# Cek script permissions
ls -la ~/heartbeat-agent.sh
chmod +x ~/heartbeat-agent.sh
```

---

## PART 7: EXPECTED RESULTS

### Perfect Setup Results:

1. **Cluster Nodes**: 3 nodes (1 master + 2 workers)
2. **Worker Registration**: Status ACTIVE di PaaS backend
3. **Heartbeat Success**: HTTP 200 setiap 30 detik
4. **Pod Counting**: Accurate pod count (2+ pods)
5. **Real Metrics**: CPU, Memory, Disk usage real-time

### Sample Perfect Heartbeat Log:

```
💓 Starting heartbeat for i6700
[15:53:36] 🚀 Heartbeat agent started
[DEBUG] CPU: 0.3, Mem: 2.8, Disk: 8, Pods: 2, AllocCPU: 0, AllocMem: 448
[15:53:49] 💓 Heartbeat OK - CPU: 0.3%, Mem: 2.8%, Pods: 2
```

### Sample kubectl get nodes:

```
NAME                     STATUS   ROLES                  AGE   VERSION
k3d-paas-dev-server-0    Ready    control-plane,master   15m   v1.31.5+k3s1
k3d-paas-dev-agent-0     Ready    <none>                 15m   v1.31.5+k3s1
i6700                    Ready    <none>                 10m   v1.31.5+k3s1
```

---

## 🎉 SUCCESS!

Setelah mengikuti panduan ini, Anda akan memiliki:

- ✅ **Hybrid Kubernetes Cluster**: k3d master + real Ubuntu worker
- ✅ **Perfect Heartbeat Monitoring**: Real-time metrics dengan pod counting
- ✅ **Production-Ready Setup**: Systemd service dengan auto-restart
- ✅ **Complete Integration**: PaaS backend dengan worker management
- ✅ **Ready for Production**: Deploy customer workloads ke real hardware

**Setup PaaS dengan real worker node COMPLETE!** 🚀
