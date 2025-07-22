#!/bin/bash
set -e

# Script untuk setup heartbeat monitoring di Ubuntu worker
# Usage: ./ubuntu-setup-heartbeat.sh MAC_TAILSCALE_IP

if [ $# -ne 1 ]; then
    echo "❌ Usage: $0 <MAC_TAILSCALE_IP>"
    echo "Example: $0 100.107.230.50"
    exit 1
fi

MAC_IP=$1
PAAS_BACKEND_URL="http://$MAC_IP:3000/api/v1"
NODE_NAME=$(hostname)
HEARTBEAT_INTERVAL=30

echo "💓 Setup heartbeat monitoring untuk Ubuntu worker"
echo "================================================"
echo "📡 Backend URL: $PAAS_BACKEND_URL"
echo "🏷️  Node Name: $NODE_NAME"
echo "⏱️  Interval: ${HEARTBEAT_INTERVAL} detik"
echo ""

# Test koneksi ke backend
echo "🔍 Testing koneksi ke backend..."
if ! curl -s --connect-timeout 10 $PAAS_BACKEND_URL/health > /dev/null 2>&1; then
    if ! curl -s --connect-timeout 10 http://$MAC_IP:3000 > /dev/null 2>&1; then
        echo "❌ Tidak bisa connect ke backend"
        exit 1
    fi
fi
echo "✅ Koneksi ke backend OK"

# Buat script heartbeat
echo "📝 Membuat script heartbeat..."
cat > ~/heartbeat-agent.sh << EOF
#!/bin/bash

PAAS_BACKEND_URL="$PAAS_BACKEND_URL"
NODE_NAME="$NODE_NAME"
HEARTBEAT_INTERVAL=$HEARTBEAT_INTERVAL

echo "💓 Memulai heartbeat agent untuk \$NODE_NAME"
echo "📡 Backend URL: \$PAAS_BACKEND_URL"
echo "⏱️  Interval: \${HEARTBEAT_INTERVAL} detik"

# Fungsi untuk mendapatkan metrics sistem
get_metrics() {
    # CPU usage
    CPU_USAGE=\$(top -bn1 | grep "Cpu(s)" | awk '{print \$2}' | cut -d'%' -f1 | tr -d ' ')
    if [ -z "\$CPU_USAGE" ]; then CPU_USAGE=10; fi
    
    # Memory usage
    MEMORY_INFO=\$(free -m)
    TOTAL_MEM=\$(echo "\$MEMORY_INFO" | awk 'NR==2{print \$2}')
    USED_MEM=\$(echo "\$MEMORY_INFO" | awk 'NR==2{print \$3}')
    MEMORY_USAGE=\$(echo "scale=1; \$USED_MEM * 100 / \$TOTAL_MEM" | bc -l 2>/dev/null || echo "20")
    
    # Disk usage
    DISK_USAGE=\$(df / | tail -1 | awk '{print \$5}' | cut -d'%' -f1)
    if [ -z "\$DISK_USAGE" ]; then DISK_USAGE=30; fi
    
    # Pod count
    POD_COUNT=\$(docker ps --filter "name=k8s" --format "table {{.Names}}" 2>/dev/null | wc -l)
    POD_COUNT=\$((POD_COUNT - 1))
    if [ \$POD_COUNT -lt 0 ]; then POD_COUNT=0; fi
    
    # Allocated resources
    ALLOCATED_CPU=\$(echo "scale=2; \$CPU_USAGE / 100 * \$(nproc)" | bc -l 2>/dev/null || echo "0.5")
    ALLOCATED_MEMORY=\$USED_MEM
    
    echo "\$CPU_USAGE,\$MEMORY_USAGE,\$DISK_USAGE,\$POD_COUNT,\$ALLOCATED_CPU,\$ALLOCATED_MEMORY"
}

# Fungsi untuk mengirim heartbeat
send_heartbeat() {
    METRICS=\$(get_metrics)
    IFS=',' read -r CPU_USAGE MEMORY_USAGE DISK_USAGE POD_COUNT ALLOCATED_CPU ALLOCATED_MEMORY <<< "\$METRICS"
    
    RESPONSE=\$(curl -s -w "\\n%{http_code}" -X PUT "\$PAAS_BACKEND_URL/workers/\$NODE_NAME/heartbeat" \\
      -H "Content-Type: application/json" \\
      --connect-timeout 10 \\
      --max-time 30 \\
      -d "{
        \\"allocatedCPU\\": \$ALLOCATED_CPU,
        \\"allocatedMemory\\": \$ALLOCATED_MEMORY,
        \\"currentPods\\": \$POD_COUNT,
        \\"cpuUsagePercent\\": \$CPU_USAGE,
        \\"memoryUsagePercent\\": \$MEMORY_USAGE,
        \\"status\\": \\"ACTIVE\\",
        \\"isReady\\": true
      }")
    
    HTTP_CODE=\$(echo "\$RESPONSE" | tail -n1)
    
    if [ "\$HTTP_CODE" -eq 200 ] || [ "\$HTTP_CODE" -eq 204 ]; then
        echo "[\$(date '+%H:%M:%S')] 💓 Heartbeat OK - CPU: \${CPU_USAGE}%, Mem: \${MEMORY_USAGE}%, Pods: \$POD_COUNT"
    else
        echo "[\$(date '+%H:%M:%S')] ❌ Heartbeat gagal - HTTP \$HTTP_CODE"
    fi
}

# Graceful shutdown
cleanup() {
    echo ""
    echo "[\$(date '+%H:%M:%S')] 🛑 Stopping heartbeat agent..."
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main loop
echo "[\$(date '+%H:%M:%S')] 🚀 Heartbeat agent started"

while true; do
    send_heartbeat
    sleep \$HEARTBEAT_INTERVAL
done
EOF

# Buat script executable
chmod +x ~/heartbeat-agent.sh
echo "✅ Script heartbeat dibuat: ~/heartbeat-agent.sh"

# Test heartbeat sekali
echo "🧪 Testing heartbeat..."
timeout 10 ~/heartbeat-agent.sh &
HEARTBEAT_PID=$!
sleep 5
kill $HEARTBEAT_PID 2>/dev/null || true
wait $HEARTBEAT_PID 2>/dev/null || true

# Buat systemd service
echo "⚙️  Membuat systemd service..."
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
WorkingDirectory=$HOME
ExecStart=$HOME/heartbeat-agent.sh
Restart=always
RestartSec=10
StartLimitInterval=0

# Resource limits
MemoryLimit=64M
CPUQuota=5%

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$HOME

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

echo "✅ Systemd service dibuat dan dijalankan"

# Cek status service
sleep 3
if sudo systemctl is-active --quiet paas-heartbeat; then
    echo "✅ Heartbeat service berjalan"
    echo ""
    echo "📋 Status service:"
    sudo systemctl status paas-heartbeat --no-pager -l
    echo ""
    echo "📊 Log heartbeat (Ctrl+C untuk keluar):"
    echo "sudo journalctl -u paas-heartbeat -f"
else
    echo "❌ Heartbeat service gagal start"
    echo "📋 Log error:"
    sudo journalctl -u paas-heartbeat -n 20
    exit 1
fi

echo ""
echo "🎉 Heartbeat monitoring berhasil disetup!"
echo ""
echo "🔧 Useful commands:"
echo "   sudo systemctl status paas-heartbeat    # Cek status"
echo "   sudo journalctl -u paas-heartbeat -f   # Monitor log"
echo "   sudo systemctl restart paas-heartbeat  # Restart service"
echo "   sudo systemctl stop paas-heartbeat     # Stop service"
echo ""
echo "✅ Setup Ubuntu worker selesai!"
echo "🔍 Verifikasi dari Mac: curl -s http://$MAC_IP:3000/api/v1/workers | jq '.data.workers[].hostname'"