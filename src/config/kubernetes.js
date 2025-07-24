import * as k8s from "@kubernetes/client-node";
import logger from "../utils/logger.util.js";

/**
 * Kubernetes Client Configuration
 * Handles connection to K8s cluster and provides API clients
 */
class KubernetesConfig {
  constructor() {
    this.kubernetesEnabled = process.env.KUBERNETES_ENABLED === "true";
    this.kc = new k8s.KubeConfig();
    this.coreV1Api = null;
    this.appsV1Api = null;
    this.networkingV1Api = null;
    this.isConnected = false;
    this.mockMode = !this.kubernetesEnabled;
  }

  /**
   * Initialize Kubernetes connection
   */
  async initialize() {
    try {
      if (this.mockMode) {
        logger.warn(
          "⚠️  Kubernetes client running in mock mode (Kubernetes disabled)"
        );
        this.isConnected = false;
        return true;
      }

      // Load kubeconfig from default locations or environment
      if (process.env.KUBECONFIG_PATH) {
        this.kc.loadFromFile(process.env.KUBECONFIG_PATH);
        logger.info(`Loaded kubeconfig from: ${process.env.KUBECONFIG_PATH}`);
      } else if (process.env.NODE_ENV === "production") {
        // In production (inside cluster), load from service account
        this.kc.loadFromCluster();
        logger.info("Loaded kubeconfig from cluster service account");
      } else {
        // Development: load from default kubeconfig
        this.kc.loadFromDefault();
        logger.info("Loaded kubeconfig from default location");
      }

      // Initialize API clients
      this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
      this.networkingV1Api = this.kc.makeApiClient(k8s.NetworkingV1Api);

      // Test connection
      await this.testConnection();
      this.isConnected = true;

      logger.info("Kubernetes client initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize Kubernetes client:", error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Test Kubernetes connection
   */
  async testConnection() {
    try {
      const response = await this.coreV1Api.listNamespace();
      logger.info(
        `Connected to Kubernetes cluster with ${response.body.items.length} namespaces`
      );
      return true;
    } catch (error) {
      logger.error("Kubernetes connection test failed:", error);
      throw new Error(`Kubernetes connection failed: ${error.message}`);
    }
  }

  /**
   * Get Core V1 API client
   */
  getCoreV1Api() {
    if (!this.isConnected || !this.coreV1Api) {
      throw new Error(
        "Kubernetes client not initialized. Call initialize() first."
      );
    }
    return this.coreV1Api;
  }

  /**
   * Get Apps V1 API client
   */
  getAppsV1Api() {
    if (!this.isConnected || !this.appsV1Api) {
      throw new Error(
        "Kubernetes client not initialized. Call initialize() first."
      );
    }
    return this.appsV1Api;
  }

  /**
   * Get Networking V1 API client
   */
  getNetworkingV1Api() {
    if (!this.isConnected || !this.networkingV1Api) {
      throw new Error(
        "Kubernetes client not initialized. Call initialize() first."
      );
    }
    return this.networkingV1Api;
  }

  /**
   * Get current context info
   */
  getCurrentContext() {
    return {
      currentContext: this.kc.getCurrentContext(),
      cluster: this.kc.getCurrentCluster(),
      user: this.kc.getCurrentUser(),
    };
  }

  /**
   * Check if client is connected
   */
  isReady() {
    return this.isConnected;
  }

  /**
   * Reconnect to cluster
   */
  async reconnect() {
    logger.info("Attempting to reconnect to Kubernetes cluster...");
    this.isConnected = false;
    return await this.initialize();
  }
}

// Create singleton instance
const kubernetesConfig = new KubernetesConfig();

/**
 * Initialize Kubernetes client on module load
 * This will be called when the server starts
 */
export const initializeKubernetes = async () => {
  try {
    await kubernetesConfig.initialize();
    return kubernetesConfig;
  } catch (error) {
    logger.error("Failed to initialize Kubernetes on startup:", error);
    // Don't throw error on startup - allow server to start without K8s
    // Services will handle K8s unavailability gracefully
    return null;
  }
};

/**
 * Get Kubernetes configuration instance
 */
export const getKubernetesConfig = () => {
  return kubernetesConfig;
};

/**
 * Kubernetes utility functions
 */
export const kubernetesUtils = {
  /**
   * Generate customer namespace name
   */
  generateNamespaceName(userId) {
    const prefix = process.env.K8S_NAMESPACE_PREFIX || "customer-";
    return `${prefix}${userId.substring(0, 8).toLowerCase()}`;
  },

  /**
   * Generate pod name
   */
  generatePodName(serviceName, userId) {
    const userPrefix = userId.substring(0, 8).toLowerCase();
    return `${serviceName}-${userPrefix}-${Date.now()}`;
  },

  /**
   * Generate service name
   */
  generateServiceName(serviceName, userId) {
    const userPrefix = userId.substring(0, 8).toLowerCase();
    return `${serviceName}-svc-${userPrefix}`;
  },

  /**
   * Generate ingress name
   */
  generateIngressName(serviceName, userId) {
    const userPrefix = userId.substring(0, 8).toLowerCase();
    return `${serviceName}-ingress-${userPrefix}`;
  },

  /**
   * Generate external URL
   */
  generateExternalUrl(subdomain, serviceName) {
    const domain = process.env.K8S_CLUSTER_DOMAIN || "localhost";
    return `https://${subdomain}.${serviceName}.${domain}`;
  },

  /**
   * Parse resource requirements
   */
  parseResourceLimits(limits = null) {
    const defaultLimits = {
      cpu: "1",
      memory: "1Gi",
    };

    if (!limits) {
      return defaultLimits;
    }

    try {
      const parsed = typeof limits === "string" ? JSON.parse(limits) : limits;
      return {
        cpu: parsed.cpu || defaultLimits.cpu,
        memory: parsed.memory || defaultLimits.memory,
      };
    } catch (error) {
      logger.warn("Failed to parse resource limits, using defaults:", error);
      return defaultLimits;
    }
  },

  /**
   * Validate Kubernetes object name
   */
  validateK8sName(name) {
    // K8s names must be lowercase alphanumeric with hyphens
    const k8sNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    return k8sNameRegex.test(name) && name.length <= 63;
  },

  /**
   * Sanitize name for Kubernetes
   */
  sanitizeK8sName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 63);
  },
};

export default kubernetesConfig;
