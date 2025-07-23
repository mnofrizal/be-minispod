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

  // Create user balance for test customer
  console.log("💰 Creating user balance...");

  const userBalance = await prisma.userBalance.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: {
      userId: customerUser.id,
      balance: 150000, // IDR 150,000
      currency: "IDR",
    },
  });

  console.log(`✅ Created user balance: IDR ${userBalance.balance}`);

  // Create sample top-up transactions
  console.log("💳 Creating sample top-up transactions...");

  const topUpTransaction1 = await prisma.topUpTransaction.create({
    data: {
      userId: customerUser.id,
      amount: 100000, // IDR 100,000
      currency: "IDR",
      status: "PAID",
      orderId: "TOPUP-2024-001",
      snapToken: "snap-token-123",
      paymentType: "bank_transfer",
      transactionId: "midtrans-txn-001",
      paidAt: new Date("2024-01-15T10:30:00Z"),
      expiredAt: new Date("2024-01-16T10:30:00Z"),
      midtransData: {
        transaction_status: "settlement",
        payment_type: "bank_transfer",
        gross_amount: "100000.00",
        bank: "bca",
      },
    },
  });

  const topUpTransaction2 = await prisma.topUpTransaction.create({
    data: {
      userId: customerUser.id,
      amount: 50000, // IDR 50,000
      currency: "IDR",
      status: "PAID",
      orderId: "TOPUP-2024-002",
      snapToken: "snap-token-456",
      paymentType: "credit_card",
      transactionId: "midtrans-txn-002",
      paidAt: new Date("2024-01-20T14:15:00Z"),
      expiredAt: new Date("2024-01-21T14:15:00Z"),
      midtransData: {
        transaction_status: "capture",
        payment_type: "credit_card",
        gross_amount: "50000.00",
        masked_card: "481111-1114",
      },
    },
  });

  console.log(
    `✅ Created top-up transactions: ${topUpTransaction1.orderId}, ${topUpTransaction2.orderId}`
  );

  // Create sample subscription
  console.log("📋 Creating sample subscription...");

  const subscription = await prisma.subscription.create({
    data: {
      userId: customerUser.id,
      serviceId: n8nService.id,
      status: "ACTIVE",
      startDate: new Date("2024-01-22T09:00:00Z"),
      expiresAt: new Date("2024-02-22T09:00:00Z"),
      subdomain: "customer-n8n-001",
    },
  });

  console.log(`✅ Created subscription: ${subscription.subdomain}`);

  // Create unified transactions for frontend
  console.log("🔄 Creating unified transactions...");

  const transactions = [
    // Top-up transaction 1
    {
      userId: customerUser.id,
      type: "TOPUP",
      status: "SUCCESS",
      description: "Top-up via Bank Transfer (BCA)",
      amount: 100000,
      currency: "IDR",
      referenceId: topUpTransaction1.id,
      referenceType: "TOPUP",
      paymentGateway: "midtrans",
      paymentMethod: "bank_transfer",
      createdAt: new Date("2024-01-15T10:30:00Z"),
    },
    // Top-up transaction 2
    {
      userId: customerUser.id,
      type: "TOPUP",
      status: "SUCCESS",
      description: "Top-up via Credit Card",
      amount: 50000,
      currency: "IDR",
      referenceId: topUpTransaction2.id,
      referenceType: "TOPUP",
      paymentGateway: "midtrans",
      paymentMethod: "credit_card",
      createdAt: new Date("2024-01-20T14:15:00Z"),
    },
    // Service purchase transaction
    {
      userId: customerUser.id,
      type: "SERVICE_PURCHASE",
      status: "SUCCESS",
      description: "N8N Workflow Automation - Monthly Subscription",
      amount: 25000, // IDR 25,000 monthly fee
      currency: "IDR",
      referenceId: subscription.id,
      referenceType: "SUBSCRIPTION",
      paymentGateway: "balance",
      paymentMethod: "balance_deduction",
      createdAt: new Date("2024-01-22T09:00:00Z"),
    },
    // Pending top-up transaction
    {
      userId: customerUser.id,
      type: "TOPUP",
      status: "PENDING",
      description: "Top-up via E-Wallet (GoPay) - Pending Payment",
      amount: 75000,
      currency: "IDR",
      referenceId: null, // No reference yet as it's pending
      referenceType: "TOPUP",
      paymentGateway: "midtrans",
      paymentMethod: "gopay",
      createdAt: new Date("2024-01-25T16:45:00Z"),
    },
  ];

  for (const transactionData of transactions) {
    const transaction = await prisma.transaction.create({
      data: transactionData,
    });
    console.log(
      `✅ Created transaction: ${transaction.type} - ${transaction.description}`
    );
  }

  // Create balance transactions (for backward compatibility)
  console.log("📊 Creating balance transactions...");

  const balanceTransactions = [
    {
      userId: customerUser.id,
      type: "CREDIT",
      amount: 100000,
      balanceBefore: 0,
      balanceAfter: 100000,
      description: "Top-up via bank_transfer",
      topUpTransactionId: topUpTransaction1.id,
      createdAt: new Date("2024-01-15T10:30:00Z"),
    },
    {
      userId: customerUser.id,
      type: "CREDIT",
      amount: 50000,
      balanceBefore: 100000,
      balanceAfter: 150000,
      description: "Top-up via credit_card",
      topUpTransactionId: topUpTransaction2.id,
      createdAt: new Date("2024-01-20T14:15:00Z"),
    },
    {
      userId: customerUser.id,
      type: "DEBIT",
      amount: 25000,
      balanceBefore: 150000,
      balanceAfter: 125000,
      description: "N8N Workflow Automation subscription",
      subscriptionId: subscription.id,
      createdAt: new Date("2024-01-22T09:00:00Z"),
    },
  ];

  for (const balanceTransactionData of balanceTransactions) {
    const balanceTransaction = await prisma.balanceTransaction.create({
      data: balanceTransactionData,
    });
    console.log(
      `✅ Created balance transaction: ${balanceTransaction.type} - IDR ${balanceTransaction.amount}`
    );
  }

  // Update user balance to reflect final amount
  await prisma.userBalance.update({
    where: { userId: customerUser.id },
    data: { balance: 125000 }, // After deducting subscription fee
  });

  console.log("🎉 Database seeding completed successfully!");
  console.log("\n📋 Seeded data summary:");
  console.log("- Services: 1 (N8N)");
  console.log("- Users: 2 (1 admin, 1 customer)");
  console.log("- Worker Nodes: 3");
  console.log("- Top-up Transactions: 2");
  console.log("- Subscriptions: 1");
  console.log("- Unified Transactions: 4");
  console.log("- Balance Transactions: 3");
  console.log("- User Balance: IDR 125,000");
  console.log("\n🔐 Test credentials:");
  console.log("Admin: admin@paas.com / Admin123!@#");
  console.log("Customer: customer@test.com / Customer123!@#");
  console.log("\n💰 Sample transaction data:");
  console.log("- 2 successful top-ups (bank transfer, credit card)");
  console.log("- 1 service purchase (N8N subscription)");
  console.log("- 1 pending top-up (GoPay)");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
