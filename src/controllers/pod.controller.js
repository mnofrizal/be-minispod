import { podService } from "../services/pod.service.js";
import { templateParser } from "../templates/template.parser.js";
import { prisma } from "../config/database.js";
import { success, error } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";
import { getKubernetesConfig } from "../config/kubernetes.js";

/**
 * Pod Controller - Handle Kubernetes pod operations
 */
export const podController = {
  /**
   * Get all pods (Admin only)
   * @route GET /api/v1/pods/admin/all
   * @access Private (Admin only)
   */
  async getAllPods(req, res) {
    try {
      const { page, limit, status, serviceName, userId, workerNode } =
        req.query;

      logger.info(`Admin getting all pods - User: ${req.user.email}`);

      // Build where clause for filtering
      const whereClause = {
        ...(status && { status }),
        ...(serviceName && {
          subscription: {
            service: {
              name: serviceName,
            },
          },
        }),
        ...(userId && {
          subscription: {
            userId,
          },
        }),
        ...(workerNode && {
          workerNodeName: workerNode,
        }),
      };

      const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 10);
      const take = parseInt(limit) || 10;

      const [serviceInstances, total] = await Promise.all([
        prisma.serviceInstance.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            subscription: {
              include: {
                service: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    dockerImage: true,
                    category: true,
                    monthlyPrice: true,
                    variant: true,
                    variantDisplayName: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                  },
                },
              },
            },
          },
        }),
        prisma.serviceInstance.count({ where: whereClause }),
      ]);

      // Get real-time status and worker node info for each pod
      const podsWithStatus = await Promise.all(
        serviceInstances.map(async (instance) => {
          try {
            const status = await podService.getPodStatus(instance.id);

            // Get worker node information
            let workerNodeInfo = null;
            try {
              const k8sConfig = getKubernetesConfig();
              if (k8sConfig.isReady()) {
                const coreV1Api = k8sConfig.getCoreV1Api();

                // Get pods to find which node they're running on
                const pods = await coreV1Api.listNamespacedPod(
                  instance.namespace,
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  `app=${instance.podName}`
                );

                if (pods.body.items.length > 0) {
                  const pod = pods.body.items[0];
                  const nodeName = pod.spec.nodeName;

                  if (nodeName) {
                    // Get node details
                    const node = await coreV1Api.readNode(nodeName);
                    const nodeInfo = node.body;

                    workerNodeInfo = {
                      nodeName: nodeName,
                      nodeIP: nodeInfo.status.addresses?.find(
                        (addr) => addr.type === "InternalIP"
                      )?.address,
                      architecture: nodeInfo.status.nodeInfo?.architecture,
                      osImage: nodeInfo.status.nodeInfo?.osImage,
                      kubeletVersion: nodeInfo.status.nodeInfo?.kubeletVersion,
                      ready:
                        nodeInfo.status.conditions?.find(
                          (c) => c.type === "Ready"
                        )?.status === "True",
                      allocatable: {
                        cpu: nodeInfo.status.allocatable?.cpu,
                        memory: nodeInfo.status.allocatable?.memory,
                        pods: nodeInfo.status.allocatable?.pods,
                      },
                    };
                  }
                }
              }
            } catch (nodeError) {
              logger.warn(
                `Failed to get worker node info for pod ${instance.id}:`,
                nodeError
              );
            }

            return {
              ...instance,
              realTimeStatus: status,
              workerNode: workerNodeInfo,
            };
          } catch (error) {
            logger.warn(`Failed to get status for pod ${instance.id}:`, error);
            return {
              ...instance,
              realTimeStatus: { status: "UNKNOWN", message: error.message },
              workerNode: null,
            };
          }
        })
      );

      // Calculate statistics
      const stats = {
        total,
        running: podsWithStatus.filter(
          (p) => p.realTimeStatus?.status === "RUNNING"
        ).length,
        pending: podsWithStatus.filter(
          (p) => p.realTimeStatus?.status === "PENDING"
        ).length,
        failed: podsWithStatus.filter(
          (p) => p.realTimeStatus?.status === "FAILED"
        ).length,
        stopped: podsWithStatus.filter(
          (p) => p.realTimeStatus?.status === "STOPPED"
        ).length,
      };

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            pods: podsWithStatus,
            statistics: stats,
            pagination: {
              page: parseInt(page) || 1,
              limit: take,
              total,
              totalPages: Math.ceil(total / take),
            },
          },
          "All pods retrieved successfully"
        )
      );
    } catch (err) {
      logger.error("Error getting all pods:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve all pods"));
    }
  },

  /**
   * Get user pods
   * @route GET /api/v1/pods
   * @access Private
   */
  async getUserPods(req, res) {
    try {
      const userId = req.user.id;
      const { page, limit, status, serviceName } = req.query;

      logger.info(`Getting pods for user ${userId}`);

      // Get user's service instances (pods)
      const whereClause = {
        subscription: {
          userId,
        },
        ...(status && { status }),
        ...(serviceName && {
          subscription: {
            service: {
              name: serviceName,
            },
          },
        }),
      };

      const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 10);
      const take = parseInt(limit) || 10;

      const [serviceInstances, total] = await Promise.all([
        prisma.serviceInstance.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            subscription: {
              include: {
                service: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    dockerImage: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
        prisma.serviceInstance.count({ where: whereClause }),
      ]);

      // Get real-time status for each pod
      const podsWithStatus = await Promise.all(
        serviceInstances.map(async (instance) => {
          try {
            const status = await podService.getPodStatus(instance.id);
            return {
              ...instance,
              realTimeStatus: status,
            };
          } catch (error) {
            logger.warn(`Failed to get status for pod ${instance.id}:`, error);
            return {
              ...instance,
              realTimeStatus: { status: "UNKNOWN", message: error.message },
            };
          }
        })
      );

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            pods: podsWithStatus,
            pagination: {
              page: parseInt(page) || 1,
              limit: take,
              total,
              totalPages: Math.ceil(total / take),
            },
          },
          "Pods retrieved successfully"
        )
      );
    } catch (err) {
      logger.error("Error getting user pods:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve pods"));
    }
  },

  /**
   * Get pod details
   * @route GET /api/v1/pods/:id
   * @access Private
   */
  async getPodDetails(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Getting pod details ${id} for user ${userId}`);

      // Get service instance with subscription details
      const serviceInstance = await prisma.serviceInstance.findFirst({
        where: {
          id,
          subscription: {
            userId,
          },
        },
        include: {
          subscription: {
            include: {
              service: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              usageMetrics: {
                orderBy: { recordedAt: "desc" },
                take: 10,
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // Get real-time pod status
      const realTimeStatus = await podService.getPodStatus(serviceInstance.id);

      // Parse deployment configuration
      let deploymentConfig = {};
      try {
        deploymentConfig = JSON.parse(serviceInstance.deploymentConfig || "{}");
      } catch (parseError) {
        logger.warn("Failed to parse deployment config:", parseError);
      }

      const podDetails = {
        ...serviceInstance,
        realTimeStatus,
        deploymentConfig,
        usageMetrics: serviceInstance.subscription.usageMetrics || [],
      };

      res
        .status(HTTP_STATUS.OK)
        .json(success(podDetails, "Pod details retrieved successfully"));
    } catch (err) {
      logger.error("Error getting pod details:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve pod details"));
    }
  },

  /**
   * Restart pod
   * @route POST /api/v1/pods/:id/restart
   * @access Private
   */
  async restartPod(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Restarting pod ${id} for user ${userId}`);

      // Verify pod ownership
      const serviceInstance = await prisma.serviceInstance.findFirst({
        where: {
          id,
          subscription: {
            userId,
          },
        },
        include: {
          subscription: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // Check if pod is in a restartable state
      if (["DELETED", "DELETING"].includes(serviceInstance.status)) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json(error("Pod cannot be restarted in current state"));
      }

      // Restart the pod
      await podService.restartPod(serviceInstance.id);

      // Get updated status
      const updatedStatus = await podService.getPodStatus(serviceInstance.id);

      logger.info(`Successfully restarted pod ${id} for user ${userId}`);

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            id: serviceInstance.id,
            status: updatedStatus.status,
            message: "Pod restart initiated",
            restartedAt: new Date(),
          },
          "Pod restarted successfully"
        )
      );
    } catch (err) {
      logger.error("Error restarting pod:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      if (err.message.includes("Kubernetes client not ready")) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to restart pod"));
    }
  },

  /**
   * Get pod logs
   * @route GET /api/v1/pods/:id/logs
   * @access Private
   */
  async getPodLogs(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { lines, since, timestamps } = req.query;

      logger.info(`Getting logs for pod ${id} for user ${userId}`);

      // Verify pod ownership
      const serviceInstance = await prisma.serviceInstance.findFirst({
        where: {
          id,
          subscription: {
            userId,
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // Get pod logs
      const logOptions = {
        lines: parseInt(lines) || 100,
        since: since ? new Date(since) : undefined,
        timestamps: timestamps === "true",
      };

      const logs = await podService.getPodLogs(serviceInstance.id, logOptions);

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            podId: serviceInstance.id,
            podName: logs.podName,
            logs: logs.logs,
            timestamp: logs.timestamp,
            options: logOptions,
          },
          "Pod logs retrieved successfully"
        )
      );
    } catch (err) {
      logger.error("Error getting pod logs:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      if (err.message.includes("Kubernetes client not ready")) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve pod logs"));
    }
  },

  /**
   * Get pod status
   * @route GET /api/v1/pods/:id/status
   * @access Private
   */
  async getPodStatus(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Getting status for pod ${id} for user ${userId}`);

      // Verify pod ownership
      const serviceInstance = await prisma.serviceInstance.findFirst({
        where: {
          id,
          subscription: {
            userId,
          },
        },
        include: {
          subscription: {
            include: {
              service: {
                select: {
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // Get real-time pod status
      const status = await podService.getPodStatus(serviceInstance.id);

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            podId: serviceInstance.id,
            serviceName: serviceInstance.subscription.service.name,
            serviceDisplayName:
              serviceInstance.subscription.service.displayName,
            namespace: serviceInstance.namespace,
            podName: serviceInstance.podName,
            status: status.status,
            details: status,
            lastUpdated: status.lastUpdated,
          },
          "Pod status retrieved successfully"
        )
      );
    } catch (err) {
      logger.error("Error getting pod status:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      if (err.message.includes("Kubernetes client not ready")) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve pod status"));
    }
  },

  /**
   * Update pod configuration
   * @route PUT /api/v1/pods/:id/config
   * @access Private
   */
  async updatePodConfig(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { env, resources } = req.body;

      logger.info(`Updating configuration for pod ${id} for user ${userId}`);

      // Verify pod ownership
      const serviceInstance = await prisma.serviceInstance.findFirst({
        where: {
          id,
          subscription: {
            userId,
          },
        },
        include: {
          subscription: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // For now, we'll store the configuration update request
      // In a full implementation, this would update the Kubernetes deployment
      const updateData = {};

      if (env) {
        // Validate environment variables
        if (typeof env !== "object") {
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(error("Environment variables must be an object"));
        }
        updateData.customConfig = JSON.stringify({ env });
      }

      if (resources) {
        // Validate resource limits
        try {
          templateParser.validateTemplate(
            serviceInstance.subscription.service.name,
            { resources }
          );
          updateData.resourceLimits = JSON.stringify(resources);
        } catch (validationError) {
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(
              error(
                `Invalid resource configuration: ${validationError.message}`
              )
            );
        }
      }

      // Update service instance record
      const updatedInstance = await prisma.serviceInstance.update({
        where: { id },
        data: updateData,
      });

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            id: updatedInstance.id,
            message: "Configuration updated. Restart pod to apply changes.",
            updatedAt: updatedInstance.updatedAt,
          },
          "Pod configuration updated successfully"
        )
      );
    } catch (err) {
      logger.error("Error updating pod configuration:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to update pod configuration"));
    }
  },

  /**
   * Get available service templates
   * @route GET /api/v1/pods/templates
   * @access Private
   */
  async getServiceTemplates(req, res) {
    try {
      logger.info("Getting available service templates");

      const templates = templateParser.getAvailableTemplates();

      res
        .status(HTTP_STATUS.OK)
        .json(success(templates, "Service templates retrieved successfully"));
    } catch (err) {
      logger.error("Error getting service templates:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve service templates"));
    }
  },

  /**
   * Get template details
   * @route GET /api/v1/pods/templates/:name
   * @access Private
   */
  async getTemplateDetails(req, res) {
    try {
      const { name } = req.params;

      logger.info(`Getting template details for ${name}`);

      const template = templateParser.getTemplate(name);

      if (!template) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(error("Template not found"));
      }

      res
        .status(HTTP_STATUS.OK)
        .json(success(template, "Template details retrieved successfully"));
    } catch (err) {
      logger.error("Error getting template details:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve template details"));
    }
  },

  /**
   * Get pod details (Admin version - can access any pod)
   * @route GET /api/v1/pods/admin/:id
   * @access Private (Admin only)
   */
  async getAdminPodDetails(req, res) {
    try {
      const { id } = req.params;

      logger.info(`Admin getting pod details ${id} - User: ${req.user.email}`);

      // Get service instance with full details (no user restriction for admin)
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id },
        include: {
          subscription: {
            include: {
              service: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  createdAt: true,
                },
              },
              usageMetrics: {
                orderBy: { recordedAt: "desc" },
                take: 20, // More metrics for admin
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      // Get real-time pod status
      const realTimeStatus = await podService.getPodStatus(serviceInstance.id);

      // Parse deployment configuration
      let deploymentConfig = {};
      try {
        deploymentConfig = JSON.parse(serviceInstance.deploymentConfig || "{}");
      } catch (parseError) {
        logger.warn("Failed to parse deployment config:", parseError);
      }

      // Parse custom config
      let customConfig = {};
      try {
        customConfig = JSON.parse(serviceInstance.customConfig || "{}");
      } catch (parseError) {
        logger.warn("Failed to parse custom config:", parseError);
      }

      // Parse resource limits
      let resourceLimits = {};
      try {
        resourceLimits = JSON.parse(serviceInstance.resourceLimits || "{}");
      } catch (parseError) {
        logger.warn("Failed to parse resource limits:", parseError);
      }

      const podDetails = {
        ...serviceInstance,
        realTimeStatus,
        deploymentConfig,
        customConfig,
        resourceLimits,
        usageMetrics: serviceInstance.subscription.usageMetrics || [],
        adminInfo: {
          owner: serviceInstance.subscription.user,
          subscription: {
            id: serviceInstance.subscription.id,
            status: serviceInstance.subscription.status,
            expiresAt: serviceInstance.subscription.expiresAt,
            createdAt: serviceInstance.subscription.createdAt,
          },
        },
      };

      res
        .status(HTTP_STATUS.OK)
        .json(success(podDetails, "Pod details retrieved successfully"));
    } catch (err) {
      logger.error("Error getting admin pod details:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve pod details"));
    }
  },

  /**
   * Admin pod management actions
   * @route POST /api/v1/pods/admin/:id/action
   * @access Private (Admin only)
   */
  async adminPodAction(req, res) {
    try {
      const { id } = req.params;
      const { action } = req.body;

      logger.info(
        `Admin performing action ${action} on pod ${id} - User: ${req.user.email}`
      );

      // Verify pod exists
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id },
        include: {
          subscription: {
            include: {
              service: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      let result = {};

      switch (action) {
        case "restart":
          await podService.restartPod(serviceInstance.id);
          result = {
            action: "restart",
            message: "Pod restart initiated",
            timestamp: new Date(),
          };
          break;

        case "stop":
          // This would implement pod stopping logic
          result = {
            action: "stop",
            message: "Pod stop not yet implemented",
            timestamp: new Date(),
          };
          break;

        case "delete":
          // This would implement pod deletion logic
          result = {
            action: "delete",
            message: "Pod deletion not yet implemented",
            timestamp: new Date(),
          };
          break;

        default:
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(
              error("Invalid action. Supported actions: restart, stop, delete")
            );
      }

      // Get updated status
      const updatedStatus = await podService.getPodStatus(serviceInstance.id);

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            podId: serviceInstance.id,
            podName: serviceInstance.podName,
            owner: serviceInstance.subscription.user,
            result,
            status: updatedStatus,
          },
          `Admin action ${action} completed successfully`
        )
      );
    } catch (err) {
      logger.error("Error performing admin pod action:", err);

      if (err.message.includes("not found")) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
      }

      if (err.message.includes("Kubernetes client not ready")) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to perform admin action"));
    }
  },

  /**
   * Get orphaned pods (exist in Kubernetes but not in database)
   * @route GET /api/v1/pods/admin/orphaned
   * @access Private (Admin only)
   */
  async getOrphanedPods(req, res) {
    try {
      logger.info(`Admin getting orphaned pods - User: ${req.user.email}`);

      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();

      // Get all namespaces with paas.managed label
      const namespaces = await coreV1Api.listNamespace(
        undefined,
        undefined,
        undefined,
        undefined,
        "paas.managed=true"
      );

      const orphanedPods = [];
      let totalK8sPods = 0;

      // Check each namespace for orphaned resources
      for (const namespace of namespaces.body.items) {
        const namespaceName = namespace.metadata.name;

        try {
          // Get all deployments in this namespace
          const deployments = await appsV1Api.listNamespacedDeployment(
            namespaceName
          );

          for (const deployment of deployments.body.items) {
            totalK8sPods++;
            const deploymentName = deployment.metadata.name;
            const labels = deployment.metadata.labels || {};

            // Check if this deployment has a corresponding database record
            const serviceInstance = await prisma.serviceInstance.findFirst({
              where: {
                podName: deploymentName,
                namespace: namespaceName,
              },
              include: {
                subscription: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                    service: {
                      select: {
                        name: true,
                        displayName: true,
                      },
                    },
                  },
                },
              },
            });

            if (!serviceInstance) {
              // This is an orphaned pod
              const pods = await coreV1Api.listNamespacedPod(
                namespaceName,
                undefined,
                undefined,
                undefined,
                undefined,
                `app=${deploymentName}`
              );

              // Get worker node information for each pod
              const podsWithNodeInfo = await Promise.all(
                pods.body.items.map(async (pod) => {
                  let workerNodeInfo = null;

                  if (pod.spec.nodeName) {
                    try {
                      // Get node details
                      const node = await coreV1Api.readNode(pod.spec.nodeName);
                      const nodeInfo = node.body;

                      workerNodeInfo = {
                        nodeName: pod.spec.nodeName,
                        nodeIP: nodeInfo.status.addresses?.find(
                          (addr) => addr.type === "InternalIP"
                        )?.address,
                        architecture: nodeInfo.status.nodeInfo?.architecture,
                        osImage: nodeInfo.status.nodeInfo?.osImage,
                        kubeletVersion:
                          nodeInfo.status.nodeInfo?.kubeletVersion,
                        ready:
                          nodeInfo.status.conditions?.find(
                            (c) => c.type === "Ready"
                          )?.status === "True",
                        allocatable: {
                          cpu: nodeInfo.status.allocatable?.cpu,
                          memory: nodeInfo.status.allocatable?.memory,
                          pods: nodeInfo.status.allocatable?.pods,
                        },
                      };
                    } catch (nodeError) {
                      logger.warn(
                        `Failed to get node info for ${pod.spec.nodeName}:`,
                        nodeError
                      );
                      workerNodeInfo = {
                        nodeName: pod.spec.nodeName,
                        error: "Failed to get node details",
                      };
                    }
                  }

                  return {
                    name: pod.metadata.name,
                    phase: pod.status.phase,
                    createdAt: pod.metadata.creationTimestamp,
                    workerNode: workerNodeInfo,
                  };
                })
              );

              orphanedPods.push({
                deploymentName,
                namespace: namespaceName,
                labels,
                createdAt: deployment.metadata.creationTimestamp,
                replicas: deployment.status?.replicas || 0,
                readyReplicas: deployment.status?.readyReplicas || 0,
                pods: podsWithNodeInfo,
                reason: "No database record found",
                // Summary of worker nodes for this orphaned deployment
                workerNodesSummary: [
                  ...new Set(
                    podsWithNodeInfo
                      .map((p) => p.workerNode?.nodeName)
                      .filter(Boolean)
                  ),
                ],
              });
            }
          }
        } catch (namespaceError) {
          logger.warn(
            `Error checking namespace ${namespaceName}:`,
            namespaceError
          );
        }
      }

      // Get database pod count for comparison
      const dbPodCount = await prisma.serviceInstance.count();

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            orphanedPods,
            summary: {
              totalKubernetesPods: totalK8sPods,
              totalDatabasePods: dbPodCount,
              orphanedCount: orphanedPods.length,
              namespacesChecked: namespaces.body.items.length,
            },
          },
          "Orphaned pods retrieved successfully"
        )
      );
    } catch (err) {
      logger.error("Error getting orphaned pods:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve orphaned pods"));
    }
  },

  /**
   * Clean up orphaned pods
   * @route DELETE /api/v1/pods/admin/orphaned
   * @access Private (Admin only)
   */
  async cleanupOrphanedPods(req, res) {
    try {
      const { confirm, namespaces, deployments } = req.body;

      if (!confirm) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json(
            error("Confirmation required. Set 'confirm: true' to proceed.")
          );
      }

      logger.info(`Admin cleaning up orphaned pods - User: ${req.user.email}`);
      logger.info(`Request body:`, req.body);

      const k8sConfig = getKubernetesConfig();
      logger.info(`Kubernetes client ready status: ${k8sConfig.isReady()}`);

      if (!k8sConfig.isReady()) {
        logger.error("Kubernetes client not ready, returning error");
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      logger.info("Kubernetes client is ready, proceeding with cleanup");

      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();
      const networkingV1Api = k8sConfig.getNetworkingV1Api();

      const cleanupResults = {
        deployments: [],
        services: [],
        ingresses: [],
        namespaces: [],
        errors: [],
      };

      // If specific deployments are provided, clean only those
      if (deployments && Array.isArray(deployments)) {
        for (const { deploymentName, namespace } of deployments) {
          try {
            await podController.cleanupSingleDeployment(
              deploymentName,
              namespace,
              { coreV1Api, appsV1Api, networkingV1Api },
              cleanupResults
            );
          } catch (error) {
            cleanupResults.errors.push({
              resource: `deployment/${deploymentName}`,
              namespace,
              error: error.message,
            });
          }
        }
      } else {
        // Clean up all orphaned pods - get them directly instead of calling the method
        logger.info("Getting orphaned pods for cleanup...");

        try {
          // First try to get namespaces with paas.managed label
          logger.info("Listing namespaces with paas.managed=true label");
          let namespacesResponse = await coreV1Api.listNamespace(
            undefined,
            undefined,
            undefined,
            undefined,
            "paas.managed=true"
          );

          logger.info(
            `Found ${namespacesResponse.body.items.length} managed namespaces`
          );

          // If no managed namespaces found, check all namespaces that start with "customer-" or contain "paas"
          if (namespacesResponse.body.items.length === 0) {
            logger.info(
              "No managed namespaces found, checking all namespaces for PaaS-related ones"
            );
            const allNamespacesResponse = await coreV1Api.listNamespace();

            // Filter namespaces that look like PaaS namespaces
            const paasNamespaces = allNamespacesResponse.body.items.filter(
              (ns) => {
                const name = ns.metadata.name;
                return (
                  name.startsWith("customer-") ||
                  name.includes("paas") ||
                  name.includes("user-") ||
                  name.includes("service-")
                );
              }
            );

            logger.info(
              `Found ${paasNamespaces.length} PaaS-related namespaces from ${allNamespacesResponse.body.items.length} total namespaces`
            );

            // Create a mock response structure
            namespacesResponse = {
              body: {
                items: paasNamespaces,
              },
            };
          }

          const orphanedPods = [];

          // Check each namespace for orphaned resources
          for (const namespace of namespacesResponse.body.items) {
            const namespaceName = namespace.metadata.name;
            logger.info(`Checking namespace: ${namespaceName}`);

            try {
              // Get all deployments in this namespace
              const deploymentsResponse =
                await appsV1Api.listNamespacedDeployment(namespaceName);
              logger.info(
                `Found ${deploymentsResponse.body.items.length} deployments in namespace ${namespaceName}`
              );

              for (const deployment of deploymentsResponse.body.items) {
                const deploymentName = deployment.metadata.name;
                logger.info(
                  `Checking deployment: ${namespaceName}/${deploymentName}`
                );

                // Check if this deployment has a corresponding database record
                const serviceInstance = await prisma.serviceInstance.findFirst({
                  where: {
                    podName: deploymentName,
                    namespace: namespaceName,
                  },
                });

                if (!serviceInstance) {
                  // This is an orphaned pod
                  orphanedPods.push({
                    deploymentName,
                    namespace: namespaceName,
                  });
                  logger.info(
                    `Found orphaned deployment: ${namespaceName}/${deploymentName}`
                  );
                } else {
                  logger.info(
                    `Deployment ${namespaceName}/${deploymentName} has database record, skipping`
                  );
                }
              }
            } catch (namespaceError) {
              logger.error(
                `Error checking namespace ${namespaceName}:`,
                namespaceError
              );
            }
          }

          logger.info(
            `Found ${orphanedPods.length} orphaned deployments to clean up`
          );

          if (orphanedPods.length === 0) {
            logger.info("No orphaned pods found, cleanup complete");
          } else {
            // Clean up each orphaned deployment
            for (const orphaned of orphanedPods) {
              try {
                logger.info(
                  `Cleaning up orphaned deployment: ${orphaned.namespace}/${orphaned.deploymentName}`
                );
                await podController.cleanupSingleDeployment(
                  orphaned.deploymentName,
                  orphaned.namespace,
                  { coreV1Api, appsV1Api, networkingV1Api },
                  cleanupResults
                );
              } catch (error) {
                logger.error(
                  `Failed to cleanup ${orphaned.deploymentName}:`,
                  error
                );
                cleanupResults.errors.push({
                  resource: `deployment/${orphaned.deploymentName}`,
                  namespace: orphaned.namespace,
                  error: error.message,
                });
              }
            }
          }
        } catch (listError) {
          logger.error("Error during orphaned pod detection:", listError);
          cleanupResults.errors.push({
            resource: "namespace listing",
            error: listError.message,
          });
        }
      }

      // Clean up empty namespaces if requested
      if (namespaces && Array.isArray(namespaces)) {
        for (const namespaceName of namespaces) {
          try {
            // Check if namespace is empty
            const [deployments, services, ingresses] = await Promise.all([
              appsV1Api.listNamespacedDeployment(namespaceName),
              coreV1Api.listNamespacedService(namespaceName),
              networkingV1Api.listNamespacedIngress(namespaceName),
            ]);

            const totalResources =
              deployments.body.items.length +
              services.body.items.filter(
                (s) => s.metadata.name !== "kubernetes"
              ).length +
              ingresses.body.items.length;

            if (totalResources === 0) {
              await coreV1Api.deleteNamespace(namespaceName);
              cleanupResults.namespaces.push(namespaceName);
              logger.info(`Deleted empty namespace: ${namespaceName}`);
            }
          } catch (error) {
            cleanupResults.errors.push({
              resource: `namespace/${namespaceName}`,
              error: error.message,
            });
          }
        }
      }

      res.status(HTTP_STATUS.OK).json(
        success(
          {
            cleanupResults,
            summary: {
              deploymentsDeleted: cleanupResults.deployments.length,
              servicesDeleted: cleanupResults.services.length,
              ingressesDeleted: cleanupResults.ingresses.length,
              namespacesDeleted: cleanupResults.namespaces.length,
              errors: cleanupResults.errors.length,
            },
          },
          "Orphaned pods cleanup completed"
        )
      );
    } catch (err) {
      logger.error("Error cleaning up orphaned pods:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to cleanup orphaned pods"));
    }
  },

  /**
   * Helper method to clean up a single deployment and its resources
   */
  async cleanupSingleDeployment(deploymentName, namespace, k8sApis, results) {
    const { coreV1Api, appsV1Api, networkingV1Api } = k8sApis;

    logger.info(
      `Starting cleanup for deployment: ${namespace}/${deploymentName}`
    );

    try {
      // Delete ingress first
      try {
        logger.info(
          `Looking for ingresses related to ${deploymentName} in namespace ${namespace}`
        );
        const ingresses = await networkingV1Api.listNamespacedIngress(
          namespace
        );
        const relatedIngress = ingresses.body.items.find((ing) =>
          ing.metadata.name.includes(deploymentName)
        );

        if (relatedIngress) {
          logger.info(
            `Deleting ingress: ${namespace}/${relatedIngress.metadata.name}`
          );
          await networkingV1Api.deleteNamespacedIngress(
            relatedIngress.metadata.name,
            namespace
          );
          results.ingresses.push(
            `${namespace}/${relatedIngress.metadata.name}`
          );
          logger.info(
            `Successfully deleted ingress: ${namespace}/${relatedIngress.metadata.name}`
          );
        } else {
          logger.info(`No ingress found for deployment ${deploymentName}`);
        }
      } catch (error) {
        logger.error(`Failed to delete ingress for ${deploymentName}:`, error);
        results.errors.push({
          resource: `ingress for ${deploymentName}`,
          namespace,
          error: error.message,
        });
      }

      // Delete service
      try {
        logger.info(
          `Looking for services related to ${deploymentName} in namespace ${namespace}`
        );
        const services = await coreV1Api.listNamespacedService(namespace);
        const relatedService = services.body.items.find(
          (svc) =>
            svc.metadata.name.includes(deploymentName) &&
            svc.metadata.name !== "kubernetes"
        );

        if (relatedService) {
          logger.info(
            `Deleting service: ${namespace}/${relatedService.metadata.name}`
          );
          await coreV1Api.deleteNamespacedService(
            relatedService.metadata.name,
            namespace
          );
          results.services.push(`${namespace}/${relatedService.metadata.name}`);
          logger.info(
            `Successfully deleted service: ${namespace}/${relatedService.metadata.name}`
          );
        } else {
          logger.info(`No service found for deployment ${deploymentName}`);
        }
      } catch (error) {
        logger.error(`Failed to delete service for ${deploymentName}:`, error);
        results.errors.push({
          resource: `service for ${deploymentName}`,
          namespace,
          error: error.message,
        });
      }

      // Delete deployment last
      try {
        logger.info(`Deleting deployment: ${namespace}/${deploymentName}`);

        // First check if deployment exists
        try {
          await appsV1Api.readNamespacedDeployment(deploymentName, namespace);
          logger.info(
            `Deployment ${namespace}/${deploymentName} exists, proceeding with deletion`
          );
        } catch (readError) {
          if (readError.response?.statusCode === 404) {
            logger.warn(
              `Deployment ${namespace}/${deploymentName} not found, may have been already deleted`
            );
            return;
          }
          throw readError;
        }

        // Delete the deployment with proper options
        const deleteResponse = await appsV1Api.deleteNamespacedDeployment(
          deploymentName,
          namespace,
          undefined, // body
          undefined, // pretty
          undefined, // dryRun
          undefined, // gracePeriodSeconds
          undefined, // orphanDependents
          "Background" // propagationPolicy - delete pods immediately
        );

        results.deployments.push(`${namespace}/${deploymentName}`);
        logger.info(
          `Successfully initiated deletion of deployment: ${namespace}/${deploymentName}`
        );
        logger.info(
          `Delete response status: ${deleteResponse.response?.statusCode}`
        );

        // Wait a moment and verify deletion
        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
          await appsV1Api.readNamespacedDeployment(deploymentName, namespace);
          logger.warn(
            `Deployment ${namespace}/${deploymentName} still exists after deletion attempt`
          );
        } catch (verifyError) {
          if (verifyError.response?.statusCode === 404) {
            logger.info(
              `Confirmed: Deployment ${namespace}/${deploymentName} has been deleted`
            );
          } else {
            logger.warn(
              `Error verifying deletion of ${namespace}/${deploymentName}:`,
              verifyError.message
            );
          }
        }
      } catch (error) {
        logger.error(`Failed to delete deployment ${deploymentName}:`, error);
        results.errors.push({
          resource: `deployment/${deploymentName}`,
          namespace,
          error: error.message,
        });
      }

      logger.info(
        `Completed cleanup attempt for deployment: ${namespace}/${deploymentName}`
      );
    } catch (error) {
      logger.error(
        `Error during cleanup of deployment ${deploymentName}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Debug Kubernetes state (Admin only)
   * @route GET /api/v1/pods/admin/debug
   * @access Private (Admin only)
   */
  async debugKubernetesState(req, res) {
    try {
      logger.info(`Admin debugging Kubernetes state - User: ${req.user.email}`);

      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        return res
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .json(error("Kubernetes service temporarily unavailable"));
      }

      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();

      const debugInfo = {
        kubernetesConnection: {
          ready: k8sConfig.isReady(),
          timestamp: new Date(),
        },
        namespaces: {
          managed: [],
          paasRelated: [],
          all: [],
        },
        deployments: {
          total: 0,
          byNamespace: {},
        },
        databasePods: {
          total: 0,
          byStatus: {},
        },
      };

      try {
        // Get all namespaces
        const allNamespacesResponse = await coreV1Api.listNamespace();
        debugInfo.namespaces.all = allNamespacesResponse.body.items.map(
          (ns) => ({
            name: ns.metadata.name,
            labels: ns.metadata.labels || {},
            createdAt: ns.metadata.creationTimestamp,
          })
        );

        // Get managed namespaces (with paas.managed=true label)
        try {
          const managedNamespacesResponse = await coreV1Api.listNamespace(
            undefined,
            undefined,
            undefined,
            undefined,
            "paas.managed=true"
          );
          debugInfo.namespaces.managed =
            managedNamespacesResponse.body.items.map((ns) => ({
              name: ns.metadata.name,
              labels: ns.metadata.labels || {},
              createdAt: ns.metadata.creationTimestamp,
            }));
        } catch (managedError) {
          logger.warn("Error getting managed namespaces:", managedError);
          debugInfo.namespaces.managedError = managedError.message;
        }

        // Get PaaS-related namespaces
        debugInfo.namespaces.paasRelated = allNamespacesResponse.body.items
          .filter((ns) => {
            const name = ns.metadata.name;
            return (
              name.startsWith("customer-") ||
              name.includes("paas") ||
              name.includes("user-") ||
              name.includes("service-")
            );
          })
          .map((ns) => ({
            name: ns.metadata.name,
            labels: ns.metadata.labels || {},
            createdAt: ns.metadata.creationTimestamp,
          }));

        // Get deployments from all relevant namespaces
        const namespacesToCheck =
          debugInfo.namespaces.managed.length > 0
            ? debugInfo.namespaces.managed
            : debugInfo.namespaces.paasRelated;

        for (const namespace of namespacesToCheck) {
          try {
            const deploymentsResponse =
              await appsV1Api.listNamespacedDeployment(namespace.name);
            const deployments = deploymentsResponse.body.items.map((dep) => ({
              name: dep.metadata.name,
              namespace: dep.metadata.namespace,
              labels: dep.metadata.labels || {},
              replicas: dep.status?.replicas || 0,
              readyReplicas: dep.status?.readyReplicas || 0,
              createdAt: dep.metadata.creationTimestamp,
            }));

            debugInfo.deployments.byNamespace[namespace.name] = deployments;
            debugInfo.deployments.total += deployments.length;
          } catch (deploymentError) {
            logger.warn(
              `Error getting deployments for namespace ${namespace.name}:`,
              deploymentError
            );
            debugInfo.deployments.byNamespace[namespace.name] = {
              error: deploymentError.message,
            };
          }
        }

        // Get database pod information
        const dbPods = await prisma.serviceInstance.findMany({
          include: {
            subscription: {
              include: {
                service: {
                  select: {
                    name: true,
                    displayName: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        debugInfo.databasePods.total = dbPods.length;
        debugInfo.databasePods.byStatus = dbPods.reduce((acc, pod) => {
          acc[pod.status] = (acc[pod.status] || 0) + 1;
          return acc;
        }, {});

        debugInfo.databasePods.details = dbPods.map((pod) => ({
          id: pod.id,
          podName: pod.podName,
          namespace: pod.namespace,
          status: pod.status,
          serviceName: pod.subscription.service.name,
          userEmail: pod.subscription.user.email,
          createdAt: pod.createdAt,
        }));
      } catch (k8sError) {
        logger.error("Error getting Kubernetes debug info:", k8sError);
        debugInfo.kubernetesError = k8sError.message;
      }

      res
        .status(HTTP_STATUS.OK)
        .json(
          success(
            debugInfo,
            "Kubernetes debug information retrieved successfully"
          )
        );
    } catch (err) {
      logger.error("Error debugging Kubernetes state:", err);
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(error("Failed to retrieve Kubernetes debug information"));
    }
  },
};

export default podController;
