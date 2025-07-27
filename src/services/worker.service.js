import { getKubernetesConfig } from "../config/kubernetes.js";
import { prisma } from "../config/database.js";
import logger from "../utils/logger.util.js";

/**
 * Kubernetes-Integrated Worker Node Management Service
 * Provides real-time cluster data synchronized with database records
 */

/**
 * Get all worker nodes with real-time Kubernetes data
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {string} options.status - Status filter
 * @param {boolean} options.isSchedulable - Schedulable status filter
 * @param {boolean} options.isReady - Ready status filter
 * @param {string} options.search - Search term
 * @param {string} options.sortBy - Sort field
 * @param {string} options.sortOrder - Sort order (asc, desc)
 * @returns {Promise<Object>} Worker nodes list with real-time data
 */
const getAllWorkerNodes = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      isSchedulable,
      isReady,
      search,
      sortBy = "name",
      sortOrder = "asc",
    } = options;

    // Get live cluster data
    const liveNodes = await getKubernetesNodes();

    // Sync with database and get enriched data
    const syncedNodes = await syncNodesWithDatabase(liveNodes);

    // Apply filters
    let filteredNodes = syncedNodes;

    if (status) {
      filteredNodes = filteredNodes.filter((node) => node.status === status);
    }

    if (typeof isSchedulable === "boolean") {
      filteredNodes = filteredNodes.filter(
        (node) => node.isSchedulable === isSchedulable
      );
    }

    if (typeof isReady === "boolean") {
      filteredNodes = filteredNodes.filter((node) => node.isReady === isReady);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (node) =>
          node.name.toLowerCase().includes(searchLower) ||
          node.hostname.toLowerCase().includes(searchLower) ||
          node.ipAddress.toLowerCase().includes(searchLower) ||
          node.cpuArchitecture.toLowerCase().includes(searchLower) ||
          node.operatingSystem.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    filteredNodes.sort((a, b) => {
      const aVal = a[sortBy] || "";
      const bVal = b[sortBy] || "";

      if (sortOrder === "desc") {
        return bVal.toString().localeCompare(aVal.toString());
      }
      return aVal.toString().localeCompare(bVal.toString());
    });

    // Apply pagination
    const total = filteredNodes.length;
    const skip = (page - 1) * limit;
    const paginatedNodes = filteredNodes.slice(skip, skip + parseInt(limit));

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    logger.info(
      `Retrieved ${paginatedNodes.length} worker nodes with live K8s data (page ${page}/${totalPages})`
    );

    return {
      data: paginatedNodes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  } catch (error) {
    logger.error("Error in getAllWorkerNodes service:", error);
    throw error;
  }
};

/**
 * Get worker node by ID or name directly from Kubernetes API
 * @param {string} nodeId - Worker node ID or name
 * @returns {Promise<Object|null>} Worker node with live data
 */
const getWorkerNodeById = async (nodeId) => {
  try {
    // Check if it's a database ID (CUID format) or node name
    const isCUID = /^c[a-z0-9]{24}$/i.test(nodeId);

    let nodeName = nodeId;

    // If it's a CUID, try to find the node name from database first
    if (isCUID) {
      const dbNode = await prisma.workerNode.findUnique({
        where: { id: nodeId },
        select: { name: true },
      });

      if (!dbNode) {
        logger.warn(`Worker node with ID ${nodeId} not found in database`);
        return null;
      }

      nodeName = dbNode.name;
    }

    // Get live Kubernetes data directly
    const liveNode = await getKubernetesNodeByName(nodeName);

    if (!liveNode) {
      logger.warn(`Worker node ${nodeName} not found in Kubernetes cluster`);
      return null;
    }

    // Parse and enrich the live node data
    const nodeData = parseKubernetesNode(liveNode);

    // Get current pods on this node for resource calculation
    const pods = await getPodsOnNode(nodeName);
    const currentPods = pods.length;

    // Calculate allocated resources from running pods
    let allocatedCPU = 0;
    let allocatedMemoryGB = 0;

    for (const pod of pods) {
      const containers = pod.spec?.containers || [];
      for (const container of containers) {
        const resources = container.resources || {};
        const requests = resources.requests || {};

        if (requests.cpu) {
          allocatedCPU += parseFloat(requests.cpu.replace("m", "")) / 1000;
        }
        if (requests.memory) {
          allocatedMemoryGB += parseResourceString(requests.memory);
        }
      }
    }

    // Get real-time utilization metrics from metrics API
    const nodeMetrics = await getNodeMetrics(nodeName);
    const utilizationData = parseNodeMetrics(
      nodeMetrics,
      liveNode.status?.capacity
    );

    // Create enriched node object with live data and metrics
    const enrichedNode = {
      // Generate a temporary ID for API consistency (not stored in DB)
      id: isCUID ? nodeId : `live-${nodeName}`,
      name: nodeData.name,
      hostname: nodeData.hostname,
      ipAddress: nodeData.ipAddress,
      architecture: nodeData.architecture,
      operatingSystem: nodeData.operatingSystem,
      cpuCores: nodeData.cpuCores,
      cpuArchitecture: nodeData.cpuArchitecture,
      totalMemory: nodeData.totalMemory,
      totalStorage: nodeData.totalStorage,
      allocatedCPU: allocatedCPU.toString(),
      allocatedMemory: allocatedMemoryGB.toString(),
      maxPods: nodeData.maxPods,
      currentPods,
      status: nodeData.isReady ? "ACTIVE" : "INACTIVE",
      isReady: nodeData.isReady,
      isSchedulable: nodeData.isSchedulable,
      labels: nodeData.labels,
      taints: nodeData.taints,
      kubeletVersion: nodeData.kubeletVersion,
      containerRuntime: nodeData.containerRuntime,
      kernelVersion: nodeData.kernelVersion,
      osImage: nodeData.osImage,
      lastHeartbeat: new Date(), // Live data timestamp
      createdAt: new Date(), // Live data timestamp
      updatedAt: new Date(), // Live data timestamp
      // Real-time utilization metrics
      metrics: {
        cpuUtilization: utilizationData.cpuUtilization,
        memoryUtilization: utilizationData.memoryUtilization,
        cpuUsage: utilizationData.cpuUsage,
        memoryUsage: utilizationData.memoryUsage,
        metricsTimestamp: utilizationData.timestamp,
        metricsAvailable: nodeMetrics !== null,
      },
      liveData: {
        conditions: liveNode.status?.conditions || [],
        capacity: liveNode.status?.capacity || {},
        allocatable: liveNode.status?.allocatable || {},
        nodeInfo: liveNode.status?.nodeInfo || {},
        addresses: liveNode.status?.addresses || [],
      },
    };

    logger.info(
      `Retrieved worker node directly from Kubernetes: ${enrichedNode.name}`
    );

    return enrichedNode;
  } catch (error) {
    logger.error("Error getting worker node from Kubernetes:", error);
    throw error;
  }
};

/**
 * Helper function to parse memory/storage strings (e.g., "32Gi", "1Ti", "500Mi")
 * @param {string} resourceStr - Resource string to parse
 * @returns {number} Resource value in GB
 */
const parseResourceString = (resourceStr) => {
  if (!resourceStr || resourceStr === "0") return 0;

  const match = resourceStr.match(/^(\d+(?:\.\d+)?)(.*)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || "").toLowerCase();

  // Convert to GB for consistency
  switch (unit) {
    case "ki":
      return value / 1024 / 1024; // KiB to GB
    case "mi":
      return value / 1024; // MiB to GB
    case "gi":
      return value; // GiB to GB
    case "ti":
      return value * 1024; // TiB to GB
    case "k":
      return value / 1000 / 1000; // KB to GB
    case "m":
      return value / 1000; // MB to GB
    case "g":
      return value; // GB to GB
    case "t":
      return value * 1000; // TB to GB
    default:
      return value; // Assume GB if no unit
  }
};

/**
 * Get worker node by name with real-time data
 * @param {string} nodeName - Worker node name
 * @returns {Promise<Object|null>} Worker node with live data
 */
const getWorkerNodeByName = async (nodeName) => {
  return await getWorkerNodeById(nodeName);
};

/**
 * Sync cluster state - updates database with current Kubernetes state
 * @returns {Promise<Object>} Sync results
 */
const syncClusterState = async () => {
  try {
    logger.info("Starting cluster state synchronization...");

    // Get live cluster data
    const liveNodes = await getKubernetesNodes();

    // Sync with database
    const syncResults = await syncNodesWithDatabase(liveNodes);

    // Get sync statistics
    const stats = {
      totalLiveNodes: liveNodes.length,
      syncedNodes: syncResults.length,
      timestamp: new Date(),
    };

    logger.info(
      `Cluster sync completed: ${stats.syncedNodes} nodes synchronized`
    );

    return {
      success: true,
      stats,
      nodes: syncResults,
    };
  } catch (error) {
    logger.error("Error syncing cluster state:", error);
    throw error;
  }
};

/**
 * Get real-time cluster statistics
 * @returns {Promise<Object>} Live cluster statistics
 */
const getClusterStats = async () => {
  try {
    // Get live nodes data
    const liveNodes = await getKubernetesNodes();
    const syncedNodes = await syncNodesWithDatabase(liveNodes);

    // Calculate real-time statistics
    const totalNodes = syncedNodes.length;
    const readyNodes = syncedNodes.filter((node) => node.isReady).length;
    const schedulableNodes = syncedNodes.filter(
      (node) => node.isSchedulable
    ).length;

    // Status distribution
    const statusCounts = syncedNodes.reduce((acc, node) => {
      acc[node.status] = (acc[node.status] || 0) + 1;
      return acc;
    }, {});

    // Helper function to parse memory/storage strings (e.g., "32Gi", "1Ti", "500Mi")
    const parseResourceString = (resourceStr) => {
      if (!resourceStr || resourceStr === "0") return 0;

      const match = resourceStr.match(/^(\d+(?:\.\d+)?)(.*)?$/);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = (match[2] || "").toLowerCase();

      // Convert to GB for consistency
      switch (unit) {
        case "ki":
          return value / 1024 / 1024; // KiB to GB
        case "mi":
          return value / 1024; // MiB to GB
        case "gi":
          return value; // GiB to GB
        case "ti":
          return value * 1024; // TiB to GB
        case "k":
          return value / 1000 / 1000; // KB to GB
        case "m":
          return value / 1000; // MB to GB
        case "g":
          return value; // GB to GB
        case "t":
          return value * 1000; // TB to GB
        default:
          return value; // Assume GB if no unit
      }
    };

    // Resource calculations with proper unit parsing
    const totalResources = syncedNodes.reduce(
      (acc, node) => {
        acc.cpu += parseInt(node.cpuCores) || 0;
        acc.memory += parseResourceString(node.totalMemory);
        acc.pods += parseInt(node.maxPods) || 0;
        return acc;
      },
      { cpu: 0, memory: 0, pods: 0 }
    );

    const allocatedResources = syncedNodes.reduce(
      (acc, node) => {
        acc.cpu += parseFloat(node.allocatedCPU) || 0;
        acc.memory += parseResourceString(node.allocatedMemory);
        acc.pods += parseInt(node.currentPods) || 0;
        return acc;
      },
      { cpu: 0, memory: 0, pods: 0 }
    );

    // Calculate utilization percentages
    const cpuUtilization =
      totalResources.cpu > 0
        ? ((allocatedResources.cpu / totalResources.cpu) * 100).toFixed(2)
        : 0;

    const memoryUtilization =
      totalResources.memory > 0
        ? ((allocatedResources.memory / totalResources.memory) * 100).toFixed(2)
        : 0;

    const podUtilization =
      totalResources.pods > 0
        ? ((allocatedResources.pods / totalResources.pods) * 100).toFixed(2)
        : 0;

    const stats = {
      cluster: {
        totalNodes,
        readyNodes,
        schedulableNodes,
        lastSync: new Date(),
      },
      nodeStatus: {
        active: statusCounts.ACTIVE || 0,
        inactive: statusCounts.INACTIVE || 0,
        maintenance: statusCounts.MAINTENANCE || 0,
        pending: statusCounts.PENDING || 0,
        notReady: statusCounts.NOT_READY || 0,
      },
      resources: {
        cpu: {
          total: totalResources.cpu,
          allocated: allocatedResources.cpu,
          utilization: parseFloat(cpuUtilization),
        },
        memory: {
          total: totalResources.memory,
          allocated: allocatedResources.memory,
          utilization: parseFloat(memoryUtilization),
        },
        pods: {
          maxTotal: totalResources.pods,
          currentTotal: allocatedResources.pods,
          utilization: parseFloat(podUtilization),
        },
      },
    };

    logger.info("Retrieved real-time cluster statistics");

    return stats;
  } catch (error) {
    logger.error("Error getting cluster statistics:", error);
    throw error;
  }
};

/**
 * Get online worker nodes (from live cluster data)
 * @returns {Promise<Array>} Online worker nodes
 */
const getOnlineWorkerNodes = async () => {
  try {
    const liveNodes = await getKubernetesNodes();
    const syncedNodes = await syncNodesWithDatabase(liveNodes);

    const onlineNodes = syncedNodes.filter(
      (node) => node.isReady && node.isSchedulable && node.status === "ACTIVE"
    );

    logger.info(
      `Retrieved ${onlineNodes.length} online worker nodes from live cluster`
    );

    return onlineNodes;
  } catch (error) {
    logger.error("Error getting online worker nodes:", error);
    throw error;
  }
};

/**
 * Get offline worker nodes (from live cluster data)
 * @returns {Promise<Array>} Offline worker nodes
 */
const getOfflineWorkerNodes = async () => {
  try {
    const liveNodes = await getKubernetesNodes();
    const syncedNodes = await syncNodesWithDatabase(liveNodes);

    const offlineNodes = syncedNodes.filter(
      (node) => !node.isReady || !node.isSchedulable || node.status !== "ACTIVE"
    );

    logger.info(
      `Retrieved ${offlineNodes.length} offline worker nodes from live cluster`
    );

    return offlineNodes;
  } catch (error) {
    logger.error("Error getting offline worker nodes:", error);
    throw error;
  }
};

/**
 * Cordon node (make unschedulable)
 * @param {string} nodeId - Node ID or name
 * @returns {Promise<Object>} Updated node
 */
const cordonNode = async (nodeId) => {
  try {
    const node = await getWorkerNodeById(nodeId);
    if (!node) {
      throw new Error(`Worker node not found: ${nodeId}`);
    }

    // Cordon node in Kubernetes
    await updateKubernetesNodeSchedulable(node.name, false);

    // Update database
    const updatedNode = await prisma.workerNode.update({
      where: { id: node.id },
      data: {
        isSchedulable: false,
        updatedAt: new Date(),
      },
    });

    logger.info(`Cordoned worker node: ${node.name}`);

    return updatedNode;
  } catch (error) {
    logger.error("Error cordoning worker node:", error);
    throw error;
  }
};

/**
 * Uncordon node (make schedulable)
 * @param {string} nodeId - Node ID or name
 * @returns {Promise<Object>} Updated node
 */
const uncordonNode = async (nodeId) => {
  try {
    const node = await getWorkerNodeById(nodeId);
    if (!node) {
      throw new Error(`Worker node not found: ${nodeId}`);
    }

    // Uncordon node in Kubernetes
    await updateKubernetesNodeSchedulable(node.name, true);

    // Update database
    const updatedNode = await prisma.workerNode.update({
      where: { id: node.id },
      data: {
        isSchedulable: true,
        updatedAt: new Date(),
      },
    });

    logger.info(`Uncordoned worker node: ${node.name}`);

    return updatedNode;
  } catch (error) {
    logger.error("Error uncordoning worker node:", error);
    throw error;
  }
};

/**
 * Drain node (evict all pods)
 * @param {string} nodeId - Node ID or name
 * @param {Object} options - Drain options
 * @returns {Promise<Object>} Drain result
 */
const drainNode = async (nodeId, options = {}) => {
  try {
    const node = await getWorkerNodeById(nodeId);
    if (!node) {
      throw new Error(`Worker node not found: ${nodeId}`);
    }

    const {
      gracePeriodSeconds = 30,
      timeout = 300,
      force = false,
      deleteLocalData = false,
    } = options;

    // First cordon the node
    await cordonNode(nodeId);

    // Get all pods on the node
    const pods = await getPodsOnNode(node.name);

    logger.info(`Draining ${pods.length} pods from node: ${node.name}`);

    // Evict pods
    const evictionResults = [];
    for (const pod of pods) {
      try {
        await evictPod(pod.metadata.name, pod.metadata.namespace, {
          gracePeriodSeconds,
          deleteLocalData,
        });
        evictionResults.push({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          status: "evicted",
        });
      } catch (error) {
        evictionResults.push({
          name: pod.metadata.name,
          namespace: pod.metadata.namespace,
          status: "failed",
          error: error.message,
        });
      }
    }

    // Update node status
    await prisma.workerNode.update({
      where: { id: node.id },
      data: {
        status: "MAINTENANCE",
        currentPods: 0,
        updatedAt: new Date(),
      },
    });

    logger.info(`Drained worker node: ${node.name}`);

    return {
      node: node.name,
      podsEvicted: evictionResults.filter((r) => r.status === "evicted").length,
      podsFailed: evictionResults.filter((r) => r.status === "failed").length,
      evictionResults,
    };
  } catch (error) {
    logger.error("Error draining worker node:", error);
    throw error;
  }
};

// ============================================================================
// KUBERNETES API INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Get all nodes from Kubernetes cluster
 * @returns {Promise<Array>} Array of Kubernetes nodes
 */
const getKubernetesNodes = async () => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();
    const response = await coreV1Api.listNode();

    return response.body.items || [];
  } catch (error) {
    logger.error("Error getting Kubernetes nodes:", error);
    throw error;
  }
};

/**
 * Get specific node from Kubernetes cluster
 * @param {string} nodeName - Node name
 * @returns {Promise<Object|null>} Kubernetes node or null
 */
const getKubernetesNodeByName = async (nodeName) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();
    const response = await coreV1Api.readNode(nodeName);

    return response.body;
  } catch (error) {
    if (error.response?.statusCode === 404) {
      return null;
    }
    logger.error(`Error getting Kubernetes node ${nodeName}:`, error);
    throw error;
  }
};

/**
 * Update node schedulable status in Kubernetes
 * @param {string} nodeName - Node name
 * @param {boolean} schedulable - Whether node should be schedulable
 * @returns {Promise<Object>} Updated node
 */
const updateKubernetesNodeSchedulable = async (nodeName, schedulable) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();

    const patch = {
      spec: {
        unschedulable: !schedulable,
      },
    };

    const response = await coreV1Api.patchNode(
      nodeName,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        headers: { "Content-Type": "application/strategic-merge-patch+json" },
      }
    );

    return response.body;
  } catch (error) {
    logger.error(`Error updating node schedulable status ${nodeName}:`, error);
    throw error;
  }
};

/**
 * Get pods running on a specific node
 * @param {string} nodeName - Node name
 * @returns {Promise<Array>} Array of pods
 */
const getPodsOnNode = async (nodeName) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();
    const response = await coreV1Api.listPodForAllNamespaces(
      undefined,
      undefined,
      `spec.nodeName=${nodeName}`
    );

    return response.body.items || [];
  } catch (error) {
    logger.error(`Error getting pods on node ${nodeName}:`, error);
    throw error;
  }
};

/**
 * Evict a pod from a node
 * @param {string} podName - Pod name
 * @param {string} namespace - Pod namespace
 * @param {Object} options - Eviction options
 * @returns {Promise<Object>} Eviction result
 */
const evictPod = async (podName, namespace, options = {}) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();

    const eviction = {
      apiVersion: "policy/v1",
      kind: "Eviction",
      metadata: {
        name: podName,
        namespace: namespace,
      },
      deleteOptions: {
        gracePeriodSeconds: options.gracePeriodSeconds || 30,
      },
    };

    const response = await coreV1Api.createNamespacedPodEviction(
      podName,
      namespace,
      eviction
    );

    return response.body;
  } catch (error) {
    logger.error(
      `Error evicting pod ${podName} from namespace ${namespace}:`,
      error
    );
    throw error;
  }
};

/**
 * Get node metrics from Kubernetes metrics API
 * @param {string} nodeName - Node name
 * @returns {Promise<Object|null>} Node metrics or null
 */
const getNodeMetrics = async (nodeName) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      logger.warn("Kubernetes client not ready, skipping metrics");
      return null;
    }

    // Try to get metrics API client
    let metricsApi;
    try {
      metricsApi = k8sConfig.getMetricsV1beta1Api();
    } catch (error) {
      logger.warn(
        "Metrics API not available, skipping metrics:",
        error.message
      );
      return null;
    }

    // Fetch node metrics using CustomObjectsApi (nodes are cluster-scoped)
    const response = await metricsApi.getClusterCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      "nodes",
      nodeName
    );
    return response.body;
  } catch (error) {
    if (error.response?.statusCode === 404) {
      logger.warn(
        `Node metrics not found for ${nodeName} - metrics server may not be installed`
      );
      return null;
    }
    logger.warn(`Error getting node metrics for ${nodeName}:`, error.message);
    return null;
  }
};

/**
 * Get all node metrics from Kubernetes metrics API
 * @returns {Promise<Array>} Array of node metrics
 */
const getAllNodeMetrics = async () => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      logger.warn("Kubernetes client not ready, skipping metrics");
      return [];
    }

    // Try to get metrics API client
    let metricsApi;
    try {
      metricsApi = k8sConfig.getMetricsV1beta1Api();
    } catch (error) {
      logger.warn(
        "Metrics API not available, skipping metrics:",
        error.message
      );
      return [];
    }

    // Fetch all node metrics using CustomObjectsApi
    const response = await metricsApi.listClusterCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      "nodes"
    );
    return response.body.items || [];
  } catch (error) {
    logger.warn("Error getting all node metrics:", error.message);
    return [];
  }
};

/**
 * Parse node metrics to extract CPU and memory utilization
 * @param {Object} nodeMetrics - Node metrics from Kubernetes API
 * @param {Object} nodeCapacity - Node capacity from Kubernetes API
 * @returns {Object} Parsed utilization data
 */
const parseNodeMetrics = (nodeMetrics, nodeCapacity) => {
  if (!nodeMetrics || !nodeMetrics.usage) {
    return {
      cpuUtilization: null,
      memoryUtilization: null,
      cpuUsage: null,
      memoryUsage: null,
    };
  }

  const usage = nodeMetrics.usage;
  const capacity = nodeCapacity || {};

  // Parse CPU usage (from nanocores to cores)
  const cpuUsageNano = parseInt(usage.cpu?.replace("n", "") || "0");
  const cpuUsageCores = cpuUsageNano / 1000000000; // Convert nanocores to cores

  // Parse memory usage (from bytes to GB)
  const memoryUsageBytes =
    parseInt(usage.memory?.replace("Ki", "") || "0") * 1024; // Ki to bytes
  const memoryUsageGB = memoryUsageBytes / (1024 * 1024 * 1024); // Bytes to GB

  // Calculate utilization percentages
  const totalCpuCores = parseInt(capacity.cpu || "0");
  const totalMemoryKi = parseInt(capacity.memory?.replace("Ki", "") || "0");
  const totalMemoryGB = (totalMemoryKi * 1024) / (1024 * 1024 * 1024);

  const cpuUtilization =
    totalCpuCores > 0
      ? ((cpuUsageCores / totalCpuCores) * 100).toFixed(2)
      : null;
  const memoryUtilization =
    totalMemoryGB > 0
      ? ((memoryUsageGB / totalMemoryGB) * 100).toFixed(2)
      : null;

  return {
    cpuUtilization: cpuUtilization ? parseFloat(cpuUtilization) : null,
    memoryUtilization: memoryUtilization ? parseFloat(memoryUtilization) : null,
    cpuUsage: cpuUsageCores.toFixed(3),
    memoryUsage: memoryUsageGB.toFixed(2),
    timestamp: nodeMetrics.timestamp,
  };
};

/**
 * Sync Kubernetes nodes with database
 * @param {Array} liveNodes - Live Kubernetes nodes
 * @returns {Promise<Array>} Synced nodes with enriched data
 */
const syncNodesWithDatabase = async (liveNodes) => {
  try {
    const syncedNodes = [];

    // Get all node metrics at once for efficiency
    const allNodeMetrics = await getAllNodeMetrics();
    const metricsMap = new Map();
    allNodeMetrics.forEach((metric) => {
      if (metric.metadata?.name) {
        metricsMap.set(metric.metadata.name, metric);
      }
    });

    for (const liveNode of liveNodes) {
      const nodeData = parseKubernetesNode(liveNode);

      // Find or create database record
      let dbNode = await prisma.workerNode.findUnique({
        where: { name: nodeData.name },
      });

      if (!dbNode) {
        // Create new database record
        dbNode = await prisma.workerNode.create({
          data: {
            ...nodeData,
            status: "ACTIVE",
            lastHeartbeat: new Date(),
            lastHealthCheck: new Date(),
          },
        });
        logger.info(`Created new worker node record: ${dbNode.name}`);
      } else {
        // Update existing record with live data
        dbNode = await prisma.workerNode.update({
          where: { id: dbNode.id },
          data: {
            ...nodeData,
            lastHeartbeat: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      // Enrich with live data and metrics
      const nodeMetrics = metricsMap.get(nodeData.name);
      const enrichedNode = await enrichNodeWithLiveData(
        dbNode,
        liveNode,
        nodeMetrics
      );
      syncedNodes.push(enrichedNode);
    }

    return syncedNodes;
  } catch (error) {
    logger.error("Error syncing nodes with database:", error);
    throw error;
  }
};

/**
 * Parse Kubernetes node to database format
 * @param {Object} k8sNode - Kubernetes node object
 * @returns {Object} Parsed node data
 */
const parseKubernetesNode = (k8sNode) => {
  const metadata = k8sNode.metadata || {};
  const spec = k8sNode.spec || {};
  const status = k8sNode.status || {};

  // Extract node info
  const nodeInfo = status.nodeInfo || {};
  const addresses = status.addresses || [];
  const conditions = status.conditions || [];
  const capacity = status.capacity || {};
  const allocatable = status.allocatable || {};

  // Get IP address
  const internalIP =
    addresses.find((addr) => addr.type === "InternalIP")?.address || "";
  const hostname =
    addresses.find((addr) => addr.type === "Hostname")?.address ||
    metadata.name;

  // Get ready condition
  const readyCondition = conditions.find((cond) => cond.type === "Ready");
  const isReady = readyCondition?.status === "True";

  // Parse resources
  const cpuCores = parseInt(capacity.cpu) || 0;
  const totalMemory = capacity.memory || "0";
  const totalStorage = capacity["ephemeral-storage"] || "0";
  const maxPods = parseInt(capacity.pods) || 110;

  return {
    name: metadata.name,
    hostname: hostname,
    ipAddress: internalIP,
    cpuCores,
    cpuArchitecture: nodeInfo.architecture || "amd64",
    totalMemory,
    totalStorage,
    architecture: nodeInfo.architecture || "amd64",
    operatingSystem: nodeInfo.operatingSystem || "linux",
    isReady,
    isSchedulable: !spec.unschedulable,
    maxPods,
    labels: metadata.labels || {},
    taints: spec.taints || [],
    kubeletVersion: nodeInfo.kubeletVersion,
    containerRuntime: nodeInfo.containerRuntimeVersion,
    kernelVersion: nodeInfo.kernelVersion,
    osImage: nodeInfo.osImage,
  };
};

/**
 * Enrich database node with live Kubernetes data
 * @param {Object} dbNode - Database node record
 * @param {Object} liveNode - Live Kubernetes node
 * @returns {Promise<Object>} Enriched node data
 */
const enrichNodeWithLiveData = async (dbNode, liveNode, nodeMetrics = null) => {
  try {
    const liveData = parseKubernetesNode(liveNode);

    // Get current pods on this node
    const pods = await getPodsOnNode(dbNode.name);
    const currentPods = pods.length;

    // Helper function to parse memory/storage strings (e.g., "32Gi", "1Ti", "500Mi")
    const parseResourceString = (resourceStr) => {
      if (!resourceStr || resourceStr === "0") return 0;

      const match = resourceStr.match(/^(\d+(?:\.\d+)?)(.*)?$/);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = (match[2] || "").toLowerCase();

      // Convert to GB for consistency
      switch (unit) {
        case "ki":
          return value / 1024 / 1024; // KiB to GB
        case "mi":
          return value / 1024; // MiB to GB
        case "gi":
          return value; // GiB to GB
        case "ti":
          return value * 1024; // TiB to GB
        case "k":
          return value / 1000 / 1000; // KB to GB
        case "m":
          return value / 1000; // MB to GB
        case "g":
          return value; // GB to GB
        case "t":
          return value * 1000; // TB to GB
        default:
          return value; // Assume GB if no unit
      }
    };

    // Calculate allocated resources from running pods with proper unit parsing
    let allocatedCPU = 0;
    let allocatedMemoryGB = 0;

    for (const pod of pods) {
      const containers = pod.spec?.containers || [];
      for (const container of containers) {
        const resources = container.resources || {};
        const requests = resources.requests || {};

        if (requests.cpu) {
          allocatedCPU += parseFloat(requests.cpu.replace("m", "")) / 1000;
        }
        if (requests.memory) {
          allocatedMemoryGB += parseResourceString(requests.memory);
        }
      }
    }

    // Get real-time utilization metrics if not provided
    if (!nodeMetrics) {
      nodeMetrics = await getNodeMetrics(dbNode.name);
    }
    const utilizationData = parseNodeMetrics(
      nodeMetrics,
      liveNode.status?.capacity
    );

    return {
      ...dbNode,
      ...liveData,
      currentPods,
      allocatedCPU: allocatedCPU.toString(),
      allocatedMemory: allocatedMemoryGB.toString(),
      // Real-time utilization metrics
      metrics: {
        cpuUtilization: utilizationData.cpuUtilization,
        memoryUtilization: utilizationData.memoryUtilization,
        cpuUsage: utilizationData.cpuUsage,
        memoryUsage: utilizationData.memoryUsage,
        metricsTimestamp: utilizationData.timestamp,
        metricsAvailable: nodeMetrics !== null,
      },
      liveData: {
        conditions: liveNode.status?.conditions || [],
        capacity: liveNode.status?.capacity || {},
        allocatable: liveNode.status?.allocatable || {},
        nodeInfo: liveNode.status?.nodeInfo || {},
        addresses: liveNode.status?.addresses || [],
      },
    };
  } catch (error) {
    logger.error("Error enriching node with live data:", error);
    return dbNode;
  }
};

export {
  getAllWorkerNodes,
  getWorkerNodeById,
  getWorkerNodeByName,
  syncClusterState,
  getClusterStats,
  getOnlineWorkerNodes,
  getOfflineWorkerNodes,
  cordonNode,
  uncordonNode,
  drainNode,
};
