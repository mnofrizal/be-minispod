#!/bin/bash

# Script untuk verifikasi setup k3d + Ubuntu worker
# Usage: ./verify-setup.sh

echo "🔍 Verifikasi Setup PaaS Cluster"
echo "================================"

# Cek Tailscale
echo "📡 Tailscale Status:"
MAC_IP=$(tailscale ip -4 2>/dev/null)
if [ -n "$MAC_IP" ]; then
    echo "   ✅ Mac Tailscale IP: $MAC_IP"
else
    echo "   ❌ Tailscale tidak aktif"
    exit 1
fi

echo ""

# Cek k3d cluster
echo "🏗️  k3d Cluster Status:"
if k3d cluster list | grep -q paas-dev; then
    echo "   ✅ Cluster 'paas-dev' ada"
    
    # Cek apakah cluster running
    if k3d cluster list | grep paas-dev | grep -q running; then
        echo "   ✅ Cluster berjalan"
    else
        echo "   ❌ Cluster tidak berjalan"
        echo "   💡 Jalankan: k3d cluster start paas-dev"
        exit 1
    fi
else
    echo "   ❌ Cluster 'paas-dev' tidak ditemukan"
    echo "   💡 Jalankan: ./setup-k3d-external.sh"
    exit 1
fi

echo ""

# Cek kubectl nodes
echo "📋 Kubernetes Nodes:"
if kubectl get nodes &>/dev/null; then
    kubectl get nodes -o wide
    
    NODE_COUNT=$(kubectl get nodes --no-headers | wc -l)
    echo "   📊 Total nodes: $NODE_COUNT"
    
    READY_COUNT=$(kubectl get nodes --no-headers | grep -c Ready)
    echo "   ✅ Ready nodes: $READY_COUNT"
    
    if [ $NODE_COUNT -gt 2 ]; then
        echo "   🎉 Ubuntu worker terdeteksi!"
    else
        echo "   ⚠️  Hanya ada k3d nodes, Ubuntu worker belum join"
    fi
else
    echo "   ❌ Tidak bisa akses kubectl"
    exit 1
fi

echo ""

# Cek PaaS backend
echo "🔧 PaaS Backend Status:"
if curl -s --connect-timeout 5 http://localhost:3000/health &>/dev/null; then
    echo "   ✅ Backend berjalan di localhost:3000"
elif curl -s --connect-timeout 5 http://localhost:3000 &>/dev/null; then
    echo "   ✅ Backend berjalan (endpoint /health mungkin belum ada)"
else
    echo "   ❌ Backend tidak berjalan"
    echo "   💡 Jalankan: npm run dev"
fi

echo ""

# Cek registered workers
echo "💓 Registered Workers:"
WORKERS_RESPONSE=$(curl -s http://localhost:3000/api/v1/workers 2>/dev/null)
if [ $? -eq 0 ] && echo "$WORKERS_RESPONSE" | jq -e '.data.workers' &>/dev/null; then
    echo "$WORKERS_RESPONSE" | jq -r '.data.workers[] | "   \(.hostname) - \(.status) - Last: \(.lastHeartbeat // "Never")"'
    
    WORKER_COUNT=$(echo "$WORKERS_RESPONSE" | jq -r '.data.workers | length')
    echo "   📊 Total registered workers: $WORKER_COUNT"
    
    ACTIVE_COUNT=$(echo "$WORKERS_RESPONSE" | jq -r '.data.workers | map(select(.status == "ACTIVE")) | length')
    echo "   ✅ Active workers: $ACTIVE_COUNT"
else
    echo "   ❌ Tidak bisa mengambil data workers"
    echo "   💡 Pastikan backend berjalan dan database terkoneksi"
fi

echo ""

# Cek external access
echo "🌐 External Access Test:"
if curl -k -s --connect-timeout 5 https://$MAC_IP:6443/version &>/dev/null; then
    echo "   ✅ k3d dapat diakses dari external (port 6443)"
else
    echo "   ❌ k3d tidak dapat diakses dari external"
    echo "   💡 Cek firewall dan k3d configuration"
fi

echo ""

# Test pod deployment
echo "🚀 Test Pod Deployment:"
if kubectl get deployment test-verification &>/dev/null; then
    kubectl delete deployment test-verification &>/dev/null
fi

kubectl create deployment test-verification --image=nginx --replicas=2 &>/dev/null
sleep 5

RUNNING_PODS=$(kubectl get pods -l app=test-verification --no-headers | grep -c Running || echo "0")
TOTAL_PODS=$(kubectl get pods -l app=test-verification --no-headers | wc -l)

echo "   📊 Test pods: $RUNNING_PODS/$TOTAL_PODS running"

if [ $RUNNING_PODS -gt 0 ]; then
    echo "   ✅ Pod deployment berhasil"
    kubectl get pods -l app=test-verification -o wide
else
    echo "   ❌ Pod deployment gagal"
    kubectl describe pods -l app=test-verification
fi

# Cleanup test deployment
kubectl delete deployment test-verification &>/dev/null

echo ""

# Summary
echo "📊 Setup Summary:"
echo "=================="

ISSUES=0

if [ $NODE_COUNT -le 2 ]; then
    echo "⚠️  Ubuntu worker belum join cluster"
    ISSUES=$((ISSUES + 1))
fi

if [ $WORKER_COUNT -eq 0 ]; then
    echo "⚠️  Belum ada worker yang registered"
    ISSUES=$((ISSUES + 1))
fi

if [ $ACTIVE_COUNT -eq 0 ]; then
    echo "⚠️  Belum ada worker yang active (heartbeat)"
    ISSUES=$((ISSUES + 1))
fi

if [ $RUNNING_PODS -eq 0 ]; then
    echo "⚠️  Pod deployment tidak berhasil"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "🎉 Setup sempurna! Semua komponen berjalan dengan baik."
    echo ""
    echo "🔧 Next steps:"
    echo "   - Deploy aplikasi customer (N8N, Ghost, WordPress)"
    echo "   - Test scaling dan load balancing"
    echo "   - Setup monitoring dan alerting"
else
    echo "⚠️  Ditemukan $ISSUES issue yang perlu diperbaiki"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - Cek REAL_WORKER_SETUP_GUIDE.md untuk panduan lengkap"
    echo "   - Jalankan script setup sesuai urutan"
    echo "   - Cek log error di setiap komponen"
fi

echo ""
echo "📚 Useful commands:"
echo "   kubectl get nodes -o wide                    # Cek cluster nodes"
echo "   kubectl get pods --all-namespaces -o wide    # Cek semua pods"
echo "   curl -s http://localhost:3000/api/v1/workers # Cek registered workers"
echo "   k3d cluster list                             # Cek k3d clusters"
echo "   sudo journalctl -u paas-heartbeat -f        # Monitor heartbeat (di Ubuntu)"