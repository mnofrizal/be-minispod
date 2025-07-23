import { getKubernetesConfig, kubernetesUtils } from "../config/kubernetes.js";
import { prisma } from "../config/database.js";
import { notificationJobs } from "../jobs/notification.jobs.js";
import logger from "../utils/logger.util.js";

/**
 * Pod Management Service
 * Handles Kubernetes pod lifecycle operations
 */
export const podService = {
  /**
   * Create pod for subscription
   */
  async createPod(subscriptionId, serviceConfig) {
    try {
      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        throw new Error("Kubernetes client not ready");
      }

      // Get subscription details
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          user: true,
          service: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      const { user, service } = subscription;
      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();

      // Generate Kubernetes resource names
      const namespaceName = kubernetesUtils.generateNamespaceName(user.id);
      const podName = kubernetesUtils.generatePodName(service.name, user.id);
      const serviceName = kubernetesUtils.generateServiceName(
        service.name,
        user.id
      );
      const internalUrl = `http://${serviceName}.${namespaceName}.svc.cluster.local:${
        service.containerPort || 80
      }`;
      const externalUrl = kubernetesUtils.generateExternalUrl(
        subscription.subdomain,
        service.name
      );

      // Parse resource limits from service catalog
      const resourceLimits = {
        cpu: service.cpuLimit || "1",
        memory: service.memLimit || "1Gi",
      };

      // 1. Create or ensure namespace exists
      await this.ensureNamespace(namespaceName, user.id);

      // 2. Create deployment
      const deployment = await this.createDeployment({
        namespaceName,
        deploymentName: podName,
        serviceName: service.name,
        dockerImage: service.dockerImage,
        resourceLimits,
        serviceConfig: serviceConfig || {},
        userId: user.id,
        subscriptionId,
      });

      // 3. Create service
      const k8sService = await this.createService({
        namespaceName,
        serviceName,
        deploymentName: podName,
        port: service.containerPort || 80,
        targetPort: service.containerPort || 80,
      });

      // 4. Create ingress for external access
      let ingress = null;
      try {
        ingress = await this.createIngress({
          namespaceName,
          ingressName: kubernetesUtils.generateIngressName(
            service.name,
            user.id
          ),
          serviceName,
          subdomain: subscription.subdomain,
          serviceDomain: service.name,
          port: service.containerPort || 80,
        });
      } catch (ingressError) {
        logger.warn(`Failed to create ingress: ${ingressError.message}`);
        // Continue without ingress - service will still be accessible internally
      }

      // 5. Create service instance record
      const serviceInstance = await prisma.serviceInstance.create({
        data: {
          subscriptionId,
          status: "PENDING",
          podName,
          namespace: namespaceName,
          internalUrl,
          externalUrl: externalUrl,
          cpuAllocated: resourceLimits.cpu,
          memAllocated: resourceLimits.memory,
          credentials: {
            deployment: deployment.metadata.name,
            service: k8sService.metadata.name,
            ingress: ingress?.metadata.name,
          },
        },
      });

      logger.info(`Created pod ${podName} for subscription ${subscriptionId}`);

      // 6. Start monitoring pod status
      this.monitorPodStatus(serviceInstance.id, namespaceName, podName);

      return serviceInstance;
    } catch (error) {
      logger.error(
        `Error creating pod for subscription ${subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Delete pod and cleanup resources
   */
  async deletePod(serviceInstanceId) {
    try {
      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        throw new Error("Kubernetes client not ready");
      }

      // Get service instance
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
      });

      if (!serviceInstance) {
        throw new Error("Service instance not found");
      }

      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();
      const networkingV1Api = k8sConfig.getNetworkingV1Api();

      const { namespace, podName } = serviceInstance;
      const deploymentConfig = serviceInstance.credentials || {};

      // Delete resources in reverse order
      try {
        // Delete ingress
        if (deploymentConfig.ingress) {
          await networkingV1Api.deleteNamespacedIngress(
            deploymentConfig.ingress,
            namespace
          );
          logger.info(`Deleted ingress ${deploymentConfig.ingress}`);
        }
      } catch (error) {
        logger.warn(`Failed to delete ingress: ${error.message}`);
      }

      try {
        // Delete service
        if (deploymentConfig.service) {
          await coreV1Api.deleteNamespacedService(
            deploymentConfig.service,
            namespace
          );
          logger.info(`Deleted service ${deploymentConfig.service}`);
        }
      } catch (error) {
        logger.warn(`Failed to delete service: ${error.message}`);
      }

      try {
        // Delete deployment
        if (deploymentConfig.deployment) {
          await appsV1Api.deleteNamespacedDeployment(
            deploymentConfig.deployment,
            namespace
          );
          logger.info(`Deleted deployment ${deploymentConfig.deployment}`);
        }
      } catch (error) {
        logger.warn(`Failed to delete deployment: ${error.message}`);
      }

      // Update service instance status
      await prisma.serviceInstance.update({
        where: { id: serviceInstanceId },
        data: { status: "DELETED" },
      });

      logger.info(
        `Deleted pod resources for service instance ${serviceInstanceId}`
      );
      return true;
    } catch (error) {
      logger.error(
        `Error deleting pod for service instance ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Get pod status
   */
  async getPodStatus(serviceInstanceId) {
    try {
      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        throw new Error("Kubernetes client not ready");
      }

      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
      });

      if (!serviceInstance) {
        throw new Error("Service instance not found");
      }

      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();

      // Get deployment status
      const deploymentConfig = serviceInstance.credentials || {};
      const deploymentName = deploymentConfig.deployment;

      if (!deploymentName) {
        return { status: "UNKNOWN", message: "No deployment found" };
      }

      const deployment = await appsV1Api.readNamespacedDeployment(
        deploymentName,
        serviceInstance.namespace
      );

      const deploymentStatus = deployment.body.status;
      const replicas = deploymentStatus.replicas || 0;
      const readyReplicas = deploymentStatus.readyReplicas || 0;
      const availableReplicas = deploymentStatus.availableReplicas || 0;

      // Get pods for more detailed status
      const pods = await coreV1Api.listNamespacedPod(
        serviceInstance.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName}`
      );

      const podStatuses = pods.body.items.map((pod) => ({
        name: pod.metadata.name,
        phase: pod.status.phase,
        ready:
          pod.status.conditions?.find((c) => c.type === "Ready")?.status ===
          "True",
        restartCount: pod.status.containerStatuses?.[0]?.restartCount || 0,
      }));

      // Determine overall status
      let overallStatus = "PENDING";
      if (availableReplicas > 0 && readyReplicas === replicas) {
        overallStatus = "RUNNING";
      } else if (availableReplicas === 0 && replicas > 0) {
        overallStatus = "FAILED";
      }

      return {
        status: overallStatus,
        replicas: {
          desired: replicas,
          ready: readyReplicas,
          available: availableReplicas,
        },
        pods: podStatuses,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error(
        `Error getting pod status for service instance ${serviceInstanceId}:`,
        error
      );
      return { status: "ERROR", message: error.message };
    }
  },

  /**
   * Restart pod
   */
  async restartPod(serviceInstanceId) {
    try {
      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        throw new Error("Kubernetes client not ready");
      }

      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
      });

      if (!serviceInstance) {
        throw new Error("Service instance not found");
      }

      const appsV1Api = k8sConfig.getAppsV1Api();
      const deploymentConfig = serviceInstance.credentials || {};
      const deploymentName = deploymentConfig.deployment;

      if (!deploymentName) {
        throw new Error("No deployment found for restart");
      }

      // Restart by updating deployment with restart annotation
      const patch = {
        spec: {
          template: {
            metadata: {
              annotations: {
                "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
              },
            },
          },
        },
      };

      await appsV1Api.patchNamespacedDeployment(
        deploymentName,
        serviceInstance.namespace,
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

      // Update service instance status
      await prisma.serviceInstance.update({
        where: { id: serviceInstanceId },
        data: { status: "RESTARTING" },
      });

      logger.info(`Restarted pod for service instance ${serviceInstanceId}`);
      return true;
    } catch (error) {
      logger.error(
        `Error restarting pod for service instance ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Get pod logs
   */
  async getPodLogs(serviceInstanceId, options = {}) {
    try {
      const k8sConfig = getKubernetesConfig();
      if (!k8sConfig.isReady()) {
        throw new Error("Kubernetes client not ready");
      }

      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
      });

      if (!serviceInstance) {
        throw new Error("Service instance not found");
      }

      const coreV1Api = k8sConfig.getCoreV1Api();
      const deploymentConfig = serviceInstance.credentials || {};

      // Get pods for the deployment
      const pods = await coreV1Api.listNamespacedPod(
        serviceInstance.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentConfig.deployment}`
      );

      if (pods.body.items.length === 0) {
        return { logs: "No pods found", timestamp: new Date() };
      }

      // Get logs from the first pod
      const podName = pods.body.items[0].metadata.name;
      const logOptions = {
        tailLines: options.lines || 100,
        timestamps: true,
        ...options,
      };

      const logs = await coreV1Api.readNamespacedPodLog(
        podName,
        serviceInstance.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        logOptions.tailLines,
        undefined,
        logOptions.timestamps
      );

      return {
        logs: logs.body,
        podName,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(
        `Error getting pod logs for service instance ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Monitor pod status (background task)
   */
  async monitorPodStatus(serviceInstanceId, namespace, podName) {
    try {
      // This would typically be handled by a background job
      // For now, we'll update the status after a delay
      setTimeout(async () => {
        try {
          const status = await this.getPodStatus(serviceInstanceId);
          const previousStatus = await prisma.serviceInstance.findUnique({
            where: { id: serviceInstanceId },
            select: { status: true },
          });

          await prisma.serviceInstance.update({
            where: { id: serviceInstanceId },
            data: { status: status.status },
          });

          // Send notification when pod becomes ready
          if (
            status.status === "RUNNING" &&
            previousStatus?.status !== "RUNNING"
          ) {
            try {
              await notificationJobs.queueServiceReady(serviceInstanceId);
            } catch (notificationError) {
              logger.error(
                `Failed to queue service ready notification for ${serviceInstanceId}:`,
                notificationError
              );
            }
          }

          logger.info(
            `Updated status for service instance ${serviceInstanceId}: ${status.status}`
          );
        } catch (error) {
          logger.error(
            `Error monitoring pod status for ${serviceInstanceId}:`,
            error
          );
        }
      }, 30000); // Check after 30 seconds
    } catch (error) {
      logger.error(
        `Error setting up pod monitoring for ${serviceInstanceId}:`,
        error
      );
    }
  },

  /**
   * Ensure namespace exists
   */
  async ensureNamespace(namespaceName, userId) {
    try {
      const k8sConfig = getKubernetesConfig();
      const coreV1Api = k8sConfig.getCoreV1Api();

      try {
        // Check if namespace exists
        await coreV1Api.readNamespace(namespaceName);
        logger.info(`Namespace ${namespaceName} already exists`);
        return;
      } catch (error) {
        if (error.response?.statusCode !== 404) {
          throw error;
        }
      }

      // Create namespace
      const namespace = {
        metadata: {
          name: namespaceName,
          labels: {
            "paas.customer": userId,
            "paas.managed": "true",
          },
        },
      };

      await coreV1Api.createNamespace(namespace);
      logger.info(`Created namespace ${namespaceName} for user ${userId}`);
    } catch (error) {
      logger.error(`Error ensuring namespace ${namespaceName}:`, error);
      throw error;
    }
  },

  /**
   * Create deployment
   */
  async createDeployment({
    namespaceName,
    deploymentName,
    serviceName,
    dockerImage,
    resourceLimits,
    serviceConfig,
    userId,
    subscriptionId,
  }) {
    try {
      const k8sConfig = getKubernetesConfig();
      const appsV1Api = k8sConfig.getAppsV1Api();

      // Check if deployment already exists
      try {
        const existingDeployment = await appsV1Api.readNamespacedDeployment(
          deploymentName,
          namespaceName
        );
        logger.info(
          `Deployment ${deploymentName} already exists, using existing deployment`
        );
        return existingDeployment.body;
      } catch (error) {
        if (error.response?.statusCode !== 404) {
          logger.error(
            `Error checking existing deployment ${deploymentName}:`,
            error
          );
          throw error;
        }
        // Deployment doesn't exist, continue with creation
      }

      const deployment = {
        metadata: {
          name: deploymentName,
          namespace: namespaceName,
          labels: {
            app: deploymentName,
            service: serviceName,
            "paas.customer": userId,
            "paas.subscription": subscriptionId,
          },
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: deploymentName,
            },
          },
          template: {
            metadata: {
              labels: {
                app: deploymentName,
                service: serviceName,
                "paas.customer": userId,
              },
            },
            spec: {
              containers: [
                {
                  name: serviceName,
                  image: dockerImage,
                  ports: [
                    {
                      containerPort: serviceConfig.ports?.containerPort || 80,
                    },
                  ],
                  resources: serviceConfig.resources || {
                    limits: resourceLimits,
                    requests: {
                      cpu: "0.25",
                      memory: "512Mi",
                    },
                  },
                  env:
                    serviceConfig.env ||
                    this.generateEnvironmentVariables(serviceConfig),
                },
              ],
            },
          },
        },
      };

      const result = await appsV1Api.createNamespacedDeployment(
        namespaceName,
        deployment
      );
      logger.info(
        `Created deployment ${deploymentName} in namespace ${namespaceName}`
      );
      return result.body;
    } catch (error) {
      logger.error(`Error creating deployment ${deploymentName}:`, error);
      logger.error(`Deployment spec:`, JSON.stringify(deployment, null, 2));
      throw error;
    }
  },

  /**
   * Create service
   */
  async createService({
    namespaceName,
    serviceName,
    deploymentName,
    port,
    targetPort,
  }) {
    try {
      const k8sConfig = getKubernetesConfig();
      const coreV1Api = k8sConfig.getCoreV1Api();

      // Check if service already exists
      try {
        const existingService = await coreV1Api.readNamespacedService(
          serviceName,
          namespaceName
        );
        logger.info(
          `Service ${serviceName} already exists, using existing service`
        );
        return existingService.body;
      } catch (error) {
        if (error.response?.statusCode !== 404) {
          logger.error(
            `Error checking existing service ${serviceName}:`,
            error
          );
          throw error;
        }
        // Service doesn't exist, continue with creation
      }

      const service = {
        metadata: {
          name: serviceName,
          namespace: namespaceName,
        },
        spec: {
          selector: {
            app: deploymentName,
          },
          ports: [
            {
              port: port,
              targetPort: targetPort,
              protocol: "TCP",
            },
          ],
          type: "ClusterIP",
        },
      };

      const result = await coreV1Api.createNamespacedService(
        namespaceName,
        service
      );
      logger.info(
        `Created service ${serviceName} in namespace ${namespaceName}`
      );
      return result.body;
    } catch (error) {
      logger.error(`Error creating service ${serviceName}:`, error);
      logger.error(`Service spec:`, JSON.stringify(service, null, 2));
      throw error;
    }
  },

  /**
   * Create ingress
   */
  async createIngress({
    namespaceName,
    ingressName,
    serviceName,
    subdomain,
    serviceDomain,
    port,
  }) {
    try {
      const k8sConfig = getKubernetesConfig();
      const networkingV1Api = k8sConfig.getNetworkingV1Api();

      const domain = process.env.K8S_CLUSTER_DOMAIN || "localhost";
      const host = `${subdomain}.${serviceDomain}.${domain}`;

      // Check if ingress already exists
      try {
        const existingIngress = await networkingV1Api.readNamespacedIngress(
          ingressName,
          namespaceName
        );
        logger.info(
          `Ingress ${ingressName} already exists, using existing ingress`
        );
        return existingIngress.body;
      } catch (error) {
        if (error.response?.statusCode !== 404) {
          logger.error(
            `Error checking existing ingress ${ingressName}:`,
            error
          );
          throw error;
        }
        // Ingress doesn't exist, continue with creation
      }

      const ingress = {
        metadata: {
          name: ingressName,
          namespace: namespaceName,
          annotations: {
            "nginx.ingress.kubernetes.io/rewrite-target": "/",
            "cert-manager.io/cluster-issuer": "letsencrypt-prod",
          },
        },
        spec: {
          tls: [
            {
              hosts: [host],
              secretName: `${ingressName}-tls`,
            },
          ],
          rules: [
            {
              host: host,
              http: {
                paths: [
                  {
                    path: "/",
                    pathType: "Prefix",
                    backend: {
                      service: {
                        name: serviceName,
                        port: {
                          number: port,
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = await networkingV1Api.createNamespacedIngress(
        namespaceName,
        ingress
      );
      logger.info(`Created ingress ${ingressName} for host ${host}`);
      return result.body;
    } catch (error) {
      logger.error(`Error creating ingress ${ingressName}:`, error);
      logger.error(`Ingress spec:`, JSON.stringify(ingress, null, 2));
      throw error;
    }
  },

  /**
   * Generate environment variables for container
   */
  generateEnvironmentVariables(serviceConfig) {
    const env = [];

    // Add common environment variables
    if (serviceConfig.databaseUrl) {
      env.push({ name: "DATABASE_URL", value: serviceConfig.databaseUrl });
    }

    if (serviceConfig.adminEmail) {
      env.push({ name: "ADMIN_EMAIL", value: serviceConfig.adminEmail });
    }

    if (serviceConfig.adminPassword) {
      env.push({ name: "ADMIN_PASSWORD", value: serviceConfig.adminPassword });
    }

    // Add custom environment variables
    if (serviceConfig.env) {
      Object.entries(serviceConfig.env).forEach(([key, value]) => {
        env.push({ name: key, value: String(value) });
      });
    }

    return env;
  },
};

export default podService;
