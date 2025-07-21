import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client instance
 * Centralized database configuration
 */
const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
  errorFormat: "pretty",
});

/**
 * Connect to database
 */
const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
};

/**
 * Disconnect from database
 */
const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
    console.log("✅ Database disconnected successfully");
  } catch (error) {
    console.error("❌ Database disconnection failed:", error);
  }
};

/**
 * Handle graceful shutdown
 */
process.on("beforeExit", async () => {
  await disconnectDatabase();
});

process.on("SIGINT", async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectDatabase();
  process.exit(0);
});

export { prisma, connectDatabase, disconnectDatabase };
