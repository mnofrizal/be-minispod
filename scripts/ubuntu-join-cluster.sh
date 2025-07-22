#!/bin/bash
set -e

# Script untuk menghubungkan Ubuntu server ke k3d cluster
# Usage: ./ubuntu-join-cluster.sh MAC_TAILSCALE_IP NODE_TOKEN

if [ $# -ne 2 ]; then
    echo "❌ Usage: $0 <MAC_TAILSCALE_IP> <NODE_TOKEN>"
    echo "Example: $0 100.107.230.50 K10abc123def456..."
    exit 1
fi

MAC_IP=$1
NODE_TOKEN=$2

echo "🚀 Menghubungkan Ubuntu server ke k3d cluster"
echo "=============================================="
echo "📡 Master IP: $MAC_IP"
echo "🔑 Token: ${NODE_TOKEN:0:20}..."
echo ""

# Update sistem
echo "📦 Updating sistem..."
sudo apt update && sudo apt upgrade -y

# Install tools dasar
echo "🛠️  Installing tools..."
sudo apt install -y curl wget git htop nano bc lm-sensors

# Install Docker jika belum ada
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    newgrp docker
    echo "✅ Docker installed"
else
    echo "✅ Docker sudah terinstall"
fi

# Test koneksi ke master
echo "🔍 Testing koneksi ke master..."
if curl -k -s --connect-timeout 10 https://$MAC_IP:6443/version > /dev/null; then
    echo "✅ Koneksi ke master berhasil"
else
    echo "❌ Tidak bisa connect ke master"
    echo "💡 Pastikan:"
    echo "   - Tailscale berjalan di kedua device"
    echo "   - k3d cluster berjalan di Mac"
    echo "   - Firewall tidak memblokir port 6443"
    exit 1
fi

# Install k3s agent
echo "⚙️  Installing k3s agent..."
curl -sfL https://get.k3s.io | \
  K3S_URL=https://$MAC_IP:6443 \
  K3S_TOKEN=$NODE_TOKEN \
  K3S_NODE_NAME=$(hostname) \
  sh -

# Tunggu k3s agent ready
echo "⏳ Menunggu k3s agent ready..."
sleep 10

# Cek status k3s agent
if sudo systemctl is-active --quiet k3s-agent; then
    echo "✅ k3s agent berjalan"
else
    echo "❌ k3s agent gagal start"
    echo "📋 Log k3s agent:"
    sudo journalctl -u k3s-agent -n 20
    exit 1
fi

echo ""
echo "🎉 Ubuntu server berhasil join ke cluster!"
echo ""
echo "🔧 Next steps:"
echo "1. Verifikasi dari Mac: kubectl get nodes"
echo "2. Setup worker registration"
echo "3. Setup heartbeat monitoring"
echo ""
echo "📋 Informasi sistem:"
echo "   Hostname: $(hostname)"
echo "   IP: $(hostname -I | awk '{print $1}')"
echo "   CPU Cores: $(nproc)"
echo "   Memory: $(free -h | awk 'NR==2{print $2}')"
echo "   Storage: $(df -h / | awk 'NR==2{print $2}')"