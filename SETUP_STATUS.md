# Setup Status - k3d Cluster Ready

## ✅ Status Saat Ini

**k3d Cluster:** ✅ BERHASIL DIBUAT
**Mac Tailscale IP:** `100.90.149.26`
**Ubuntu Server IP:** `100.107.230.95`
**Node Token:** `K102f9da2f7a2c06f6e642540ceefc6fd2a72e59a339b6304399a68dd2877788709::server:OsaYxMcYrvHUmfBTKkTZ`

### Cluster Nodes Saat Ini:

```
NAME                    STATUS   ROLES                  AGE    VERSION
k3d-paas-dev-agent-0    Ready    <none>                 2m7s   v1.31.5+k3s1
k3d-paas-dev-server-0   Ready    control-plane,master   2m9s   v1.31.5+k3s1
```

---

## 🚀 LANGKAH SELANJUTNYA: Hubungkan Ubuntu Server

### 1. SSH ke Ubuntu Server

```bash
ssh username@100.107.230.95
```

### 2. Install Prerequisites di Ubuntu

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install tools dasar
sudo apt install -y curl wget git htop nano bc lm-sensors

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Test Docker
docker --version
```

### 3. Join Ubuntu ke k3d Cluster

```bash
# Jalankan command ini di Ubuntu server
curl -sfL https://get.k3s.io | \
  K3S_URL=https://100.90.149.26:6443 \
  K3S_TOKEN=K102f9da2f7a2c06f6e642540ceefc6fd2a72e59a339b6304399a68dd2877788709::server:OsaYxMcYrvHUmfBTKkTZ \
  K3S_NODE_NAME=$(hostname) \
  sh -
```

### 4. Verifikasi Join dari Mac

```bash
# Di Mac, cek apakah Ubuntu sudah join
kubectl get nodes -o wide

# Harus muncul 3 nodes termasuk Ubuntu server
```

### 5. Registrasi Worker ke PaaS Backend

```bash
# Di Ubuntu server, registrasi ke backend (FIXED - quotes diperbaiki)
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
```

### 6. Setup Heartbeat Monitoring

```bash
# Di Ubuntu server, buat script heartbeat
cat > ~/heartbeat-agent.sh << 'EOF'
#!/bin/bash

PAAS_BACKEND_URL="http://100.90.149.26:3000/api/v1"
NODE_NAME=$(hostname)
HEARTBEAT_INTERVAL=30

echo "💓 Starting heartbeat for $NODE_NAME"

get_metrics() {
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | tr -d ' ')
    if [ -z "$CPU_USAGE" ]; then CPU_USAGE=10; fi

    MEMORY_INFO=$(free -m)
    TOTAL_MEM=$(echo "$MEMORY_INFO" | awk 'NR==2{print $2}')
    USED_MEM=$(echo "$MEMORY_INFO" | awk 'NR==2{print $3}')
    MEMORY_USAGE=$(echo "scale=1; $USED_MEM * 100 / $TOTAL_MEM" | bc -l 2>/dev/null || echo "20")

    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    if [ -z "$DISK_USAGE" ]; then DISK_USAGE=30; fi

    POD_COUNT=$(docker ps --filter "name=k8s" --format "table {{.Names}}" 2>/dev/null | wc -l)
    POD_COUNT=$((POD_COUNT - 1))
    if [ $POD_COUNT -lt 0 ]; then POD_COUNT=0; fi

    ALLOCATED_CPU=$(echo "scale=2; $CPU_USAGE / 100 * $(nproc)" | bc -l 2>/dev/null || echo "0.5")
    ALLOCATED_MEMORY=$USED_MEM

    echo "$CPU_USAGE,$MEMORY_USAGE,$DISK_USAGE,$POD_COUNT,$ALLOCATED_CPU,$ALLOCATED_MEMORY"
}

send_heartbeat() {
    METRICS=$(get_metrics)
    IFS=',' read -r CPU_USAGE MEMORY_USAGE DISK_USAGE POD_COUNT ALLOCATED_CPU ALLOCATED_MEMORY <<< "$METRICS"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$PAAS_BACKEND_URL/workers/$NODE_NAME/heartbeat" \
      -H "Content-Type: application/json" \
      --connect-timeout 10 \
      --max-time 30 \
      -d "{
        \"allocatedCPU\": $ALLOCATED_CPU,
        \"allocatedMemory\": $ALLOCATED_MEMORY,
        \"currentPods\": $POD_COUNT,
        \"cpuUsagePercent\": $CPU_USAGE,
        \"memoryUsagePercent\": $MEMORY_USAGE,
        \"status\": \"ACTIVE\",
        \"isReady\": true
      }")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
        echo "[$(date '+%H:%M:%S')] 💓 Heartbeat OK - CPU: ${CPU_USAGE}%, Mem: ${MEMORY_USAGE}%, Pods: $POD_COUNT"
    else
        echo "[$(date '+%H:%M:%S')] ❌ Heartbeat failed - HTTP $HTTP_CODE"
    fi
}

while true; do
    send_heartbeat
    sleep $HEARTBEAT_INTERVAL
done
EOF

# Buat executable
chmod +x ~/heartbeat-agent.sh

# Buat systemd service (FIXED - absolute paths)
sudo tee /etc/systemd/system/paas-heartbeat.service > /dev/null << EOF
[Unit]
Description=PaaS Heartbeat Agent
Documentation=PaaS Worker Heartbeat Monitoring
After=network-online.target k3s-agent.service
Wants=network-online.target
Requires=k3s-agent.service

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=/home/$USER
ExecStart=/home/$USER/heartbeat-agent.sh
Restart=always
RestartSec=10
StartLimitInterval=0

# Resource limits
MemoryLimit=64M
CPUQuota=5%

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=paas-heartbeat

[Install]
WantedBy=multi-user.target
EOF

# Enable dan start service
sudo systemctl daemon-reload
sudo systemctl enable paas-heartbeat
sudo systemctl start paas-heartbeat

# Cek status
sudo systemctl status paas-heartbeat
```

---

## 🔍 Verifikasi Final

### Di Mac:

```bash
# Cek cluster nodes
kubectl get nodes -o wide

# Cek registered workers
curl -s http://localhost:3000/api/v1/workers | jq '.data.workers[] | {name: .hostname, status, lastHeartbeat}'

# Test deployment
kubectl create deployment test-ubuntu --image=nginx --replicas=1
kubectl get pods -o wide
```

### Di Ubuntu:

```bash
# Cek k3s agent status
sudo systemctl status k3s-agent

# Cek heartbeat logs
sudo journalctl -u paas-heartbeat -f
```

---

## 🎯 Expected Results

Setelah semua langkah selesai, Anda harus melihat:

1. **3 nodes di cluster** (termasuk Ubuntu server)
2. **Worker terdaftar** di PaaS backend dengan status ACTIVE
3. **Heartbeat berjalan** setiap 30 detik
4. **Pod bisa deploy** ke Ubuntu server

---

## 🚨 Troubleshooting

### Jika Ubuntu tidak bisa join:

```bash
# Test koneksi dari Ubuntu ke Mac
curl -k https://100.90.149.26:6443/version

# Cek firewall di Mac
sudo lsof -i :6443
```

### Jika registrasi gagal:

```bash
# Pastikan PaaS backend berjalan di Mac
curl http://100.90.149.26:3000/health

# Cek database connection
```

### Jika heartbeat gagal:

```bash
# Test manual heartbeat
~/heartbeat-agent.sh

# Cek log service
sudo journalctl -u paas-heartbeat -n 20
```

**Setup siap dilanjutkan!** 🚀
