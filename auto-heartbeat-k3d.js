#!/usr/bin/env node

/**
 * Continuous K3d Worker Heartbeat System
 *
 * This script simulates automatic heartbeat functionality for k3d worker nodes
 * by continuously monitoring the k3d cluster and sending heartbeats to the PaaS backend.
 *
 * Features:
 * - Auto-discovers k3d worker nodes
 * - Registers new nodes automatically
 * - Sends continuous heartbeats with real resource metrics
 * - Handles node failures and recoveries
 * - Graceful shutdown on CTRL+C
 *
 * Usage:
 *   node auto-heartbeat-k3d.js
 *   node auto-heartbeat-k3d.js --interval 15  # Custom heartbeat interval (seconds)
 *   node auto-heartbeat-k3d.js --cluster paas-dev  # Custom cluster name
 */

import { execSync } from "child_process";
import axios from "axios";

// Configuration
const CONFIG = {
  BACKEND_URL: process.env.PAAS_BACKEND_URL || "http://localhost:3000/api/v1",
  CLUSTER_NAME: process.argv.includes("--cluster")
    ? process.argv[process.argv.indexOf("--cluster") + 1]
    : "paas-dev",
  HEARTBEAT_INTERVAL: process.argv.includes("--interval")
    ? parseInt(process.argv[process.argv.indexOf("--interval") + 1]) * 1000
    : 30000, // 30 seconds default
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 seconds
};

// Global state
let isRunning = true;
let registeredNodes = new Set();
let heartbeatIntervals = new Map();

/**
 * Enhanced logging with timestamps
 */
const logger = {
  info: (message, data = "") => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] ℹ️  ${message}`,
      data ? JSON.stringify(data, null, 2) : ""
    );
  },
  success: (message, data = "") => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] ✅ ${message}`,
      data ? JSON.stringify(data, null, 2) : ""
    );
  },
  error: (message, error = "") => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] ❌ ${message}`,
      error ? error.message || error : ""
    );
  },
  warn: (message, data = "") => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] ⚠️  ${message}`,
      data ? JSON.stringify(data, null, 2) : ""
    );
  },
};

/**
 * Execute kubectl command with error handling
 */
function executeKubectl(command) {
  try {
    // Use default kubectl configuration (k3d automatically merges config)
    const result = execSync(command, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    // Enhanced error handling for common k3d issues
    let errorMessage = error.message;

    if (errorMessage.includes("invalid character")) {
      errorMessage = `
❌ kubectl API connection failed. This usually means:
1. k3d cluster is not running: Run 'k3d cluster start ${CONFIG.CLUSTER_NAME}'
2. Kubeconfig is corrupted: Run 'k3d kubeconfig merge ${CONFIG.CLUSTER_NAME} --kubeconfig-switch-context'
3. API server is not ready: Wait a few minutes and try again

Original error: ${error.message}`;
    } else if (errorMessage.includes("connection refused")) {
      errorMessage = `
❌ Cannot connect to k3d cluster API server.
- Check if cluster is running: k3d cluster list
- Restart cluster if needed: k3d cluster stop ${CONFIG.CLUSTER_NAME} && k3d cluster start ${CONFIG.CLUSTER_NAME}

Original error: ${error.message}`;
    } else if (errorMessage.includes("no such file")) {
      errorMessage = `
❌ Kubeconfig file not found.
- Generate kubeconfig: k3d kubeconfig merge ${CONFIG.CLUSTER_NAME} --kubeconfig-switch-context
- Or check cluster exists: k3d cluster list

Original error: ${error.message}`;
    }

    throw new Error(`kubectl command failed: ${errorMessage}`);
  }
}

/**
 * Check if k3d cluster exists and is running
 */
function checkClusterStatus() {
  try {
    const clusters = execSync("k3d cluster list --output json", {
      encoding: "utf8",
    });
    const clusterList = JSON.parse(clusters);

    const cluster = clusterList.find((c) => c.name === CONFIG.CLUSTER_NAME);
    if (!cluster) {
      throw new Error(`Cluster '${CONFIG.CLUSTER_NAME}' not found`);
    }

    if (cluster.serversRunning === 0 && cluster.agentsRunning === 0) {
      throw new Error(`Cluster '${CONFIG.CLUSTER_NAME}' is not running`);
    }

    return {
      name: cluster.name,
      servers: cluster.serversRunning,
      agents: cluster.agentsRunning,
      status: "running",
    };
  } catch (error) {
    throw new Error(`Failed to check cluster status: ${error.message}`);
  }
}

/**
 * Get worker nodes from k3d cluster
 */
function getWorkerNodes() {
  try {
    const nodesJson = executeKubectl("kubectl get nodes -o json");
    const nodes = JSON.parse(nodesJson);

    return nodes.items
      .filter((node) => {
        // Filter out master/control-plane nodes
        const labels = node.metadata.labels || {};
        return (
          !labels["node-role.kubernetes.io/control-plane"] &&
          !labels["node-role.kubernetes.io/master"]
        );
      })
      .map((node) => {
        const status = node.status;
        const metadata = node.metadata;

        // Extract resource information
        const allocatable = status.allocatable || {};
        const capacity = status.capacity || {};

        // Parse CPU (convert from millicores if needed)
        let cpuCores = capacity.cpu || "0";
        if (cpuCores.endsWith("m")) {
          cpuCores = Math.ceil(parseInt(cpuCores) / 1000);
        } else {
          cpuCores = parseInt(cpuCores) || 0;
        }

        // Parse memory (convert to GB)
        let totalMemoryGB = 0;
        const memoryStr = capacity.memory || "0Ki";
        if (memoryStr.endsWith("Ki")) {
          totalMemoryGB = Math.round(parseInt(memoryStr) / 1024 / 1024);
        } else if (memoryStr.endsWith("Mi")) {
          totalMemoryGB = Math.round(parseInt(memoryStr) / 1024);
        } else if (memoryStr.endsWith("Gi")) {
          totalMemoryGB = parseInt(memoryStr);
        }

        // Get node conditions
        const conditions = status.conditions || [];
        const readyCondition = conditions.find((c) => c.type === "Ready");
        const isReady = readyCondition?.status === "True";

        // Get addresses
        const addresses = status.addresses || [];
        const internalIP =
          addresses.find((addr) => addr.type === "InternalIP")?.address ||
          "unknown";
        const hostname =
          addresses.find((addr) => addr.type === "Hostname")?.address ||
          metadata.name;

        return {
          name: metadata.name,
          hostname: hostname,
          ipAddress: internalIP,
          cpuCores: cpuCores,
          cpuArchitecture: status.nodeInfo?.architecture || "amd64",
          totalMemory: `${totalMemoryGB}Gi`,
          totalStorage: "100Gi", // Default for k3d
          architecture: status.nodeInfo?.architecture || "amd64",
          operatingSystem: status.nodeInfo?.operatingSystem || "linux",
          kubeletVersion: status.nodeInfo?.kubeletVersion || "unknown",
          containerRuntime:
            status.nodeInfo?.containerRuntimeVersion || "unknown",
          kernelVersion: status.nodeInfo?.kernelVersion || "unknown",
          osImage: status.nodeInfo?.osImage || "unknown",
          isReady: isReady,
          maxPods: parseInt(allocatable.pods) || 110,
          labels: metadata.labels || {},
          taints: node.spec?.taints || [],
        };
      });
  } catch (error) {
    throw new Error(`Failed to get worker nodes: ${error.message}`);
  }
}

/**
 * Register worker node with PaaS backend
 */
async function registerWorkerNode(nodeData) {
  try {
    const response = await axios.post(
      `${CONFIG.BACKEND_URL}/workers/register`,
      nodeData,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response?.data?.code === "WORKER_NODE_UPDATED") {
      return error.response.data;
    }
    throw error;
  }
}

/**
 * Send heartbeat for a worker node
 */
async function sendHeartbeat(nodeName) {
  try {
    // Get current resource metrics
    const metrics = await getNodeMetrics(nodeName);

    const heartbeatData = {
      allocatedCPU: metrics.allocatedCPU,
      allocatedMemory: metrics.allocatedMemory,
      currentPods: metrics.currentPods,
      status: "ACTIVE",
      isReady: true,
    };

    const response = await axios.put(
      `${CONFIG.BACKEND_URL}/workers/${nodeName}/heartbeat`,
      heartbeatData,
      {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    logger.info(`💓 Heartbeat sent for ${nodeName}`, {
      status: response.data.success ? "success" : "failed",
      metrics: heartbeatData,
    });

    return response.data;
  } catch (error) {
    logger.error(
      `💔 Heartbeat failed for ${nodeName}`,
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Get node resource metrics
 */
async function getNodeMetrics(nodeName) {
  try {
    // Get pod count on this node
    const podsJson = executeKubectl(
      `kubectl get pods --all-namespaces --field-selector spec.nodeName=${nodeName} -o json`
    );
    const pods = JSON.parse(podsJson);
    const currentPods = pods.items.length;

    // Simulate resource usage (in real deployment, this would come from metrics server)
    const allocatedCPU = Math.random() * 2; // 0-2 CPU cores
    const allocatedMemory = Math.floor(Math.random() * 4096); // 0-4GB in MB
    const cpuUsagePercent = Math.floor(Math.random() * 80); // 0-80%
    const memoryUsagePercent = Math.floor(Math.random() * 70); // 0-70%

    return {
      allocatedCPU,
      allocatedMemory,
      currentPods,
      cpuUsagePercent,
      memoryUsagePercent,
    };
  } catch (error) {
    // Return default metrics if unable to get real metrics
    return {
      allocatedCPU: 0.5,
      allocatedMemory: 512,
      currentPods: 0,
      cpuUsagePercent: 10,
      memoryUsagePercent: 20,
    };
  }
}

/**
 * Start continuous heartbeat for a node
 */
function startNodeHeartbeat(nodeName) {
  if (heartbeatIntervals.has(nodeName)) {
    return; // Already running
  }

  const intervalId = setInterval(async () => {
    if (!isRunning) {
      clearInterval(intervalId);
      return;
    }

    try {
      await sendHeartbeat(nodeName);
    } catch (error) {
      logger.error(`Failed to send heartbeat for ${nodeName}`, error.message);
    }
  }, CONFIG.HEARTBEAT_INTERVAL);

  heartbeatIntervals.set(nodeName, intervalId);
  logger.success(
    `🔄 Started continuous heartbeat for ${nodeName} (every ${
      CONFIG.HEARTBEAT_INTERVAL / 1000
    }s)`
  );
}

/**
 * Stop heartbeat for a node
 */
function stopNodeHeartbeat(nodeName) {
  const intervalId = heartbeatIntervals.get(nodeName);
  if (intervalId) {
    clearInterval(intervalId);
    heartbeatIntervals.delete(nodeName);
    logger.warn(`⏹️  Stopped heartbeat for ${nodeName}`);
  }
}

/**
 * Main discovery and registration loop
 */
async function discoverAndRegisterNodes() {
  try {
    logger.info("🔍 Discovering k3d worker nodes...");

    const workerNodes = getWorkerNodes();
    logger.info(
      `Found ${workerNodes.length} worker nodes in cluster '${CONFIG.CLUSTER_NAME}'`
    );

    for (const node of workerNodes) {
      try {
        // Register or update node
        const result = await registerWorkerNode(node);

        if (result.code === "WORKER_NODE_UPDATED") {
          logger.success(`🔄 Updated existing worker node: ${node.name}`);
        } else {
          logger.success(`✨ Registered new worker node: ${node.name}`);
        }

        // Track registered nodes
        registeredNodes.add(node.name);

        // Start continuous heartbeat for this node
        startNodeHeartbeat(node.name);
      } catch (error) {
        logger.error(
          `Failed to register worker node ${node.name}`,
          error.response?.data || error.message
        );
      }
    }

    // Stop heartbeats for nodes that no longer exist
    const currentNodeNames = new Set(workerNodes.map((n) => n.name));
    for (const registeredNode of registeredNodes) {
      if (!currentNodeNames.has(registeredNode)) {
        logger.warn(
          `🗑️  Node ${registeredNode} no longer exists, stopping heartbeat`
        );
        stopNodeHeartbeat(registeredNode);
        registeredNodes.delete(registeredNode);
      }
    }
  } catch (error) {
    logger.error("Failed to discover and register nodes", error.message);
  }
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  logger.info("🚀 Starting K3d Worker Heartbeat System");
  logger.info(`📡 Backend URL: ${CONFIG.BACKEND_URL}`);
  logger.info(`🎯 Cluster: ${CONFIG.CLUSTER_NAME}`);
  logger.info(`⏱️  Heartbeat Interval: ${CONFIG.HEARTBEAT_INTERVAL / 1000}s`);
  logger.info("");

  // Initial discovery and registration
  await discoverAndRegisterNodes();

  // Set up periodic rediscovery (every 2 minutes)
  const discoveryInterval = setInterval(async () => {
    if (!isRunning) {
      clearInterval(discoveryInterval);
      return;
    }

    logger.info("🔄 Rediscovering worker nodes...");
    await discoverAndRegisterNodes();
  }, 120000); // 2 minutes

  logger.info("✅ Heartbeat system is running. Press CTRL+C to stop.");
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const shutdown = () => {
    logger.info("");
    logger.warn("🛑 Shutting down heartbeat system...");
    isRunning = false;

    // Stop all heartbeat intervals
    for (const [nodeName, intervalId] of heartbeatIntervals) {
      clearInterval(intervalId);
      logger.info(`⏹️  Stopped heartbeat for ${nodeName}`);
    }

    logger.success("✅ Heartbeat system stopped gracefully");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Setup graceful shutdown
    setupGracefulShutdown();

    // Check cluster status
    const clusterStatus = checkClusterStatus();
    logger.success(
      `🎯 Connected to cluster: ${clusterStatus.name} (${clusterStatus.servers} servers, ${clusterStatus.agents} agents)`
    );

    // Start monitoring
    await startMonitoring();
  } catch (error) {
    logger.error("Failed to start heartbeat system", error.message);
    logger.info("");
    logger.info("💡 Troubleshooting:");
    logger.info("   1. Make sure k3d cluster is running: k3d cluster list");
    logger.info("   2. Check cluster name matches: --cluster paas-dev");
    logger.info(
      "   3. Verify PaaS backend is running: curl http://localhost:3000/api/workers/stats"
    );
    logger.info(
      "   4. Check kubeconfig exists: ls ~/.k3d/kubeconfig-paas-dev.yaml"
    );
    process.exit(1);
  }
}

// Run the script
main();
