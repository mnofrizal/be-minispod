import { getKubernetesConfig, kubernetesUtils } from "../config/kubernetes.js";
import { prisma } from "../config/database.js";
import { notificationJobs } from "../jobs/notification.jobs.js";
import logger from "../utils/logger.util.js";

/**
 * Pod Management Service
 * Handles Kubernetes pod lifecycle operations
 */

/**
 * Create pod for subscription
 */
export const createPod = async (subscriptionId, serviceConfig) => {
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
    await ensureNamespace(namespaceName, user.id);

    // 2. Create deployment
    const deployment = await createDeployment({
      namespaceName,
      deploymentName: podName,
      serviceName: service.name,
      dockerImage: service.dockerImage,
      containerPort: service.containerPort || 80,
      resourceLimits,
      serviceConfig: serviceConfig || {},
      userId: user.id,
      subscriptionId,
    });

    // 3. Create service
    const k8sService = await createService({
      namespaceName,
      serviceName,
      deploymentName: podName,
      port: service.containerPort || 80,
      targetPort: service.containerPort || 80,
    });

    // 4. Create ingress for external access
    let ingress = null;
    try {
      ingress = await createIngress({
        namespaceName,
        ingressName: kubernetesUtils.generateIngressName(service.name, user.id),
        serviceName,
        subdomain: subscription.subdomain,
        serviceDomain: service.name,
        port: service.containerPort || 80,
      });
    } catch (ingressError) {
      logger.warn(`Failed to create ingress: ${ingressError.message}`);
      // Continue without ingress - service will still be accessible internally
    }

    // 5. Create service instance record with volume information
    const serviceInstanceData = {
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
    };

    // Add volume information if service has volume configuration
    if (service.volumeSize && service.volumeMountPath) {
      const volumeClaimName = `${podName}-pvc`;
      serviceInstanceData.volumeClaimName = volumeClaimName;
      serviceInstanceData.volumeSize = service.volumeSize;
      serviceInstanceData.volumeMountPath = service.volumeMountPath;
      serviceInstanceData.volumeStatus = "Pending"; // Will be updated by monitoring
    }

    const serviceInstance = await prisma.serviceInstance.create({
      data: serviceInstanceData,
    });

    logger.info(`Created pod ${podName} for subscription ${subscriptionId}`);

    // 6. Start monitoring pod status
    monitorPodStatus(serviceInstance.id, namespaceName, podName);

    return serviceInstance;
  } catch (error) {
    logger.error(
      `Error creating pod for subscription ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Delete pod and cleanup resources
 */
export const deletePod = async (
  serviceInstanceId,
  reason = "manual-deletion",
  deletePVC = true
) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    // Get service instance with volume information
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
    });

    if (!serviceInstance) {
      throw new Error("Service instance not found");
    }

    const coreV1Api = k8sConfig.getCoreV1Api();
    const appsV1Api = k8sConfig.getAppsV1Api();
    const networkingV1Api = k8sConfig.getNetworkingV1Api();

    const { namespace, podName, volumeClaimName } = serviceInstance;
    const deploymentConfig = serviceInstance.credentials || {};

    logger.info(
      `Starting deletion of pod ${serviceInstanceId} with resources: deployment, service, ingress${
        volumeClaimName ? `, PVC (${volumeClaimName})` : ""
      }`
    );

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

    // Delete PersistentVolumeClaim if it exists and deletePVC is true
    if (volumeClaimName && deletePVC) {
      try {
        await coreV1Api.deleteNamespacedPersistentVolumeClaim(
          volumeClaimName,
          namespace
        );
        logger.info(
          `Deleted PersistentVolumeClaim ${volumeClaimName} for pod ${serviceInstanceId} (reason: ${reason})`
        );
      } catch (pvcError) {
        if (pvcError.response?.statusCode === 404) {
          logger.warn(
            `PVC ${volumeClaimName} not found, may have been already deleted`
          );
        } else {
          logger.error(
            `Failed to delete PVC ${volumeClaimName}: ${pvcError.message}`
          );
          // Don't fail the entire deletion if PVC deletion fails
          // The PVC will be cleaned up by background jobs or manual intervention
        }
      }
    } else if (volumeClaimName && !deletePVC) {
      logger.info(
        `Preserving PersistentVolumeClaim ${volumeClaimName} for pod ${serviceInstanceId} (reason: ${reason})`
      );
    }

    // Update service instance status and clear volume information
    await prisma.serviceInstance.update({
      where: { id: serviceInstanceId },
      data: {
        status: "DELETED",
        volumeStatus: volumeClaimName ? "DELETED" : null,
      },
    });

    logger.info(
      `Successfully deleted pod resources for service instance ${serviceInstanceId}${
        volumeClaimName ? " including PVC" : ""
      }`
    );
    return true;
  } catch (error) {
    logger.error(
      `Error deleting pod for service instance ${serviceInstanceId}:`,
      error
    );
    throw error;
  }
};

/**
 * Get pod status
 */
export const getPodStatus = async (serviceInstanceId) => {
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

    // Determine overall status with proper startup handling
    let overallStatus = "PENDING";

    if (replicas === 0) {
      // Pod is intentionally stopped (scaled to 0)
      overallStatus = "STOPPED";
    } else if (availableReplicas > 0 && readyReplicas === replicas) {
      // All replicas are ready and available
      overallStatus = "RUNNING";
    } else if (replicas > 0) {
      // Pod is desired but not fully ready yet
      // Check individual pod phases to determine if it's actually failing
      const failedPods = podStatuses.filter(
        (pod) =>
          pod.phase === "Failed" ||
          (pod.phase === "Running" && !pod.ready && pod.restartCount > 2)
      );

      const pendingPods = podStatuses.filter(
        (pod) => pod.phase === "Pending" || pod.phase === "ContainerCreating"
      );

      const runningButNotReady = podStatuses.filter(
        (pod) => pod.phase === "Running" && !pod.ready && pod.restartCount <= 2
      );

      if (failedPods.length > 0) {
        // Only mark as FAILED if pods are actually in Failed phase or repeatedly restarting
        overallStatus = "FAILED";
      } else if (pendingPods.length > 0 || runningButNotReady.length > 0) {
        // Pod is starting up normally - keep as PENDING
        overallStatus = "PENDING";
      } else {
        // Fallback to PENDING for any other startup scenarios
        overallStatus = "PENDING";
      }
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
};

/**
 * Restart pod
 */
export const restartPod = async (serviceInstanceId) => {
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

    // Get current deployment to check replica count
    const deployment = await appsV1Api.readNamespacedDeployment(
      deploymentName,
      serviceInstance.namespace
    );

    const currentReplicas = deployment.body.spec.replicas || 0;

    // If pod is stopped (0 replicas), start it first then restart
    if (currentReplicas === 0) {
      logger.info(
        `Pod ${serviceInstanceId} is stopped, starting it first before restart`
      );

      // First scale to 1 replica
      const scaleUpPatch = {
        spec: {
          replicas: 1,
        },
      };

      await appsV1Api.patchNamespacedDeployment(
        deploymentName,
        serviceInstance.namespace,
        scaleUpPatch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { "Content-Type": "application/strategic-merge-patch+json" },
        }
      );

      // Wait a moment for the pod to start
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Now restart by updating deployment with restart annotation
    const restartPatch = {
      spec: {
        replicas: 1, // Ensure it's scaled to 1
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
      restartPatch,
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
};

/**
 * Stop pod (scale to 0 replicas)
 */
export const stopPod = async (serviceInstanceId) => {
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
      throw new Error("No deployment found for stopping");
    }

    // Stop by scaling deployment to 0 replicas
    const patch = {
      spec: {
        replicas: 0,
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
      data: { status: "STOPPED" },
    });

    logger.info(`Stopped pod for service instance ${serviceInstanceId}`);
    return true;
  } catch (error) {
    logger.error(
      `Error stopping pod for service instance ${serviceInstanceId}:`,
      error
    );
    throw error;
  }
};

/**
 * Start pod (scale back to 1 replica)
 */
export const startPod = async (serviceInstanceId) => {
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
      throw new Error("No deployment found for starting");
    }

    // Start by scaling deployment to 1 replica
    const patch = {
      spec: {
        replicas: 1,
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
      data: { status: "PENDING" },
    });

    logger.info(`Started pod for service instance ${serviceInstanceId}`);
    return true;
  } catch (error) {
    logger.error(
      `Error starting pod for service instance ${serviceInstanceId}:`,
      error
    );
    throw error;
  }
};

/**
 * Get pod logs
 */
export const getPodLogs = async (serviceInstanceId, options = {}) => {
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
};

/**
 * Monitor pod status (background task)
 */
export const monitorPodStatus = async (
  serviceInstanceId,
  namespace,
  podName
) => {
  try {
    // This would typically be handled by a background job
    // For now, we'll update the status after a delay
    setTimeout(async () => {
      try {
        const status = await getPodStatus(serviceInstanceId);
        const previousStatus = await prisma.serviceInstance.findUnique({
          where: { id: serviceInstanceId },
          select: { status: true, subscriptionId: true },
        });

        await prisma.serviceInstance.update({
          where: { id: serviceInstanceId },
          data: { status: status.status },
        });

        // Update subscription status when pod becomes ready
        if (
          status.status === "RUNNING" &&
          previousStatus?.status !== "RUNNING"
        ) {
          try {
            // Import subscription service to update subscription status
            const { updateSubscriptionStatusFromPod } = await import(
              "./subscription.service.js"
            );

            await updateSubscriptionStatusFromPod(
              previousStatus.subscriptionId,
              status.status,
              { serviceInstanceId, podName, namespace }
            );

            logger.info(
              `Updated subscription status for pod ${serviceInstanceId} becoming RUNNING`
            );
          } catch (subscriptionError) {
            logger.error(
              `Failed to update subscription status for ${serviceInstanceId}:`,
              subscriptionError
            );
          }

          // Send notification when pod becomes ready
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
};

/**
 * Ensure namespace exists
 */
export const ensureNamespace = async (namespaceName, userId) => {
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
};

/**
 * Create deployment
 */
export const createDeployment = async ({
  namespaceName,
  deploymentName,
  serviceName,
  dockerImage,
  containerPort,
  resourceLimits,
  serviceConfig,
  userId,
  subscriptionId,
}) => {
  try {
    const k8sConfig = getKubernetesConfig();
    const appsV1Api = k8sConfig.getAppsV1Api();
    const coreV1Api = k8sConfig.getCoreV1Api();

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

    // Get service catalog configuration for volume settings
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            volumeSize: true,
            volumeMountPath: true,
            volumeName: true,
            storageClass: true,
            accessMode: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const serviceVolumeConfig = subscription.service;
    let volumeClaimName = null;
    let volumeStatus = null;

    // Create PersistentVolumeClaim if volume configuration exists
    if (serviceVolumeConfig.volumeSize && serviceVolumeConfig.volumeMountPath) {
      volumeClaimName = `${deploymentName}-pvc`;

      logger.info(
        `Creating PersistentVolumeClaim ${volumeClaimName} for deployment ${deploymentName}`
      );

      try {
        // Check if PVC already exists
        try {
          const existingPVC =
            await coreV1Api.readNamespacedPersistentVolumeClaim(
              volumeClaimName,
              namespaceName
            );
          logger.info(
            `PVC ${volumeClaimName} already exists, using existing PVC`
          );
          volumeStatus = existingPVC.body.status?.phase || "Unknown";
        } catch (pvcError) {
          if (pvcError.response?.statusCode !== 404) {
            logger.error(
              `Error checking existing PVC ${volumeClaimName}:`,
              pvcError
            );
            throw pvcError;
          }

          // PVC doesn't exist, create it
          const pvcSpec = {
            metadata: {
              name: volumeClaimName,
              namespace: namespaceName,
              labels: {
                app: deploymentName,
                service: serviceName,
                "paas.customer": userId,
                "paas.subscription": subscriptionId,
                "paas.volume": "true",
              },
            },
            spec: {
              accessModes: [serviceVolumeConfig.accessMode || "ReadWriteOnce"],
              storageClassName:
                serviceVolumeConfig.storageClass || "local-path",
              resources: {
                requests: {
                  storage: serviceVolumeConfig.volumeSize,
                },
              },
            },
          };

          const pvcResult =
            await coreV1Api.createNamespacedPersistentVolumeClaim(
              namespaceName,
              pvcSpec
            );

          volumeStatus = pvcResult.body.status?.phase || "Pending";
          logger.info(
            `Created PVC ${volumeClaimName} with size ${serviceVolumeConfig.volumeSize} in namespace ${namespaceName}`
          );
        }
      } catch (pvcCreationError) {
        logger.error(
          `Error creating PVC ${volumeClaimName}:`,
          pvcCreationError
        );
        // Continue with deployment creation even if PVC fails
        // The pod will be in Pending state until PVC is resolved
        volumeStatus = "Failed";
      }
    }

    // Prepare container spec with volume mounts if needed
    const containerSpec = {
      name: serviceName,
      image: dockerImage,
      ports: [
        {
          containerPort: containerPort,
        },
      ],
      resources: serviceConfig.resources || {
        limits: resourceLimits,
        requests: {
          cpu: "0.25",
          memory: "512Mi",
        },
      },
      env: serviceConfig.env || generateEnvironmentVariables(serviceConfig),
    };

    // Add volume mount if PVC was created
    if (volumeClaimName && serviceVolumeConfig.volumeMountPath) {
      containerSpec.volumeMounts = [
        {
          name: serviceVolumeConfig.volumeName || "data-volume",
          mountPath: serviceVolumeConfig.volumeMountPath,
        },
      ];
    }

    // Prepare pod template spec with volumes if needed
    const podTemplateSpec = {
      containers: [containerSpec],
    };

    // Add volume if PVC was created
    if (volumeClaimName) {
      podTemplateSpec.volumes = [
        {
          name: serviceVolumeConfig.volumeName || "data-volume",
          persistentVolumeClaim: {
            claimName: volumeClaimName,
          },
        },
      ];
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
          ...(volumeClaimName && { "paas.volume": "true" }),
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
          spec: podTemplateSpec,
        },
      },
    };

    const result = await appsV1Api.createNamespacedDeployment(
      namespaceName,
      deployment
    );

    // Update ServiceInstance with volume information if PVC was created
    if (volumeClaimName) {
      try {
        await prisma.serviceInstance.updateMany({
          where: {
            subscriptionId: subscriptionId,
            podName: deploymentName,
          },
          data: {
            volumeClaimName: volumeClaimName,
            volumeStatus: volumeStatus,
            volumeSize: serviceVolumeConfig.volumeSize,
            volumeMountPath: serviceVolumeConfig.volumeMountPath,
          },
        });

        logger.info(
          `Updated ServiceInstance with volume info: PVC=${volumeClaimName}, Status=${volumeStatus}`
        );
      } catch (updateError) {
        logger.error(
          `Failed to update ServiceInstance with volume info:`,
          updateError
        );
        // Don't fail deployment creation if database update fails
      }
    }

    logger.info(
      `Created deployment ${deploymentName} in namespace ${namespaceName}${
        volumeClaimName ? ` with PVC ${volumeClaimName}` : ""
      }`
    );

    return result.body;
  } catch (error) {
    logger.error(`Error creating deployment ${deploymentName}:`, error);
    logger.error(`Deployment spec:`, JSON.stringify(deployment, null, 2));
    throw error;
  }
};

/**
 * Create service
 */
export const createService = async ({
  namespaceName,
  serviceName,
  deploymentName,
  port,
  targetPort,
}) => {
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
        logger.error(`Error checking existing service ${serviceName}:`, error);
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
    logger.info(`Created service ${serviceName} in namespace ${namespaceName}`);
    return result.body;
  } catch (error) {
    logger.error(`Error creating service ${serviceName}:`, error);
    logger.error(`Service spec:`, JSON.stringify(service, null, 2));
    throw error;
  }
};

/**
 * Create ingress
 */
export const createIngress = async ({
  namespaceName,
  ingressName,
  serviceName,
  subdomain,
  serviceDomain,
  port,
}) => {
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
        logger.error(`Error checking existing ingress ${ingressName}:`, error);
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
};

/**
 * Generate environment variables for container
 */
export const generateEnvironmentVariables = (serviceConfig) => {
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
};

/**
 * Get all pods with filtering and pagination (Admin only)
 */
export const getAllPods = async (options) => {
  try {
    const { page, limit, status, serviceName, userId, workerNode } = options;

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

    const skip = (page - 1) * limit;

    const [serviceInstances, total] = await Promise.all([
      prisma.serviceInstance.findMany({
        where: whereClause,
        skip,
        take: limit,
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
                  containerPort: true,
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

    // Get real-time status and metrics for each pod and sync database status
    const podsWithStatus = await Promise.all(
      serviceInstances.map(async (instance) => {
        try {
          const status = await getPodStatus(instance.id);

          // Auto-sync database status with real-time Kubernetes status
          if (status.status !== instance.status) {
            try {
              await prisma.serviceInstance.update({
                where: { id: instance.id },
                data: {
                  status: status.status,
                  lastStatusSync: new Date(),
                },
              });

              logger.info(
                `Auto-synced pod ${instance.id} status: ${instance.status} → ${status.status}`
              );

              // Update the instance object to reflect the new status
              instance.status = status.status;
              instance.lastStatusSync = new Date();
            } catch (syncError) {
              logger.error(
                `Failed to sync status for pod ${instance.id}:`,
                syncError
              );
            }
          }

          // Get pod metrics and worker node information if pod is running
          let podMetrics = null;
          let metricsData = null;
          let workerNodeInfo = null;
          if (
            status.status === "RUNNING" &&
            status.pods &&
            status.pods.length > 0
          ) {
            try {
              const runningPod = status.pods[0];
              podMetrics = await getPodMetrics(
                runningPod.name,
                instance.namespace
              );

              // Get detailed pod information including worker node
              const k8sConfig = getKubernetesConfig();
              const coreV1Api = k8sConfig.getCoreV1Api();
              const podResponse = await coreV1Api.readNamespacedPod(
                runningPod.name,
                instance.namespace
              );
              const podSpec = podResponse.body.spec;
              const podStatus = podResponse.body.status;

              // Extract worker node information
              if (podSpec.nodeName) {
                workerNodeInfo = {
                  nodeName: podSpec.nodeName,
                  nodeIP: podStatus.hostIP || null,
                  podIP: podStatus.podIP || null,
                  phase: podStatus.phase || null,
                };

                // Get additional node details if available
                try {
                  const nodeResponse = await coreV1Api.readNode(
                    podSpec.nodeName
                  );
                  const nodeData = nodeResponse.body;
                  const nodeAddresses = nodeData.status?.addresses || [];
                  const nodeInfo = nodeData.status?.nodeInfo || {};

                  workerNodeInfo = {
                    ...workerNodeInfo,
                    nodeLabels: nodeData.metadata?.labels || {},
                    nodeArchitecture: nodeInfo.architecture || null,
                    nodeOS: nodeInfo.operatingSystem || null,
                    kubeletVersion: nodeInfo.kubeletVersion || null,
                    nodeInternalIP:
                      nodeAddresses.find((addr) => addr.type === "InternalIP")
                        ?.address || null,
                    nodeExternalIP:
                      nodeAddresses.find((addr) => addr.type === "ExternalIP")
                        ?.address || null,
                    nodeHostname:
                      nodeAddresses.find((addr) => addr.type === "Hostname")
                        ?.address || podSpec.nodeName,
                  };
                } catch (nodeError) {
                  logger.warn(
                    `Failed to get node details for ${podSpec.nodeName}:`,
                    nodeError.message
                  );
                }
              }

              if (podMetrics) {
                metricsData = parsePodMetrics(podMetrics, podSpec);
              }
            } catch (metricsError) {
              logger.warn(
                `Failed to get metrics for pod ${instance.id}:`,
                metricsError.message
              );
            }
          }

          // Add local access information only in development
          const localAccess =
            process.env.NODE_ENV === "development"
              ? {
                  portForwardCommand: `kubectl port-forward -n ${
                    instance.namespace
                  } service/${
                    instance.credentials?.service || "unknown-service"
                  } 8080:${
                    instance.subscription?.service?.containerPort || 80
                  }`,
                  localUrl: `http://localhost:8080`,
                  podPortForwardCommand: `kubectl port-forward -n ${
                    instance.namespace
                  } pod/${status.pods?.[0]?.name || instance.podName} 8080:${
                    instance.subscription?.service?.containerPort || 80
                  }`,
                  instructions:
                    "Run the port forward command in your terminal, then access the service at the local URL",
                  namespace: instance.namespace,
                  serviceName: instance.credentials?.service,
                  containerPort:
                    instance.subscription?.service?.containerPort || 80,
                  note: instance.subscription?.service?.containerPort
                    ? `Service runs on port ${instance.subscription.service.containerPort}`
                    : "Using default port 80 - verify correct port in service catalog",
                }
              : undefined;

          return {
            ...instance,
            realTimeStatus: status,
            ...(workerNodeInfo && {
              workerNode: workerNodeInfo,
            }),
            ...(metricsData && {
              metrics: {
                cpuUtilization: metricsData.cpuUtilization,
                memoryUtilization: metricsData.memoryUtilization,
                cpuUsage: metricsData.cpuUsage,
                memoryUsage: metricsData.memoryUsage,
                cpuRequests: metricsData.cpuRequests,
                memoryRequests: metricsData.memoryRequests,
                containerMetrics: metricsData.containerMetrics,
                metricsTimestamp: metricsData.timestamp,
                metricsAvailable: true,
              },
            }),
            ...(!metricsData && {
              metrics: {
                cpuUtilization: null,
                memoryUtilization: null,
                cpuUsage: null,
                memoryUsage: null,
                cpuRequests: null,
                memoryRequests: null,
                containerMetrics: [],
                metricsTimestamp: null,
                metricsAvailable: false,
              },
            }),
            ...(localAccess && { localAccess }),
          };
        } catch (error) {
          logger.warn(`Failed to get status for pod ${instance.id}:`, error);
          // Add local access information only in development (even for failed status)
          const localAccess =
            process.env.NODE_ENV === "development"
              ? {
                  portForwardCommand: `kubectl port-forward -n ${
                    instance.namespace
                  } service/${
                    instance.credentials?.service || "unknown-service"
                  } 8080:${
                    instance.subscription?.service?.containerPort || 80
                  }`,
                  localUrl: `http://localhost:8080`,
                  podPortForwardCommand: `kubectl port-forward -n ${
                    instance.namespace
                  } pod/${instance.podName} 8080:${
                    instance.subscription?.service?.containerPort || 80
                  }`,
                  instructions:
                    "Run the port forward command in your terminal, then access the service at the local URL (if pod is running)",
                  namespace: instance.namespace,
                  serviceName: instance.credentials?.service,
                  containerPort:
                    instance.subscription?.service?.containerPort || 80,
                  note: instance.subscription?.service?.containerPort
                    ? `Service runs on port ${instance.subscription.service.containerPort}`
                    : "Using default port 80 - verify correct port in service catalog",
                }
              : undefined;

          return {
            ...instance,
            realTimeStatus: { status: "UNKNOWN", message: error.message },
            metrics: {
              cpuUtilization: null,
              memoryUtilization: null,
              cpuUsage: null,
              memoryUsage: null,
              cpuRequests: null,
              memoryRequests: null,
              containerMetrics: [],
              metricsTimestamp: null,
              metricsAvailable: false,
            },
            ...(localAccess && { localAccess }),
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

    return {
      pods: podsWithStatus,
      statistics: stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error getting all pods:", error);
    throw error;
  }
};

/**
 * Get pod statistics (Admin only)
 */
export const getPodStatistics = async () => {
  try {
    // Get total pod counts by status
    const podCounts = await prisma.serviceInstance.groupBy({
      by: ["status"],
      _count: {
        status: true,
      },
    });

    // Get total pod count
    const totalPods = await prisma.serviceInstance.count();

    // Format the statistics
    const stats = {
      total: totalPods,
      byStatus: podCounts.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {}),
      summary: {
        running:
          podCounts.find((p) => p.status === "RUNNING")?._count.status || 0,
        pending:
          podCounts.find((p) => p.status === "PENDING")?._count.status || 0,
        failed:
          podCounts.find((p) => p.status === "FAILED")?._count.status || 0,
        stopped:
          podCounts.find((p) => p.status === "STOPPED")?._count.status || 0,
      },
      timestamp: new Date(),
    };

    return stats;
  } catch (error) {
    logger.error("Error getting pod statistics:", error);
    throw error;
  }
};

/**
 * Get pod logs (Admin version - can access any pod)
 */
export const getAdminPodLogs = async (serviceInstanceId, logOptions) => {
  try {
    // Get service instance (no user restriction for admin)
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
      throw new Error("Pod not found");
    }

    // Get pod logs using existing method
    const logs = await getPodLogs(serviceInstanceId, logOptions);

    return {
      ...logs,
      owner: serviceInstance.subscription.user,
      service: serviceInstance.subscription.service,
    };
  } catch (error) {
    logger.error("Error getting admin pod logs:", error);
    throw error;
  }
};

/**
 * Restart any pod (Admin version)
 */
export const adminRestartPod = async (serviceInstanceId) => {
  try {
    // Get service instance (no user restriction for admin)
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
      throw new Error("Pod not found");
    }

    // Check if pod is in a restartable state
    if (["DELETED", "DELETING"].includes(serviceInstance.status)) {
      throw new Error("Pod cannot be restarted in current state");
    }

    // Get pod status BEFORE restart to capture current state
    const statusBeforeRestart = await getPodStatus(serviceInstanceId);

    // Restart the pod using existing method
    await restartPod(serviceInstanceId);

    // Wait a moment for Kubernetes to process the restart
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get updated status AFTER restart
    const statusAfterRestart = await getPodStatus(serviceInstanceId);

    // Get detailed pod information to show restart evidence
    const k8sConfig = getKubernetesConfig();
    const coreV1Api = k8sConfig.getCoreV1Api();
    const deploymentConfig = serviceInstance.credentials || {};

    let restartEvidence = {};
    try {
      // Get pods to check restart counts and creation times
      const pods = await coreV1Api.listNamespacedPod(
        serviceInstance.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentConfig.deployment}`
      );

      if (pods.body.items.length > 0) {
        const pod = pods.body.items[0];
        restartEvidence = {
          podName: pod.metadata.name,
          creationTimestamp: pod.metadata.creationTimestamp,
          restartCount: pod.status.containerStatuses?.[0]?.restartCount || 0,
          phase: pod.status.phase,
          restartPolicy: pod.spec.restartPolicy,
          lastRestartTime:
            pod.status.containerStatuses?.[0]?.lastState?.terminated
              ?.finishedAt,
        };
      }
    } catch (podError) {
      logger.warn("Could not get detailed pod restart information:", podError);
    }

    logger.info(
      `Admin successfully restarted pod ${serviceInstanceId} for user ${serviceInstance.subscription.user.email}`
    );

    return {
      id: serviceInstance.id,
      podName: serviceInstance.podName,
      status: statusAfterRestart.status,
      message: "Pod restart initiated by admin",
      restartedAt: new Date(),
      owner: serviceInstance.subscription.user,
      service: serviceInstance.subscription.service,
      restartDetails: {
        statusBefore: statusBeforeRestart,
        statusAfter: statusAfterRestart,
        restartEvidence,
        restartAnnotation: `kubectl.kubernetes.io/restartedAt: ${new Date().toISOString()}`,
      },
    };
  } catch (error) {
    logger.error("Error admin restarting pod:", error);
    throw error;
  }
};

/**
 * Delete any pod (Admin version)
 */
export const adminDeletePod = async (serviceInstanceId) => {
  try {
    // Get service instance (no user restriction for admin)
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
      throw new Error("Pod not found");
    }

    // Delete the pod using existing method (preserve PVC for restart)
    await deletePod(serviceInstanceId, "restart-operation", false);

    logger.info(
      `Admin successfully deleted pod ${serviceInstanceId} for user ${serviceInstance.subscription.user.email}`
    );

    return {
      id: serviceInstance.id,
      podName: serviceInstance.podName,
      message: "Pod deletion initiated by admin",
      deletedAt: new Date(),
      owner: serviceInstance.subscription.user,
      service: serviceInstance.subscription.service,
    };
  } catch (error) {
    logger.error("Error admin deleting pod:", error);
    throw error;
  }
};

/**
 * Get pod details (Admin version - can access any pod)
 */
export const getAdminPodDetails = async (serviceInstanceId) => {
  try {
    // Get service instance with full details (no user restriction for admin)
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
      throw new Error("Pod not found");
    }

    // Get real-time pod status
    const realTimeStatus = await getPodStatus(serviceInstanceId);

    // Get pod metrics and worker node information if pod is running
    let podMetrics = null;
    let metricsData = null;
    let workerNodeInfo = null;
    if (
      realTimeStatus.status === "RUNNING" &&
      realTimeStatus.pods &&
      realTimeStatus.pods.length > 0
    ) {
      try {
        const runningPod = realTimeStatus.pods[0];
        podMetrics = await getPodMetrics(
          runningPod.name,
          serviceInstance.namespace
        );

        // Get detailed pod information including worker node
        const k8sConfig = getKubernetesConfig();
        const coreV1Api = k8sConfig.getCoreV1Api();
        const podResponse = await coreV1Api.readNamespacedPod(
          runningPod.name,
          serviceInstance.namespace
        );
        const podSpec = podResponse.body.spec;
        const podStatus = podResponse.body.status;

        // Extract worker node information
        if (podSpec.nodeName) {
          workerNodeInfo = {
            nodeName: podSpec.nodeName,
            nodeIP: podStatus.hostIP || null,
            podIP: podStatus.podIP || null,
            phase: podStatus.phase || null,
          };

          // Get additional node details if available
          try {
            const nodeResponse = await coreV1Api.readNode(podSpec.nodeName);
            const nodeData = nodeResponse.body;
            const nodeAddresses = nodeData.status?.addresses || [];
            const nodeInfo = nodeData.status?.nodeInfo || {};

            workerNodeInfo = {
              ...workerNodeInfo,
              nodeLabels: nodeData.metadata?.labels || {},
              nodeArchitecture: nodeInfo.architecture || null,
              nodeOS: nodeInfo.operatingSystem || null,
              kubeletVersion: nodeInfo.kubeletVersion || null,
              nodeInternalIP:
                nodeAddresses.find((addr) => addr.type === "InternalIP")
                  ?.address || null,
              nodeExternalIP:
                nodeAddresses.find((addr) => addr.type === "ExternalIP")
                  ?.address || null,
              nodeHostname:
                nodeAddresses.find((addr) => addr.type === "Hostname")
                  ?.address || podSpec.nodeName,
            };
          } catch (nodeError) {
            logger.warn(
              `Failed to get node details for ${podSpec.nodeName}:`,
              nodeError.message
            );
          }
        }

        if (podMetrics) {
          metricsData = parsePodMetrics(podMetrics, podSpec);
        }
      } catch (metricsError) {
        logger.warn(
          `Failed to get metrics for pod ${serviceInstanceId}:`,
          metricsError.message
        );
      }
    }

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

    // Add local access information only in development
    const localAccess =
      process.env.NODE_ENV === "development"
        ? {
            portForwardCommand: `kubectl port-forward -n ${
              serviceInstance.namespace
            } service/${
              serviceInstance.credentials?.service || "unknown-service"
            } 8080:${
              serviceInstance.subscription?.service?.containerPort || 80
            }`,
            localUrl: `http://localhost:8080`,
            podPortForwardCommand: `kubectl port-forward -n ${
              serviceInstance.namespace
            } pod/${
              realTimeStatus.pods?.[0]?.name || serviceInstance.podName
            } 8080:${
              serviceInstance.subscription?.service?.containerPort || 80
            }`,
            instructions:
              "Run the port forward command in your terminal, then access the service at the local URL",
            namespace: serviceInstance.namespace,
            serviceName: serviceInstance.credentials?.service,
            containerPort:
              serviceInstance.subscription?.service?.containerPort || 80,
            note: serviceInstance.subscription?.service?.containerPort
              ? `Service runs on port ${serviceInstance.subscription.service.containerPort}`
              : "Using default port 80 - verify correct port in service catalog",
          }
        : undefined;

    return {
      ...serviceInstance,
      realTimeStatus,
      deploymentConfig,
      customConfig,
      resourceLimits,
      usageMetrics: serviceInstance.subscription.usageMetrics || [],
      ...(workerNodeInfo && {
        workerNode: workerNodeInfo,
      }),
      ...(metricsData && {
        metrics: {
          cpuUtilization: metricsData.cpuUtilization,
          memoryUtilization: metricsData.memoryUtilization,
          cpuUsage: metricsData.cpuUsage,
          memoryUsage: metricsData.memoryUsage,
          cpuRequests: metricsData.cpuRequests,
          memoryRequests: metricsData.memoryRequests,
          containerMetrics: metricsData.containerMetrics,
          metricsTimestamp: metricsData.timestamp,
          metricsAvailable: true,
        },
      }),
      ...(!metricsData && {
        metrics: {
          cpuUtilization: null,
          memoryUtilization: null,
          cpuUsage: null,
          memoryUsage: null,
          cpuRequests: null,
          memoryRequests: null,
          containerMetrics: [],
          metricsTimestamp: null,
          metricsAvailable: false,
        },
      }),
      adminInfo: {
        owner: serviceInstance.subscription.user,
        subscription: {
          id: serviceInstance.subscription.id,
          status: serviceInstance.subscription.status,
          expiresAt: serviceInstance.subscription.expiresAt,
          createdAt: serviceInstance.subscription.createdAt,
        },
      },
      ...(localAccess && { localAccess }),
    };
  } catch (error) {
    logger.error("Error getting admin pod details:", error);
    throw error;
  }
};

/**
 * Admin pod management actions
 */
export const adminPodAction = async (serviceInstanceId, action) => {
  try {
    // Verify pod exists
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
      throw new Error("Pod not found");
    }

    let result = {};

    switch (action) {
      case "restart":
        await restartPod(serviceInstanceId);
        result = {
          action: "restart",
          message: "Pod restart initiated",
          timestamp: new Date(),
        };
        break;

      case "stop":
        await stopPod(serviceInstanceId);
        result = {
          action: "stop",
          message: "Pod stopped successfully",
          timestamp: new Date(),
        };
        break;

      case "start":
        await startPod(serviceInstanceId);
        result = {
          action: "start",
          message: "Pod start initiated",
          timestamp: new Date(),
        };
        break;

      case "delete":
        await deletePod(serviceInstanceId, "admin-delete-action", true);
        result = {
          action: "delete",
          message: "Pod deletion initiated",
          timestamp: new Date(),
        };
        break;

      case "reset":
        const resetResult = await resetPod(serviceInstanceId);
        result = {
          action: "reset",
          message: "Pod reset completed successfully",
          timestamp: new Date(),
          resetDetails: {
            resetCount: resetResult.resetCount,
            newPodName: resetResult.podName,
          },
        };
        break;

      default:
        throw new Error(
          "Invalid action. Supported actions: restart, stop, start, delete, reset"
        );
    }

    // Get updated status
    const updatedStatus = await getPodStatus(serviceInstanceId);

    return {
      podId: serviceInstance.id,
      podName: serviceInstance.podName,
      owner: serviceInstance.subscription.user,
      result,
      status: updatedStatus,
    };
  } catch (error) {
    logger.error("Error performing admin pod action:", error);
    throw error;
  }
};

/**
 * Get orphaned pods (exist in Kubernetes but not in database)
 */
export const getOrphanedPods = async () => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
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
          });

          if (!serviceInstance) {
            orphanedPods.push({
              deploymentName,
              namespace: namespaceName,
              labels,
              createdAt: deployment.metadata.creationTimestamp,
              replicas: deployment.status?.replicas || 0,
              readyReplicas: deployment.status?.readyReplicas || 0,
              reason: "No database record found",
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

    return {
      orphanedPods,
      summary: {
        totalKubernetesPods: totalK8sPods,
        totalDatabasePods: dbPodCount,
        orphanedCount: orphanedPods.length,
        namespacesChecked: namespaces.body.items.length,
      },
    };
  } catch (error) {
    logger.error("Error getting orphaned pods:", error);
    throw error;
  }
};

/**
 * Clean up orphaned pods
 */
export const cleanupOrphanedPods = async (options) => {
  try {
    const { namespaces, deployments } = options;

    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

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
          await cleanupSingleDeployment(
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
      // Get orphaned pods and clean them up
      const orphanedResult = await getOrphanedPods();

      for (const orphaned of orphanedResult.orphanedPods) {
        try {
          await cleanupSingleDeployment(
            orphaned.deploymentName,
            orphaned.namespace,
            { coreV1Api, appsV1Api, networkingV1Api },
            cleanupResults
          );
        } catch (error) {
          cleanupResults.errors.push({
            resource: `deployment/${orphaned.deploymentName}`,
            namespace: orphaned.namespace,
            error: error.message,
          });
        }
      }
    }

    return {
      cleanupResults,
      summary: {
        deploymentsDeleted: cleanupResults.deployments.length,
        servicesDeleted: cleanupResults.services.length,
        ingressesDeleted: cleanupResults.ingresses.length,
        namespacesDeleted: cleanupResults.namespaces.length,
        errors: cleanupResults.errors.length,
      },
    };
  } catch (error) {
    logger.error("Error cleaning up orphaned pods:", error);
    throw error;
  }
};

/**
 * Helper method to clean up a single deployment and its resources
 */
export const cleanupSingleDeployment = async (
  deploymentName,
  namespace,
  k8sApis,
  results
) => {
  const { coreV1Api, appsV1Api, networkingV1Api } = k8sApis;

  logger.info(
    `Starting cleanup for deployment: ${namespace}/${deploymentName}`
  );

  try {
    // Delete ingress first
    try {
      const ingresses = await networkingV1Api.listNamespacedIngress(namespace);
      const relatedIngress = ingresses.body.items.find((ing) =>
        ing.metadata.name.includes(deploymentName)
      );

      if (relatedIngress) {
        await networkingV1Api.deleteNamespacedIngress(
          relatedIngress.metadata.name,
          namespace
        );
        results.ingresses.push(`${namespace}/${relatedIngress.metadata.name}`);
      }
    } catch (error) {
      results.errors.push({
        resource: `ingress for ${deploymentName}`,
        namespace,
        error: error.message,
      });
    }

    // Delete service
    try {
      const services = await coreV1Api.listNamespacedService(namespace);
      const relatedService = services.body.items.find(
        (svc) =>
          svc.metadata.name.includes(deploymentName) &&
          svc.metadata.name !== "kubernetes"
      );

      if (relatedService) {
        await coreV1Api.deleteNamespacedService(
          relatedService.metadata.name,
          namespace
        );
        results.services.push(`${namespace}/${relatedService.metadata.name}`);
      }
    } catch (error) {
      results.errors.push({
        resource: `service for ${deploymentName}`,
        namespace,
        error: error.message,
      });
    }

    // Delete deployment last
    try {
      await appsV1Api.deleteNamespacedDeployment(
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
    } catch (error) {
      results.errors.push({
        resource: `deployment/${deploymentName}`,
        namespace,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error(
      `Error during cleanup of deployment ${deploymentName}:`,
      error
    );
    throw error;
  }
};

/**
 * Debug Kubernetes state (Admin only)
 */
export const debugKubernetesState = async () => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
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

    // Get all namespaces
    const allNamespacesResponse = await coreV1Api.listNamespace();
    debugInfo.namespaces.all = allNamespacesResponse.body.items.map((ns) => ({
      name: ns.metadata.name,
      labels: ns.metadata.labels || {},
      createdAt: ns.metadata.creationTimestamp,
    }));

    // Get managed namespaces (with paas.managed=true label)
    try {
      const managedNamespacesResponse = await coreV1Api.listNamespace(
        undefined,
        undefined,
        undefined,
        undefined,
        "paas.managed=true"
      );
      debugInfo.namespaces.managed = managedNamespacesResponse.body.items.map(
        (ns) => ({
          name: ns.metadata.name,
          labels: ns.metadata.labels || {},
          createdAt: ns.metadata.creationTimestamp,
        })
      );
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
        const deploymentsResponse = await appsV1Api.listNamespacedDeployment(
          namespace.name
        );
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

    return debugInfo;
  } catch (error) {
    logger.error("Error debugging Kubernetes state:", error);
    throw error;
  }
};

/**
 * Get pod metrics from Kubernetes metrics API
 * @param {string} podName - Pod name
 * @param {string} namespace - Pod namespace
 * @returns {Promise<Object|null>} Pod metrics or null
 */
export const getPodMetrics = async (podName, namespace) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      logger.warn("Kubernetes client not ready, skipping pod metrics");
      return null;
    }

    // Try to get metrics API client
    let metricsApi;
    try {
      metricsApi = k8sConfig.getMetricsV1beta1Api();
    } catch (error) {
      logger.warn(
        "Metrics API not available, skipping pod metrics:",
        error.message
      );
      return null;
    }

    // Fetch pod metrics using CustomObjectsApi (pods are namespaced resources)
    const response = await metricsApi.getNamespacedCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      namespace,
      "pods",
      podName
    );
    return response.body;
  } catch (error) {
    if (error.response?.statusCode === 404) {
      logger.warn(
        `Pod metrics not found for ${namespace}/${podName} - metrics server may not be installed`
      );
      return null;
    }
    logger.warn(
      `Error getting pod metrics for ${namespace}/${podName}:`,
      error.message
    );
    return null;
  }
};

/**
 * Get all pod metrics from Kubernetes metrics API for a specific namespace
 * @param {string} namespace - Namespace to get pod metrics from
 * @returns {Promise<Array>} Array of pod metrics
 */
export const getAllPodMetrics = async (namespace) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      logger.warn("Kubernetes client not ready, skipping pod metrics");
      return [];
    }

    // Try to get metrics API client
    let metricsApi;
    try {
      metricsApi = k8sConfig.getMetricsV1beta1Api();
    } catch (error) {
      logger.warn(
        "Metrics API not available, skipping pod metrics:",
        error.message
      );
      return [];
    }

    // Fetch all pod metrics for the namespace using CustomObjectsApi
    const response = await metricsApi.listNamespacedCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      namespace,
      "pods"
    );
    return response.body.items || [];
  } catch (error) {
    logger.warn(
      `Error getting all pod metrics for namespace ${namespace}:`,
      error.message
    );
    return [];
  }
};

/**
 * Get pod metrics for all namespaces
 * @returns {Promise<Array>} Array of pod metrics from all namespaces
 */
export const getAllPodMetricsAllNamespaces = async () => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      logger.warn("Kubernetes client not ready, skipping pod metrics");
      return [];
    }

    // Try to get metrics API client
    let metricsApi;
    try {
      metricsApi = k8sConfig.getMetricsV1beta1Api();
    } catch (error) {
      logger.warn(
        "Metrics API not available, skipping pod metrics:",
        error.message
      );
      return [];
    }

    // Fetch all pod metrics across all namespaces using CustomObjectsApi
    const response = await metricsApi.listClusterCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      "pods"
    );
    return response.body.items || [];
  } catch (error) {
    logger.warn(
      "Error getting all pod metrics for all namespaces:",
      error.message
    );
    return [];
  }
};

/**
 * Parse pod metrics to extract CPU and memory utilization
 * @param {Object} podMetrics - Pod metrics from Kubernetes API
 * @param {Object} podSpec - Pod spec with resource requests/limits
 * @returns {Object} Parsed utilization data
 */
export const parsePodMetrics = (podMetrics, podSpec) => {
  if (!podMetrics || !podMetrics.containers) {
    return {
      cpuUtilization: null,
      memoryUtilization: null,
      cpuUsage: null,
      memoryUsage: null,
      containerMetrics: [],
    };
  }

  const containers = podMetrics.containers || [];
  const containerMetrics = [];
  let totalCpuUsage = 0;
  let totalMemoryUsage = 0;
  let totalCpuRequests = 0;
  let totalMemoryRequests = 0;

  // Process each container's metrics
  for (const container of containers) {
    const usage = container.usage || {};

    // Parse CPU usage (from nanocores to cores)
    const cpuUsageNano = parseInt(usage.cpu?.replace("n", "") || "0");
    const cpuUsageCores = cpuUsageNano / 1000000000; // Convert nanocores to cores

    // Parse memory usage (from bytes to MB)
    const memoryUsageBytes =
      parseInt(usage.memory?.replace("Ki", "") || "0") * 1024; // Ki to bytes
    const memoryUsageMB = memoryUsageBytes / (1024 * 1024); // Bytes to MB

    totalCpuUsage += cpuUsageCores;
    totalMemoryUsage += memoryUsageMB;

    // Find container spec for resource requests
    const containerSpec = podSpec?.containers?.find(
      (c) => c.name === container.name
    );
    const resources = containerSpec?.resources || {};
    const requests = resources.requests || {};

    // Parse resource requests
    let cpuRequest = 0;
    let memoryRequest = 0;

    if (requests.cpu) {
      if (requests.cpu.endsWith("m")) {
        cpuRequest = parseFloat(requests.cpu.replace("m", "")) / 1000; // millicores to cores
      } else {
        cpuRequest = parseFloat(requests.cpu);
      }
    }

    if (requests.memory) {
      if (requests.memory.endsWith("Mi")) {
        memoryRequest = parseFloat(requests.memory.replace("Mi", "")); // MiB to MB (approximately)
      } else if (requests.memory.endsWith("Gi")) {
        memoryRequest = parseFloat(requests.memory.replace("Gi", "")) * 1024; // GiB to MB
      } else if (requests.memory.endsWith("Ki")) {
        memoryRequest = parseFloat(requests.memory.replace("Ki", "")) / 1024; // KiB to MB
      }
    }

    totalCpuRequests += cpuRequest;
    totalMemoryRequests += memoryRequest;

    // Calculate container-level utilization
    const containerCpuUtilization =
      cpuRequest > 0 ? ((cpuUsageCores / cpuRequest) * 100).toFixed(2) : null;
    const containerMemoryUtilization =
      memoryRequest > 0
        ? ((memoryUsageMB / memoryRequest) * 100).toFixed(2)
        : null;

    containerMetrics.push({
      name: container.name,
      cpuUsage: cpuUsageCores.toFixed(3),
      memoryUsage: memoryUsageMB.toFixed(2),
      cpuRequest: cpuRequest.toFixed(3),
      memoryRequest: memoryRequest.toFixed(2),
      cpuUtilization: containerCpuUtilization
        ? parseFloat(containerCpuUtilization)
        : null,
      memoryUtilization: containerMemoryUtilization
        ? parseFloat(containerMemoryUtilization)
        : null,
    });
  }

  // Calculate pod-level utilization
  const podCpuUtilization =
    totalCpuRequests > 0
      ? ((totalCpuUsage / totalCpuRequests) * 100).toFixed(2)
      : null;
  const podMemoryUtilization =
    totalMemoryRequests > 0
      ? ((totalMemoryUsage / totalMemoryRequests) * 100).toFixed(2)
      : null;

  return {
    cpuUtilization: podCpuUtilization ? parseFloat(podCpuUtilization) : null,
    memoryUtilization: podMemoryUtilization
      ? parseFloat(podMemoryUtilization)
      : null,
    cpuUsage: totalCpuUsage.toFixed(3),
    memoryUsage: totalMemoryUsage.toFixed(2),
    cpuRequests: totalCpuRequests.toFixed(3),
    memoryRequests: totalMemoryRequests.toFixed(2),
    containerMetrics,
    timestamp: podMetrics.timestamp,
  };
};

/**
 * Update pod resources (for subscription upgrades)
 * @param {string} podName - Pod name
 * @param {string} namespace - Pod namespace
 * @param {Object} newResourceConfig - New resource configuration
 * @returns {Object} Update result
 */
export const updatePodResources = async (
  podName,
  namespace,
  newResourceConfig
) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    const appsV1Api = k8sConfig.getAppsV1Api();

    // Get current deployment
    const deployment = await appsV1Api.readNamespacedDeployment(
      podName,
      namespace
    );

    if (!deployment) {
      throw new Error(
        `Deployment ${podName} not found in namespace ${namespace}`
      );
    }

    // Update deployment with new resource configuration
    const updatedDeployment = {
      ...deployment.body,
      spec: {
        ...deployment.body.spec,
        template: {
          ...deployment.body.spec.template,
          spec: {
            ...deployment.body.spec.template.spec,
            containers: deployment.body.spec.template.spec.containers.map(
              (container) => ({
                ...container,
                resources: {
                  limits: {
                    cpu:
                      newResourceConfig.cpuLimit ||
                      container.resources?.limits?.cpu ||
                      "1",
                    memory:
                      newResourceConfig.memLimit ||
                      container.resources?.limits?.memory ||
                      "1Gi",
                  },
                  requests: {
                    cpu:
                      newResourceConfig.cpuRequest ||
                      container.resources?.requests?.cpu ||
                      "0.25",
                    memory:
                      newResourceConfig.memRequest ||
                      container.resources?.requests?.memory ||
                      "512Mi",
                  },
                },
                ...(newResourceConfig.environmentVars && {
                  env: [
                    ...(container.env || []),
                    ...Object.entries(newResourceConfig.environmentVars).map(
                      ([key, value]) => ({
                        name: key,
                        value: String(value),
                      })
                    ),
                  ],
                }),
              })
            ),
          },
        },
      },
    };

    // Apply the updated deployment
    const result = await appsV1Api.replaceNamespacedDeployment(
      podName,
      namespace,
      updatedDeployment
    );

    logger.info(`Updated pod resources for ${namespace}/${podName}`, {
      newResources: {
        cpuLimit: newResourceConfig.cpuLimit,
        memLimit: newResourceConfig.memLimit,
        cpuRequest: newResourceConfig.cpuRequest,
        memRequest: newResourceConfig.memRequest,
      },
    });

    return {
      success: true,
      podName,
      namespace,
      updatedResources: newResourceConfig,
      kubernetesResponse: result.body,
    };
  } catch (error) {
    logger.error(
      `Error updating pod resources for ${namespace}/${podName}:`,
      error
    );
    throw error;
  }
};

/**
 * Reset pod - Complete recreation from scratch
 * This is different from restart as it completely destroys and recreates the pod
 * @param {string} serviceInstanceId - Service instance ID
 * @returns {Object} Reset result
 */
export const resetPod = async (serviceInstanceId) => {
  try {
    const k8sConfig = getKubernetesConfig();
    if (!k8sConfig.isReady()) {
      throw new Error("Kubernetes client not ready");
    }

    // Get service instance with full subscription details
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
      include: {
        subscription: {
          include: {
            user: true,
            service: true,
          },
        },
      },
    });

    if (!serviceInstance) {
      throw new Error("Service instance not found");
    }

    const { subscription } = serviceInstance;
    const { user, service } = subscription;

    logger.info(
      `Starting pod reset for service instance ${serviceInstanceId} (user: ${user.email}, service: ${service.name})`
    );

    // Update status to RESETTING
    await prisma.serviceInstance.update({
      where: { id: serviceInstanceId },
      data: { status: "RESETTING" },
    });

    // Step 1: Backup current configuration for potential rollback
    const backupConfig = {
      originalStatus: serviceInstance.status,
      originalCredentials: serviceInstance.credentials,
      originalConfig: serviceInstance.customConfig,
      resetTimestamp: new Date(),
    };

    logger.info(`Backing up configuration for pod ${serviceInstanceId}`);

    // Step 2: Complete cleanup of existing resources
    logger.info(`Cleaning up existing resources for pod ${serviceInstanceId}`);

    try {
      // Use existing deletePod logic but don't update status to DELETED
      const coreV1Api = k8sConfig.getCoreV1Api();
      const appsV1Api = k8sConfig.getAppsV1Api();
      const networkingV1Api = k8sConfig.getNetworkingV1Api();

      const { namespace, podName } = serviceInstance;
      const deploymentConfig = serviceInstance.credentials || {};

      // Delete resources in reverse order (same as deletePod)
      try {
        if (deploymentConfig.ingress) {
          await networkingV1Api.deleteNamespacedIngress(
            deploymentConfig.ingress,
            namespace
          );
          logger.info(`Deleted ingress ${deploymentConfig.ingress} for reset`);
        }
      } catch (error) {
        logger.warn(`Failed to delete ingress during reset: ${error.message}`);
      }

      try {
        if (deploymentConfig.service) {
          await coreV1Api.deleteNamespacedService(
            deploymentConfig.service,
            namespace
          );
          logger.info(`Deleted service ${deploymentConfig.service} for reset`);
        }
      } catch (error) {
        logger.warn(`Failed to delete service during reset: ${error.message}`);
      }

      try {
        if (deploymentConfig.deployment) {
          await appsV1Api.deleteNamespacedDeployment(
            deploymentConfig.deployment,
            namespace
          );
          logger.info(
            `Deleted deployment ${deploymentConfig.deployment} for reset`
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to delete deployment during reset: ${error.message}`
        );
      }

      // Delete PersistentVolumeClaim if it exists (pod reset = harus dihapus)
      const { volumeClaimName } = serviceInstance;
      if (volumeClaimName) {
        try {
          await coreV1Api.deleteNamespacedPersistentVolumeClaim(
            volumeClaimName,
            namespace
          );
          logger.info(
            `Deleted PersistentVolumeClaim ${volumeClaimName} for pod reset`
          );
        } catch (pvcError) {
          if (pvcError.response?.statusCode === 404) {
            logger.warn(
              `PVC ${volumeClaimName} not found during reset, may have been already deleted`
            );
          } else {
            logger.error(
              `Failed to delete PVC ${volumeClaimName} during reset: ${pvcError.message}`
            );
            // Continue with reset even if PVC deletion fails
            // The new PVC will have a different name anyway
          }
        }
      }

      // Wait for resources to be fully cleaned up
      logger.info(`Waiting for resource cleanup to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (cleanupError) {
      logger.error(`Error during resource cleanup for reset:`, cleanupError);
      // Continue with recreation attempt even if cleanup partially failed
    }

    // Step 3: Recreate pod from original service template
    logger.info(
      `Recreating pod from service template for ${serviceInstanceId}`
    );

    try {
      // Generate fresh Kubernetes resource names (same as original)
      const namespaceName = kubernetesUtils.generateNamespaceName(user.id);
      const newPodName = kubernetesUtils.generatePodName(service.name, user.id);
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

      // 1. Ensure namespace exists
      await ensureNamespace(namespaceName, user.id);

      // 2. Create fresh deployment
      const deployment = await createDeployment({
        namespaceName,
        deploymentName: newPodName,
        serviceName: service.name,
        dockerImage: service.dockerImage,
        containerPort: service.containerPort || 80,
        resourceLimits,
        serviceConfig: {}, // Fresh config - no custom user config to avoid issues
        userId: user.id,
        subscriptionId: subscription.id,
      });

      // 3. Create fresh service
      const k8sService = await createService({
        namespaceName,
        serviceName,
        deploymentName: newPodName,
        port: service.containerPort || 80,
        targetPort: service.containerPort || 80,
      });

      // 4. Create fresh ingress
      let ingress = null;
      try {
        ingress = await createIngress({
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
        logger.warn(
          `Failed to create ingress during reset: ${ingressError.message}`
        );
      }

      // Step 4: Update service instance with fresh configuration
      // Clear volume information - new PVC will be created by createDeployment
      const updatedServiceInstance = await prisma.serviceInstance.update({
        where: { id: serviceInstanceId },
        data: {
          status: "PENDING", // Will be updated by monitoring
          podName: newPodName,
          namespace: namespaceName,
          internalUrl,
          externalUrl,
          cpuAllocated: resourceLimits.cpu,
          memAllocated: resourceLimits.memory,
          credentials: {
            deployment: deployment.metadata.name,
            service: k8sService.metadata.name,
            ingress: ingress?.metadata.name,
          },
          customConfig: null, // Reset custom config to avoid issues
          resetCount: (serviceInstance.resetCount || 0) + 1,
          lastResetAt: new Date(),
          resetBackup: JSON.stringify(backupConfig),
          // Clear volume information - fresh PVC will be created
          volumeClaimName: null,
          volumeStatus: null,
          volumeSize: null,
          volumeMountPath: null,
        },
      });

      // Step 5: Start monitoring the new pod
      monitorPodStatus(serviceInstanceId, namespaceName, newPodName);

      // Step 6: Queue notification about pod reset
      try {
        await notificationJobs.queuePodReset(serviceInstanceId, {
          userEmail: user.email,
          serviceName: service.displayName || service.name,
          resetReason: "Pod reset requested",
        });
      } catch (notificationError) {
        logger.error(
          `Failed to queue reset notification for ${serviceInstanceId}:`,
          notificationError
        );
      }

      logger.info(
        `Successfully completed pod reset for service instance ${serviceInstanceId}`
      );

      return {
        id: serviceInstanceId,
        podName: newPodName,
        namespace: namespaceName,
        status: "PENDING",
        message: "Pod reset completed successfully - fresh instance created",
        resetAt: new Date(),
        resetCount: updatedServiceInstance.resetCount,
        backupConfig,
        newConfiguration: {
          deployment: deployment.metadata.name,
          service: k8sService.metadata.name,
          ingress: ingress?.metadata.name,
        },
      };
    } catch (recreationError) {
      logger.error(`Error during pod recreation for reset:`, recreationError);

      // Attempt to restore from backup or mark as failed
      try {
        await prisma.serviceInstance.update({
          where: { id: serviceInstanceId },
          data: {
            status: "FAILED",
            lastError: `Reset failed during recreation: ${recreationError.message}`,
          },
        });
      } catch (updateError) {
        logger.error(
          `Failed to update status after reset failure:`,
          updateError
        );
      }

      throw new Error(
        `Pod reset failed during recreation: ${recreationError.message}`
      );
    }
  } catch (error) {
    logger.error(
      `Error resetting pod for service instance ${serviceInstanceId}:`,
      error
    );

    // Ensure status is updated to reflect failure
    try {
      await prisma.serviceInstance.update({
        where: { id: serviceInstanceId },
        data: {
          status: "FAILED",
          lastError: `Reset failed: ${error.message}`,
        },
      });
    } catch (updateError) {
      logger.error(`Failed to update status after reset error:`, updateError);
    }

    throw error;
  }
};

/**
 * User reset pod - Reset user's own pod
 * @param {string} subscriptionId - Subscription ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Object} Reset result
 */
export const userResetPod = async (subscriptionId, userId) => {
  try {
    // Get subscription with service instance
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        serviceInstance: true,
        user: true,
        service: true,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Verify ownership
    if (subscription.userId !== userId) {
      throw new Error("Access denied - not your subscription");
    }

    // Check if subscription has a service instance
    if (!subscription.serviceInstance) {
      throw new Error("No active service instance found for this subscription");
    }

    // Check if subscription is in a resettable state
    if (!["ACTIVE", "EXPIRED"].includes(subscription.status)) {
      throw new Error("Subscription must be ACTIVE or EXPIRED to reset pod");
    }

    // Check if pod is in a resettable state
    const allowedPodStates = ["RUNNING", "FAILED", "STOPPED", "PENDING"];
    if (!allowedPodStates.includes(subscription.serviceInstance.status)) {
      throw new Error(
        `Pod cannot be reset in current state: ${subscription.serviceInstance.status}`
      );
    }

    logger.info(
      `User ${userId} requesting reset for subscription ${subscriptionId} (pod: ${subscription.serviceInstance.id})`
    );

    // Perform the reset
    const resetResult = await resetPod(subscription.serviceInstance.id);

    return {
      ...resetResult,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        service: subscription.service,
      },
      message:
        "Your service has been reset successfully. It will be available shortly with fresh configuration.",
    };
  } catch (error) {
    logger.error(
      `Error in user reset pod for subscription ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Admin reset pod - Reset any user's pod
 * @param {string} serviceInstanceId - Service instance ID
 * @returns {Object} Reset result with admin info
 */
export const adminResetPod = async (serviceInstanceId) => {
  try {
    // Get service instance with full details
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
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
            service: true,
          },
        },
      },
    });

    if (!serviceInstance) {
      throw new Error("Pod not found");
    }

    logger.info(
      `Admin resetting pod ${serviceInstanceId} for user ${serviceInstance.subscription.user.email}`
    );

    // Perform the reset
    const resetResult = await resetPod(serviceInstanceId);

    return {
      ...resetResult,
      adminInfo: {
        owner: serviceInstance.subscription.user,
        subscription: {
          id: serviceInstance.subscription.id,
          status: serviceInstance.subscription.status,
        },
        service: serviceInstance.subscription.service,
      },
      message: "Pod reset completed by admin - user will be notified",
    };
  } catch (error) {
    logger.error(`Error in admin reset pod for ${serviceInstanceId}:`, error);
    throw error;
  }
};
