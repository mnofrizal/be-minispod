#!/bin/bash
set -e

echo "🚀 Setup k3d dengan external worker"
echo "===================================="

# Ambil IP Tailscale Mac
MAC_IP=$(tailscale ip -4)
if [ -z "$MAC_IP" ]; then
    echo "❌ IP Tailscale tidak ditemukan"
    echo "💡 Pastikan Tailscale berjalan: tailscale status"
    exit 1
fi

echo "📡 Mac Tailscale IP: $MAC_IP"

# Hapus cluster lama
echo "🗑️  Menghapus cluster lama..."
k3d cluster delete paas-dev 2>/dev/null || true

# Buat cluster baru
echo "🏗️  Membuat k3d cluster..."
k3d cluster create paas-dev \
  --servers 1 \
  --agents 1 \
  --port "6443:6443@server:0" \
  --port "9080:80@loadbalancer" \
  --port "9443:443@loadbalancer" \
  --k3s-arg "--tls-san=0.0.0.0@server:0" \
  --k3s-arg "--tls-san=$MAC_IP@server:0" \
  --k3s-arg "--bind-address=0.0.0.0@server:0" \
  --k3s-arg "--advertise-address=$MAC_IP@server:0"

# Tunggu cluster ready
echo "⏳ Menunggu cluster ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s

# Ambil token
K3D_SERVER=$(docker ps --format "table {{.Names}}" | grep k3d-paas-dev-server | head -1)
NODE_TOKEN=$(docker exec $K3D_SERVER cat /var/lib/rancher/k3s/server/node-token)

# Test external access
echo "🔍 Testing external access..."
if curl -k -s --connect-timeout 5 https://$MAC_IP:6443/version > /dev/null; then
    echo "✅ External access working"
else
    echo "❌ External access failed"
    echo "💡 Check firewall and Tailscale settings"
fi

echo ""
echo "✅ k3d cluster siap!"
echo "📋 Informasi koneksi:"
echo "   Master URL: https://$MAC_IP:6443"
echo "   Node Token: $NODE_TOKEN"
echo ""
echo "🔗 Untuk menghubungkan Ubuntu worker, jalankan di Ubuntu server:"
echo "curl -sfL https://get.k3s.io | \\"
echo "  K3S_URL=https://$MAC_IP:6443 \\"
echo "  K3S_TOKEN=$NODE_TOKEN \\"
echo "  K3S_NODE_NAME=\$(hostname) \\"
echo "  sh -"
echo ""
echo "📝 Atau gunakan script otomatis:"
echo "wget https://raw.githubusercontent.com/your-repo/scripts/ubuntu-join-cluster.sh"
echo "chmod +x ubuntu-join-cluster.sh"
echo "./ubuntu-join-cluster.sh $MAC_IP $NODE_TOKEN"
echo ""
echo "🎯 Status cluster saat ini:"
kubectl get nodes -o wide

echo ""
echo "🔧 Next steps:"
echo "1. Jalankan command di atas pada Ubuntu server (100.107.230.95)"
echo "2. Jalankan script registrasi worker"
echo "3. Setup heartbeat monitoring"
echo "4. Verifikasi dengan: kubectl get nodes"