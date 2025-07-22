#!/bin/bash
set -e

# Script untuk registrasi Ubuntu worker ke PaaS backend
# Usage: ./ubuntu-register-worker.sh MAC_TAILSCALE_IP

if [ $# -ne 1 ]; then
    echo "❌ Usage: $0 <MAC_TAILSCALE_IP>"
    echo "Example: $0 100.107.230.50"
    exit 1
fi

MAC_IP=$1
PAAS_BACKEND_URL="http://$MAC_IP:3000/api/v1"
REGISTRATION_TOKEN="test-production-token"

echo "🚀 Registrasi Ubuntu worker ke PaaS backend"
echo "==========================================="
echo "📡 Backend URL: $PAAS_BACKEND_URL"
echo ""

# Test koneksi ke backend
echo "🔍 Testing koneksi ke PaaS backend..."
if curl -s --connect-timeout 10 $PAAS_BACKEND_URL/health > /dev/null 2>&1; then
    echo "✅ Koneksi ke backend berhasil"
elif curl -s --connect-timeout 10 http://$MAC_IP:3000 > /dev/null 2>&1; then
    echo "✅ Backend berjalan (endpoint /health mungkin belum ada)"
else
    echo "❌ Tidak bisa connect ke backend"
    echo "💡 Pastikan:"
    echo "   - PaaS backend berjalan di Mac (npm run dev)"
    echo "   - Port 3000 tidak diblokir firewall"
    echo "   - Tailscale berjalan di kedua device"
    exit 1
fi

# Ambil informasi sistem
echo "📋 Mengumpulkan informasi sistem..."
HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')
CPU_CORES=$(nproc)
TOTAL_MEMORY=$(free -m | awk 'NR==2{printf "%d", $2}')
TOTAL_STORAGE=$(df / | tail -1 | awk '{printf "%.0f", $2/1024/1024}')
ARCHITECTURE=$(uname -m)
OS_INFO=$(lsb_release -d | cut -f2 2>/dev/null || echo "Ubuntu Server")
KERNEL_VERSION=$(uname -r)
DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
K3S_VERSION=$(k3s --version 2>/dev/null | head -1 | cut -d' ' -f3 || echo "v1.27.4+k3s1")

echo "   Hostname: $HOSTNAME"
echo "   IP: $IP_ADDRESS"
echo "   CPU Cores: $CPU_CORES"
echo "   Memory: ${TOTAL_MEMORY}MB"
echo "   Storage: ${TOTAL_STORAGE}GB"
echo "   Architecture: $ARCHITECTURE"
echo "   OS: $OS_INFO"
echo ""

# Registrasi ke PaaS backend
echo "📝 Mendaftarkan worker ke backend..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PAAS_BACKEND_URL/workers/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"$HOSTNAME\",
    \"ipAddress\": \"$IP_ADDRESS\",
    \"cpuCores\": $CPU_CORES,
    \"cpuArchitecture\": \"$ARCHITECTURE\",
    \"totalMemory\": \"${TOTAL_MEMORY}Mi\",
    \"totalStorage\": \"${TOTAL_STORAGE}Gi\",
    \"architecture\": \"$ARCHITECTURE\",
    \"operatingSystem\": \"$OS_INFO\",
    \"kernelVersion\": \"$KERNEL_VERSION\",
    \"kubeletVersion\": \"$K3S_VERSION\",
    \"containerRuntimeVersion\": \"docker://$DOCKER_VERSION\",
    \"registrationToken\": \"$REGISTRATION_TOKEN\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Registrasi berhasil!"
    echo "📄 Response: $BODY"
elif [ "$HTTP_CODE" -eq 409 ]; then
    echo "↻ Worker sudah terdaftar sebelumnya"
    echo "📄 Response: $BODY"
else
    echo "❌ Registrasi gagal (HTTP $HTTP_CODE)"
    echo "📄 Response: $BODY"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   - Cek apakah PaaS backend berjalan"
    echo "   - Cek log backend untuk error"
    echo "   - Pastikan database PostgreSQL berjalan"
    exit 1
fi

echo ""
echo "🔧 Next step: Setup heartbeat monitoring"
echo "   ./ubuntu-setup-heartbeat.sh $MAC_IP"