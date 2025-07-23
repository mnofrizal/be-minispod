import { hashPassword } from "../src/utils/crypto.util.js";
import { prisma } from "../src/config/database.js";

async function main() {
  console.log("🌱 Starting database seeding...");

  // Create service catalog entries with variants
  console.log("📦 Creating service catalog with variants...");

  // N8N Service Variants
  const n8nBasic = await prisma.serviceCatalog.upsert({
    where: { name_variant: { name: "n8n", variant: "basic" } },
    update: {},
    create: {
      name: "n8n",
      variant: "basic",
      variantDisplayName: "Basic",
      displayName: "N8N Workflow Automation - Basic",
      description:
        "Powerful workflow automation tool with visual editor - Basic plan with essential features for small workflows.",
      version: "latest",
      isActive: true,
      cpuRequest: "0.25",
      cpuLimit: "1",
      memRequest: "512Mi",
      memLimit: "1Gi",
      monthlyPrice: 25000, // IDR 25,000
      availableQuota: 50, // Limit to 50 instances
      dockerImage: "n8nio/n8n:latest",
      containerPort: 5678,
      category: "automation",
      tags: ["workflow", "automation", "integration"],
      icon: "n8n-icon.svg",
      features: ["Basic workflows", "5 active workflows", "Community support"],
      sortOrder: 1,
      isDefaultVariant: true,
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

  const n8nPlus = await prisma.serviceCatalog.upsert({
    where: { name_variant: { name: "n8n", variant: "plus" } },
    update: {},
    create: {
      name: "n8n",
      variant: "plus",
      variantDisplayName: "Plus",
      displayName: "N8N Workflow Automation - Plus",
      description:
        "Powerful workflow automation tool with visual editor - Plus plan with advanced features for growing teams.",
      version: "latest",
      isActive: true,
      cpuRequest: "0.5",
      cpuLimit: "1.5",
      memRequest: "768Mi",
      memLimit: "1.5Gi",
      monthlyPrice: 45000, // IDR 45,000
      availableQuota: 30, // Limit to 30 instances
      dockerImage: "n8nio/n8n:latest",
      containerPort: 5678,
      category: "automation",
      tags: ["workflow", "automation", "integration", "advanced"],
      icon: "n8n-icon.svg",
      features: [
        "Advanced workflows",
        "25 active workflows",
        "Email support",
        "Custom nodes",
      ],
      sortOrder: 2,
      isDefaultVariant: false,
      environmentVars: {
        N8N_BASIC_AUTH_ACTIVE: "true",
        N8N_BASIC_AUTH_USER: "admin",
        N8N_HOST: "0.0.0.0",
        N8N_PORT: "5678",
        N8N_PROTOCOL: "http",
        WEBHOOK_URL: "http://localhost:5678/",
        GENERIC_TIMEZONE: "Asia/Jakarta",
        N8N_ENCRYPTION_KEY: "encryption_key_here",
      },
    },
  });

  const n8nPro = await prisma.serviceCatalog.upsert({
    where: { name_variant: { name: "n8n", variant: "pro" } },
    update: {},
    create: {
      name: "n8n",
      variant: "pro",
      variantDisplayName: "Pro",
      displayName: "N8N Workflow Automation - Pro",
      description:
        "Powerful workflow automation tool with visual editor - Pro plan with enterprise features for large teams.",
      version: "latest",
      isActive: true,
      cpuRequest: "1",
      cpuLimit: "2",
      memRequest: "1Gi",
      memLimit: "2Gi",
      monthlyPrice: 75000, // IDR 75,000
      availableQuota: 10, // Limit to 10 instances (premium tier)
      dockerImage: "n8nio/n8n:latest",
      containerPort: 5678,
      category: "automation",
      tags: ["workflow", "automation", "integration", "enterprise"],
      icon: "n8n-icon.svg",
      features: [
        "Unlimited workflows",
        "Priority support",
        "Custom integrations",
        "Advanced security",
      ],
      sortOrder: 3,
      isDefaultVariant: false,
      environmentVars: {
        N8N_BASIC_AUTH_ACTIVE: "true",
        N8N_BASIC_AUTH_USER: "admin",
        N8N_HOST: "0.0.0.0",
        N8N_PORT: "5678",
        N8N_PROTOCOL: "http",
        WEBHOOK_URL: "http://localhost:5678/",
        GENERIC_TIMEZONE: "Asia/Jakarta",
        N8N_ENCRYPTION_KEY: "encryption_key_here",
        N8N_SECURE_COOKIE: "true",
      },
    },
  });

  // Ghost CMS Service Variants
  const ghostBasic = await prisma.serviceCatalog.upsert({
    where: { name_variant: { name: "ghost", variant: "basic" } },
    update: {},
    create: {
      name: "ghost",
      variant: "basic",
      variantDisplayName: "Basic",
      displayName: "Ghost CMS - Basic",
      description:
        "Modern publishing platform for creating blogs and websites - Basic plan for personal blogs.",
      version: "latest",
      isActive: true,
      cpuRequest: "0.25",
      cpuLimit: "1",
      memRequest: "512Mi",
      memLimit: "1Gi",
      monthlyPrice: 35000, // IDR 35,000
      availableQuota: 25, // Limit to 25 instances
      dockerImage: "ghost:latest",
      containerPort: 2368,
      category: "cms",
      tags: ["blog", "cms", "publishing"],
      icon: "ghost-icon.svg",
      features: ["Basic themes", "1 custom domain", "Email support"],
      sortOrder: 1,
      isDefaultVariant: true,
      environmentVars: {
        NODE_ENV: "production",
        url: "http://localhost:2368",
      },
    },
  });

  // WordPress Service Variants
  const wordpressFree = await prisma.serviceCatalog.upsert({
    where: { name_variant: { name: "wordpress", variant: "free" } },
    update: {},
    create: {
      name: "wordpress",
      variant: "free",
      variantDisplayName: "Free",
      displayName: "WordPress - Free",
      description:
        "Popular content management system for creating websites and blogs - Free plan for getting started.",
      version: "latest",
      isActive: true,
      cpuRequest: "0.25",
      cpuLimit: "0.5",
      memRequest: "256Mi",
      memLimit: "512Mi",
      monthlyPrice: 0, // Free
      availableQuota: -1, // Unlimited for free tier
      dockerImage: "wordpress:latest",
      containerPort: 80,
      category: "cms",
      tags: ["blog", "cms", "website", "free"],
      icon: "wordpress-icon.svg",
      features: ["Basic themes", "Community support", "5GB storage"],
      sortOrder: 1,
      isDefaultVariant: true,
      environmentVars: {
        WORDPRESS_DB_HOST: "mysql:3306",
        WORDPRESS_DB_NAME: "wordpress",
      },
    },
  });

  console.log(`✅ Created N8N variants: Basic, Plus, Pro`);
  console.log(`✅ Created Ghost variant: Basic`);
  console.log(`✅ Created WordPress variant: Free`);

  // Use n8nBasic as the default service for subscription
  const n8nService = n8nBasic;

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

  // // Create worker nodes (mock data for Phase 1)
  // console.log("🖥️ Creating worker nodes...");

  // const workerNodes = [
  //   {
  //     name: "worker-ryzen-3900x",
  //     hostname: "ryzen-3900x.cluster.local",
  //     ipAddress: "192.168.1.10",
  //     architecture: "amd64",
  //     operatingSystem: "linux",
  //     cpuCores: 24,
  //     cpuArchitecture: "AMD Ryzen 9 3900X",
  //     totalMemory: "64Gi",
  //     totalStorage: "1Ti",
  //     allocatedCPU: "0",
  //     allocatedMemory: "0",
  //     allocatedStorage: "0",
  //     maxPods: 110,
  //     currentPods: 0,
  //     status: "ACTIVE",
  //     isReady: true,
  //     isSchedulable: true,
  //     labels: {
  //       "node.kubernetes.io/instance-type": "high-performance",
  //       "topology.kubernetes.io/zone": "zone-a",
  //       "node-role.kubernetes.io/worker": "true",
  //     },
  //     taints: [],
  //     kubeletVersion: "v1.28.0",
  //     containerRuntime: "containerd://1.7.0",
  //     kernelVersion: "5.15.0-78-generic",
  //     osImage: "Ubuntu 22.04.3 LTS",
  //   },
  //   {
  //     name: "worker-ryzen-6900hs",
  //     hostname: "ryzen-6900hs.cluster.local",
  //     ipAddress: "192.168.1.11",
  //     architecture: "amd64",
  //     operatingSystem: "linux",
  //     cpuCores: 16,
  //     cpuArchitecture: "AMD Ryzen 9 6900HS",
  //     totalMemory: "32Gi",
  //     totalStorage: "500Gi",
  //     allocatedCPU: "0",
  //     allocatedMemory: "0",
  //     allocatedStorage: "0",
  //     maxPods: 110,
  //     currentPods: 0,
  //     status: "ACTIVE",
  //     isReady: true,
  //     isSchedulable: true,
  //     labels: {
  //       "node.kubernetes.io/instance-type": "standard",
  //       "topology.kubernetes.io/zone": "zone-b",
  //       "node-role.kubernetes.io/worker": "true",
  //     },
  //     taints: [],
  //     kubeletVersion: "v1.28.0",
  //     containerRuntime: "containerd://1.7.0",
  //     kernelVersion: "5.15.0-78-generic",
  //     osImage: "Ubuntu 22.04.3 LTS",
  //   },
  //   {
  //     name: "worker-intel-i7",
  //     hostname: "intel-i7.cluster.local",
  //     ipAddress: "192.168.1.12",
  //     architecture: "amd64",
  //     operatingSystem: "linux",
  //     cpuCores: 8,
  //     cpuArchitecture: "Intel Core i7 Gen7",
  //     totalMemory: "32Gi",
  //     totalStorage: "500Gi",
  //     allocatedCPU: "0",
  //     allocatedMemory: "0",
  //     allocatedStorage: "0",
  //     maxPods: 110,
  //     currentPods: 0,
  //     status: "ACTIVE",
  //     isReady: true,
  //     isSchedulable: true,
  //     labels: {
  //       "node.kubernetes.io/instance-type": "standard",
  //       "topology.kubernetes.io/zone": "zone-c",
  //       "node-role.kubernetes.io/worker": "true",
  //     },
  //     taints: [],
  //     kubeletVersion: "v1.28.0",
  //     containerRuntime: "containerd://1.7.0",
  //     kernelVersion: "5.15.0-78-generic",
  //     osImage: "Ubuntu 22.04.3 LTS",
  //   },
  // ];

  // for (const nodeData of workerNodes) {
  //   const node = await prisma.workerNode.upsert({
  //     where: { name: nodeData.name },
  //     update: {},
  //     create: nodeData,
  //   });
  //   console.log(`✅ Created worker node: ${node.name}`);
  // }

  // Create user balance for admin user
  console.log("💰 Creating admin user balance...");

  const userBalance = await prisma.userBalance.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      balance: 150000, // IDR 150,000
      currency: "IDR",
    },
  });

  console.log(`✅ Created admin user balance: IDR ${userBalance.balance}`);

  // Create sample top-up transactions for admin
  console.log("💳 Creating sample top-up transactions for admin...");

  const topUpTransaction1 = await prisma.topUpTransaction.create({
    data: {
      userId: adminUser.id,
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
      userId: adminUser.id,
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

  // Create sample subscription for admin
  // console.log("📋 Creating sample subscription for admin...");

  // const subscription = await prisma.subscription.create({
  //   data: {
  //     userId: adminUser.id,
  //     serviceId: n8nService.id,
  //     status: "ACTIVE",
  //     startDate: new Date("2024-01-22T09:00:00Z"),
  //     expiresAt: new Date("2024-02-22T09:00:00Z"),
  //     subdomain: "admin-n8n-001",
  //   },
  // });

  // console.log(`✅ Created subscription: ${subscription.subdomain}`);

  // // Create unified transactions for admin user
  // console.log("🔄 Creating unified transactions for admin...");

  // const transactions = [
  //   // Top-up transaction 1
  //   {
  //     userId: adminUser.id,
  //     type: "TOPUP",
  //     status: "SUCCESS",
  //     description: "Top-up via Bank Transfer (BCA)",
  //     amount: 100000,
  //     currency: "IDR",
  //     referenceId: topUpTransaction1.id,
  //     referenceType: "TOPUP",
  //     paymentGateway: "midtrans",
  //     paymentMethod: "bank_transfer",
  //     createdAt: new Date("2024-01-15T10:30:00Z"),
  //   },
  //   // Top-up transaction 2
  //   {
  //     userId: adminUser.id,
  //     type: "TOPUP",
  //     status: "SUCCESS",
  //     description: "Top-up via Credit Card",
  //     amount: 50000,
  //     currency: "IDR",
  //     referenceId: topUpTransaction2.id,
  //     referenceType: "TOPUP",
  //     paymentGateway: "midtrans",
  //     paymentMethod: "credit_card",
  //     createdAt: new Date("2024-01-20T14:15:00Z"),
  //   },
  //   // Service purchase transaction
  //   {
  //     userId: adminUser.id,
  //     type: "SERVICE_PURCHASE",
  //     status: "SUCCESS",
  //     description: "N8N Workflow Automation - Monthly Subscription",
  //     amount: 25000, // IDR 25,000 monthly fee
  //     currency: "IDR",
  //     referenceId: subscription.id,
  //     referenceType: "SUBSCRIPTION",
  //     paymentGateway: "balance",
  //     paymentMethod: "balance_deduction",
  //     createdAt: new Date("2024-01-22T09:00:00Z"),
  //   },
  //   // Pending top-up transaction
  //   {
  //     userId: adminUser.id,
  //     type: "TOPUP",
  //     status: "PENDING",
  //     description: "Top-up via E-Wallet (GoPay) - Pending Payment",
  //     amount: 75000,
  //     currency: "IDR",
  //     referenceId: null, // No reference yet as it's pending
  //     referenceType: "TOPUP",
  //     paymentGateway: "midtrans",
  //     paymentMethod: "gopay",
  //     createdAt: new Date("2024-01-25T16:45:00Z"),
  //   },
  // ];

  // for (const transactionData of transactions) {
  //   const transaction = await prisma.transaction.create({
  //     data: transactionData,
  //   });
  //   console.log(
  //     `✅ Created transaction: ${transaction.type} - ${transaction.description}`
  //   );
  // }

  // Create balance transactions for admin (for backward compatibility)
  console.log("📊 Creating balance transactions for admin...");

  const balanceTransactions = [
    {
      userId: adminUser.id,
      type: "CREDIT",
      amount: 100000,
      balanceBefore: 0,
      balanceAfter: 100000,
      description: "Top-up via bank_transfer",
      topUpTransactionId: topUpTransaction1.id,
      createdAt: new Date("2024-01-15T10:30:00Z"),
    },
    {
      userId: adminUser.id,
      type: "CREDIT",
      amount: 50000,
      balanceBefore: 100000,
      balanceAfter: 150000,
      description: "Top-up via credit_card",
      topUpTransactionId: topUpTransaction2.id,
      createdAt: new Date("2024-01-20T14:15:00Z"),
    },
    // {
    //   userId: adminUser.id,
    //   type: "DEBIT",
    //   amount: 25000,
    //   balanceBefore: 150000,
    //   balanceAfter: 125000,
    //   description: "N8N Workflow Automation subscription",
    //   subscriptionId: subscription.id,
    //   createdAt: new Date("2024-01-22T09:00:00Z"),
    // },
  ];

  for (const balanceTransactionData of balanceTransactions) {
    const balanceTransaction = await prisma.balanceTransaction.create({
      data: balanceTransactionData,
    });
    console.log(
      `✅ Created balance transaction: ${balanceTransaction.type} - IDR ${balanceTransaction.amount}`
    );
  }

  // Update admin user balance to reflect final amount
  await prisma.userBalance.update({
    where: { userId: adminUser.id },
    data: { balance: 125000 }, // After deducting subscription fee
  });

  console.log("🎉 Database seeding completed successfully!");
  console.log("\n📋 Seeded data summary:");
  console.log("- Service Variants: 5 total");
  console.log("  • N8N: 3 variants (Basic, Plus, Pro)");
  console.log("  • Ghost: 1 variant (Basic)");
  console.log("  • WordPress: 1 variant (Free)");
  console.log("- Users: 2 (1 admin, 1 customer)");
  console.log("- Worker Nodes: 3");
  console.log("- Top-up Transactions: 2 (for admin user)");
  console.log("- Subscriptions: 1 (N8N Basic for admin)");
  console.log("- Unified Transactions: 4 (for admin user)");
  console.log("- Balance Transactions: 3 (for admin user)");
  console.log("- Admin User Balance: IDR 125,000");
  console.log("\n🔐 Test credentials:");
  console.log("Admin: admin@paas.com / Admin123!@#");
  console.log("Customer: customer@test.com / Customer123!@#");
  console.log("\n💰 Sample transaction data (for admin user):");
  console.log("- 2 successful top-ups (bank transfer, credit card)");
  console.log("- 1 service purchase (N8N Basic subscription)");
  console.log("- 1 pending top-up (GoPay)");
  console.log("\n🎯 Service Variants Available:");
  console.log("- N8N Basic: IDR 25,000/month (1 vCPU, 1GB RAM)");
  console.log("- N8N Plus: IDR 45,000/month (1.5 vCPU, 1.5GB RAM)");
  console.log("- N8N Pro: IDR 75,000/month (2 vCPU, 2GB RAM)");
  console.log("- Ghost Basic: IDR 35,000/month (1 vCPU, 1GB RAM)");
  console.log("- WordPress Free: IDR 0/month (0.5 vCPU, 512MB RAM)");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
