import { hashPassword } from "../src/utils/crypto.util.js";
import { prisma } from "../src/config/database.js";

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create service catalog entries
  console.log("📦 Creating service catalog...");

  const n8nService = await prisma.serviceCatalog.upsert({
    where: { name: "n8n" },
    update: {},
    create: {
      name: "n8n",
      displayName: "N8N Workflow Automation",
      description:
        "Powerful workflow automation tool with visual editor. Create complex workflows with a simple drag-and-drop interface.",
      version: "latest",
      isActive: true,
      cpuRequest: "0.25",
      cpuLimit: "1",
      memRequest: "512Mi",
      memLimit: "1Gi",
      monthlyPrice: 0, // Free for Phase 1
      dockerImage: "n8nio/n8n:latest",
      containerPort: 5678,
      environmentVars: {
        N8N_BASIC_AUTH_ACTIVE: "true",
        N8N_BASIC_AUTH_USER: "admin",
        N8N_HOST: "0.0.0.0",
        N8N_PORT: "5678",
        N8N_PROTOCOL: "http",
        WEBHOOK_URL: "http://localhost:5678/",
        GENERIC_TIMEZONE: "Asia/Jakarta",
      },
    },
  });

  console.log(`✅ Created service: ${n8nService.displayName}`);

  // Create admin user
  console.log("👤 Creating admin user...");

  const adminPassword = await hashPassword("Admin123!@#");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@paas.com" },
    update: {},
    create: {
      name: "System Administrator",
      email: "admin@paas.com",
      password: adminPassword,
      role: "ADMINISTRATOR",
      isActive: true,
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create test customer user
  console.log("👤 Creating test customer...");

  const customerPassword = await hashPassword("Customer123!@#");

  const customerUser = await prisma.user.upsert({
    where: { email: "customer@test.com" },
    update: {},
    create: {
      name: "Test Customer",
      email: "customer@test.com",
      password: customerPassword,
      role: "USER",
      isActive: true,
    },
  });

  console.log(`✅ Created customer user: ${customerUser.email}`);

  // Create worker nodes (mock data for Phase 1)
  console.log("🖥️ Creating worker nodes...");

  const workerNodes = [
    {
      name: "worker-ryzen-3900x",
      hostname: "ryzen-3900x.cluster.local",
      ipAddress: "192.168.1.10",
      architecture: "amd64",
      operatingSystem: "linux",
      cpuCores: 24,
      cpuArchitecture: "AMD Ryzen 9 3900X",
      totalMemory: "64Gi",
      totalStorage: "1Ti",
      allocatedCPU: "0",
      allocatedMemory: "0",
      allocatedStorage: "0",
      maxPods: 110,
      currentPods: 0,
      status: "ACTIVE",
      isReady: true,
      isSchedulable: true,
      labels: {
        "node.kubernetes.io/instance-type": "high-performance",
        "topology.kubernetes.io/zone": "zone-a",
        "node-role.kubernetes.io/worker": "true",
      },
      taints: [],
      kubeletVersion: "v1.28.0",
      containerRuntime: "containerd://1.7.0",
      kernelVersion: "5.15.0-78-generic",
      osImage: "Ubuntu 22.04.3 LTS",
    },
    {
      name: "worker-ryzen-6900hs",
      hostname: "ryzen-6900hs.cluster.local",
      ipAddress: "192.168.1.11",
      architecture: "amd64",
      operatingSystem: "linux",
      cpuCores: 16,
      cpuArchitecture: "AMD Ryzen 9 6900HS",
      totalMemory: "32Gi",
      totalStorage: "500Gi",
      allocatedCPU: "0",
      allocatedMemory: "0",
      allocatedStorage: "0",
      maxPods: 110,
      currentPods: 0,
      status: "ACTIVE",
      isReady: true,
      isSchedulable: true,
      labels: {
        "node.kubernetes.io/instance-type": "standard",
        "topology.kubernetes.io/zone": "zone-b",
        "node-role.kubernetes.io/worker": "true",
      },
      taints: [],
      kubeletVersion: "v1.28.0",
      containerRuntime: "containerd://1.7.0",
      kernelVersion: "5.15.0-78-generic",
      osImage: "Ubuntu 22.04.3 LTS",
    },
    {
      name: "worker-intel-i7",
      hostname: "intel-i7.cluster.local",
      ipAddress: "192.168.1.12",
      architecture: "amd64",
      operatingSystem: "linux",
      cpuCores: 8,
      cpuArchitecture: "Intel Core i7 Gen7",
      totalMemory: "32Gi",
      totalStorage: "500Gi",
      allocatedCPU: "0",
      allocatedMemory: "0",
      allocatedStorage: "0",
      maxPods: 110,
      currentPods: 0,
      status: "ACTIVE",
      isReady: true,
      isSchedulable: true,
      labels: {
        "node.kubernetes.io/instance-type": "standard",
        "topology.kubernetes.io/zone": "zone-c",
        "node-role.kubernetes.io/worker": "true",
      },
      taints: [],
      kubeletVersion: "v1.28.0",
      containerRuntime: "containerd://1.7.0",
      kernelVersion: "5.15.0-78-generic",
      osImage: "Ubuntu 22.04.3 LTS",
    },
  ];

  for (const nodeData of workerNodes) {
    const node = await prisma.workerNode.upsert({
      where: { name: nodeData.name },
      update: {},
      create: nodeData,
    });
    console.log(`✅ Created worker node: ${node.name}`);
  }

  console.log("🎉 Database seeding completed successfully!");
  console.log("\n📋 Seeded data summary:");
  console.log("- Services: 1 (N8N)");
  console.log("- Users: 2 (1 admin, 1 customer)");
  console.log("- Worker Nodes: 3");
  console.log("\n🔐 Test credentials:");
  console.log("Admin: admin@paas.com / Admin123!@#");
  console.log("Customer: customer@test.com / Customer123!@#");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
