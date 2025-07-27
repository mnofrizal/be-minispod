import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger.util.js";
import { createResponse } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";

const prisma = new PrismaClient();

/**
 * Calculate prorated billing for subscription upgrade/downgrade
 * @param {string} subscriptionId - Current subscription ID
 * @param {string} newServiceId - Target service ID
 * @returns {Object} Prorated calculation details
 */
export const calculateProratedUpgrade = async (
  subscriptionId,
  newServiceId
) => {
  try {
    // Get current subscription with service details
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: true,
        user: {
          include: {
            balance: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Get target service details
    const newService = await prisma.serviceCatalog.findUnique({
      where: { id: newServiceId },
    });

    if (!newService) {
      throw new Error("Target service not found");
    }

    // Calculate billing cycle details
    const now = new Date();
    const billingCycleStart = subscription.startDate;
    const billingCycleEnd = subscription.expiresAt;

    // Calculate remaining days in current billing cycle
    const totalDays = Math.ceil(
      (billingCycleEnd - billingCycleStart) / (1000 * 60 * 60 * 24)
    );
    const remainingDays = Math.ceil(
      (billingCycleEnd - now) / (1000 * 60 * 60 * 24)
    );

    // Ensure remaining days is not negative
    const validRemainingDays = Math.max(0, remainingDays);

    // Calculate financial amounts
    const oldPlanPrice = parseFloat(subscription.service.monthlyPrice);
    const newPlanPrice = parseFloat(newService.monthlyPrice);

    // Calculate unused amount from current plan (prorated refund)
    const unusedAmount = (oldPlanPrice * validRemainingDays) / totalDays;

    // Calculate prorated amount for new plan
    const proratedNewAmount = (newPlanPrice * validRemainingDays) / totalDays;

    // Calculate net amount (positive = charge, negative = refund)
    const netAmount = proratedNewAmount - unusedAmount;

    // Determine change type
    let changeType = "PLAN_CHANGE";
    if (newPlanPrice > oldPlanPrice) {
      changeType = "UPGRADE";
    } else if (newPlanPrice < oldPlanPrice) {
      changeType = "DOWNGRADE";
    }

    const calculation = {
      subscriptionId,
      currentService: {
        id: subscription.service.id,
        name: subscription.service.displayName,
        variant: subscription.service.variant,
        price: oldPlanPrice,
      },
      targetService: {
        id: newService.id,
        name: newService.displayName,
        variant: newService.variant,
        price: newPlanPrice,
      },
      billingCycle: {
        start: billingCycleStart,
        end: billingCycleEnd,
        totalDays,
        remainingDays: validRemainingDays,
      },
      financial: {
        oldPlanPrice,
        newPlanPrice,
        unusedAmount: Math.round(unusedAmount * 100) / 100, // Round to 2 decimal places
        proratedNewAmount: Math.round(proratedNewAmount * 100) / 100,
        netAmount: Math.round(netAmount * 100) / 100,
        chargeAmount: netAmount > 0 ? Math.round(netAmount * 100) / 100 : 0,
        refundAmount:
          netAmount < 0 ? Math.round(Math.abs(netAmount) * 100) / 100 : 0,
      },
      changeType,
      userBalance: subscription.user.balance
        ? parseFloat(subscription.user.balance.balance)
        : 0,
    };

    logger.info("Prorated calculation completed", {
      subscriptionId,
      changeType,
      netAmount: calculation.financial.netAmount,
    });

    return calculation;
  } catch (error) {
    logger.error("Error calculating prorated upgrade:", error);
    throw error;
  }
};

/**
 * Validate if user can afford the upgrade
 * @param {string} subscriptionId - Subscription ID
 * @param {string} newServiceId - Target service ID
 * @returns {Object} Validation result
 */
export const validateUpgradeEligibility = async (
  subscriptionId,
  newServiceId
) => {
  try {
    const calculation = await calculateProratedUpgrade(
      subscriptionId,
      newServiceId
    );

    const validation = {
      isEligible: true,
      reasons: [],
      calculation,
    };

    // Check if it's an upgrade that requires payment
    if (calculation.financial.netAmount > 0) {
      // Check if user has sufficient balance
      if (calculation.userBalance < calculation.financial.netAmount) {
        validation.isEligible = false;
        validation.reasons.push({
          code: "INSUFFICIENT_BALANCE",
          message: `Insufficient balance. Required: IDR ${calculation.financial.netAmount}, Available: IDR ${calculation.userBalance}`,
        });
      }
    }

    // Check if subscription is in valid state for upgrade
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      validation.isEligible = false;
      validation.reasons.push({
        code: "SUBSCRIPTION_NOT_FOUND",
        message: "Subscription not found",
      });
    } else if (subscription.status !== "ACTIVE") {
      validation.isEligible = false;
      validation.reasons.push({
        code: "INVALID_SUBSCRIPTION_STATUS",
        message: `Subscription must be ACTIVE to upgrade. Current status: ${subscription.status}`,
      });
    }

    // Check if target service is different from current
    if (subscription && subscription.serviceId === newServiceId) {
      validation.isEligible = false;
      validation.reasons.push({
        code: "SAME_SERVICE",
        message: "Target service is the same as current service",
      });
    }

    // Check if target service is active
    const targetService = await prisma.serviceCatalog.findUnique({
      where: { id: newServiceId },
    });

    if (!targetService || !targetService.isActive) {
      validation.isEligible = false;
      validation.reasons.push({
        code: "SERVICE_UNAVAILABLE",
        message: "Target service is not available",
      });
    }

    logger.info("Upgrade eligibility validation completed", {
      subscriptionId,
      newServiceId,
      isEligible: validation.isEligible,
      reasonCount: validation.reasons.length,
    });

    return validation;
  } catch (error) {
    logger.error("Error validating upgrade eligibility:", error);
    throw error;
  }
};

/**
 * Get available upgrade options for a subscription
 * @param {string} subscriptionId - Subscription ID
 * @param {Object} options - Options for filtering
 * @returns {Array} Available upgrade options
 */
export const getUpgradeOptions = async (subscriptionId, options = {}) => {
  const { userRole = "USER", includeDowngrades = false } = options;
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: true,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Get all services with the same base name but different variants
    const availableServices = await prisma.serviceCatalog.findMany({
      where: {
        name: subscription.service.name, // Same service type (n8n, ghost, etc.)
        isActive: true,
        id: {
          not: subscription.serviceId, // Exclude current service
        },
      },
      orderBy: [{ monthlyPrice: "asc" }, { sortOrder: "asc" }],
    });

    // Calculate prorated costs for each option
    const upgradeOptions = await Promise.all(
      availableServices.map(async (service) => {
        try {
          const calculation = await calculateProratedUpgrade(
            subscriptionId,
            service.id
          );

          return {
            serviceId: service.id,
            serviceName: service.displayName,
            variant: service.variant,
            variantDisplayName: service.variantDisplayName,
            monthlyPrice: parseFloat(service.monthlyPrice),
            features: service.features,
            resources: {
              cpu: service.cpuLimit,
              memory: service.memLimit,
            },
            changeType: calculation.changeType,
            proratedCost: calculation.financial.netAmount,
            isUpgrade: calculation.changeType === "UPGRADE",
            isDowngrade: calculation.changeType === "DOWNGRADE",
            savings:
              calculation.changeType === "DOWNGRADE"
                ? Math.abs(calculation.financial.netAmount)
                : 0,
          };
        } catch (error) {
          logger.error(
            `Error calculating upgrade option for service ${service.id}:`,
            error
          );
          return null;
        }
      })
    );

    // Filter out failed calculations and apply role-based filtering
    let validOptions = upgradeOptions.filter((option) => option !== null);

    // For regular users, only show upgrades (higher price plans)
    // For administrators, show all options including downgrades
    if (userRole !== "ADMINISTRATOR" && !includeDowngrades) {
      validOptions = validOptions.filter(
        (option) => option.changeType === "UPGRADE"
      );
    }

    // Sort by price
    validOptions = validOptions.sort((a, b) => a.monthlyPrice - b.monthlyPrice);

    logger.info("Upgrade options retrieved", {
      subscriptionId,
      currentService: subscription.service.displayName,
      optionCount: validOptions.length,
    });

    return {
      currentService: {
        id: subscription.service.id,
        name: subscription.service.displayName,
        variant: subscription.service.variant,
        monthlyPrice: parseFloat(subscription.service.monthlyPrice),
      },
      availableOptions: validOptions,
    };
  } catch (error) {
    logger.error("Error getting upgrade options:", error);
    throw error;
  }
};

/**
 * Create a prorated calculation record in database
 * @param {Object} calculationData - Calculation data
 * @returns {Object} Created calculation record
 */
export const createProratedCalculation = async (calculationData) => {
  try {
    const calculation = await prisma.proratedCalculation.create({
      data: {
        planChangeId: calculationData.planChangeId,
        subscriptionId: calculationData.subscriptionId,
        oldPlanPrice: calculationData.oldPlanPrice,
        newPlanPrice: calculationData.newPlanPrice,
        remainingDays: calculationData.remainingDays,
        totalDays: calculationData.totalDays,
        unusedAmount: calculationData.unusedAmount,
        proratedNewAmount: calculationData.proratedNewAmount,
        netAmount: calculationData.netAmount,
        billingCycleStart: calculationData.billingCycleStart,
        billingCycleEnd: calculationData.billingCycleEnd,
      },
    });

    logger.info("Prorated calculation record created", {
      id: calculation.id,
      subscriptionId: calculationData.subscriptionId,
      netAmount: calculationData.netAmount,
    });

    return calculation;
  } catch (error) {
    logger.error("Error creating prorated calculation record:", error);
    throw error;
  }
};

/**
 * Execute subscription upgrade with pod resource migration
 * @param {string} subscriptionId - Subscription ID
 * @param {string} newServiceId - Target service ID
 * @param {Object} options - Upgrade options
 * @returns {Object} Upgrade result
 */
export const executeSubscriptionUpgrade = async (
  subscriptionId,
  newServiceId,
  options = {}
) => {
  const { reason, initiatedBy, skipPayment = false } = options;

  try {
    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Validate upgrade eligibility
      const validation = await validateUpgradeEligibility(
        subscriptionId,
        newServiceId
      );
      if (!validation.isEligible && !skipPayment) {
        throw new Error(
          `Upgrade not eligible: ${validation.reasons
            .map((r) => r.message)
            .join(", ")}`
        );
      }

      // 2. Get current subscription
      const subscription = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          service: true,
          serviceInstance: true,
          user: {
            include: {
              balance: true,
            },
          },
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // 3. Get target service
      const newService = await tx.serviceCatalog.findUnique({
        where: { id: newServiceId },
      });

      if (!newService) {
        throw new Error("Target service not found");
      }

      // 4. Calculate prorated amounts
      const calculation = await calculateProratedUpgrade(
        subscriptionId,
        newServiceId
      );

      // 5. Create plan change record
      const planChange = await tx.subscriptionPlanChange.create({
        data: {
          subscriptionId,
          fromServiceId: subscription.serviceId,
          toServiceId: newServiceId,
          changeType: calculation.changeType,
          status: "CALCULATING",
          proratedAmount: calculation.financial.netAmount,
          chargeAmount: calculation.financial.chargeAmount,
          refundAmount: calculation.financial.refundAmount,
          initiatedBy: initiatedBy || subscription.userId,
          reason:
            reason ||
            `${calculation.changeType} from ${subscription.service.displayName} to ${newService.displayName}`,
        },
      });

      // 6. Create prorated calculation record
      await tx.proratedCalculation.create({
        data: {
          planChangeId: planChange.id,
          subscriptionId,
          oldPlanPrice: calculation.financial.oldPlanPrice,
          newPlanPrice: calculation.financial.newPlanPrice,
          remainingDays: calculation.billingCycle.remainingDays,
          totalDays: calculation.billingCycle.totalDays,
          unusedAmount: calculation.financial.unusedAmount,
          proratedNewAmount: calculation.financial.proratedNewAmount,
          netAmount: calculation.financial.netAmount,
          billingCycleStart: calculation.billingCycle.start,
          billingCycleEnd: calculation.billingCycle.end,
        },
      });

      // 7. Process payment if required
      if (calculation.financial.netAmount > 0 && !skipPayment) {
        // Update plan change status to payment required
        await tx.subscriptionPlanChange.update({
          where: { id: planChange.id },
          data: { status: "PAYMENT_REQUIRED" },
        });

        // Deduct from user balance
        if (
          subscription.user.balance &&
          subscription.user.balance.balance >= calculation.financial.netAmount
        ) {
          await tx.userBalance.update({
            where: { userId: subscription.userId },
            data: {
              balance: {
                decrement: calculation.financial.netAmount,
              },
            },
          });

          // Create transaction record
          await tx.transaction.create({
            data: {
              userId: subscription.userId,
              type: "SERVICE_PURCHASE",
              status: "SUCCESS",
              description: `Upgrade to ${newService.displayName} - Prorated charge`,
              amount: calculation.financial.netAmount,
              referenceId: planChange.id,
              referenceType: "PLAN_CHANGE",
              subscriptionId: subscriptionId,
            },
          });
        } else {
          throw new Error("Insufficient balance for upgrade");
        }
      } else if (calculation.financial.netAmount < 0) {
        // Process refund for downgrade
        await tx.userBalance.upsert({
          where: { userId: subscription.userId },
          create: {
            userId: subscription.userId,
            balance: Math.abs(calculation.financial.netAmount),
            currency: "IDR",
          },
          update: {
            balance: {
              increment: Math.abs(calculation.financial.netAmount),
            },
          },
        });

        // Create refund transaction record
        await tx.transaction.create({
          data: {
            userId: subscription.userId,
            type: "REFUND",
            status: "SUCCESS",
            description: `Downgrade refund from ${subscription.service.displayName} to ${newService.displayName}`,
            amount: Math.abs(calculation.financial.netAmount),
            referenceId: planChange.id,
            referenceType: "PLAN_CHANGE",
            subscriptionId: subscriptionId,
          },
        });
      }

      // 8. Update subscription service
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          serviceId: newServiceId,
        },
      });

      // 9. Update plan change status to processing
      await tx.subscriptionPlanChange.update({
        where: { id: planChange.id },
        data: { status: "PROCESSING" },
      });

      return {
        planChange,
        calculation,
        subscription,
        newService,
      };
    });

    // 10. Trigger pod resource migration (outside transaction)
    if (result.subscription.serviceInstance) {
      try {
        await migratePodResources(
          result.subscription.serviceInstance.id,
          result.newService
        );

        // Update plan change status to completed
        await prisma.subscriptionPlanChange.update({
          where: { id: result.planChange.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        logger.info("Subscription upgrade completed successfully", {
          subscriptionId,
          planChangeId: result.planChange.id,
          fromService: result.subscription.service.displayName,
          toService: result.newService.displayName,
        });
      } catch (migrationError) {
        logger.error("Pod migration failed during upgrade:", migrationError);

        // Update plan change status to failed
        await prisma.subscriptionPlanChange.update({
          where: { id: result.planChange.id },
          data: {
            status: "FAILED",
            failureReason: `Pod migration failed: ${migrationError.message}`,
          },
        });

        throw new Error(
          `Upgrade payment processed but pod migration failed: ${migrationError.message}`
        );
      }
    } else {
      // No pod to migrate, mark as completed
      await prisma.subscriptionPlanChange.update({
        where: { id: result.planChange.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      planChangeId: result.planChange.id,
      message: `Successfully ${result.calculation.changeType.toLowerCase()}d subscription`,
      calculation: result.calculation,
      newService: {
        id: result.newService.id,
        name: result.newService.displayName,
        variant: result.newService.variant,
      },
    };
  } catch (error) {
    logger.error("Error executing subscription upgrade:", error);
    throw error;
  }
};

/**
 * Migrate pod resources to new service configuration
 * @param {string} serviceInstanceId - Service instance ID
 * @param {Object} newService - New service configuration
 * @returns {Object} Migration result
 */
export const migratePodResources = async (serviceInstanceId, newService) => {
  try {
    // Import pod service (avoid circular dependency)
    const { updatePodResources } = await import("./pod.service.js");

    // Get current service instance
    const serviceInstance = await prisma.serviceInstance.findUnique({
      where: { id: serviceInstanceId },
      include: {
        subscription: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!serviceInstance) {
      throw new Error("Service instance not found");
    }

    // Prepare new resource configuration
    const newResourceConfig = {
      cpuRequest: newService.cpuRequest,
      cpuLimit: newService.cpuLimit,
      memRequest: newService.memRequest,
      memLimit: newService.memLimit,
      environmentVars: newService.environmentVars,
    };

    logger.info("Starting pod resource migration", {
      serviceInstanceId,
      podName: serviceInstance.podName,
      fromResources: {
        cpu: serviceInstance.subscription.service.cpuLimit,
        memory: serviceInstance.subscription.service.memLimit,
      },
      toResources: {
        cpu: newService.cpuLimit,
        memory: newService.memLimit,
      },
    });

    // Update pod resources via Kubernetes
    const migrationResult = await updatePodResources(
      serviceInstance.podName,
      serviceInstance.namespace,
      newResourceConfig
    );

    // Update service instance allocation records
    await prisma.serviceInstance.update({
      where: { id: serviceInstanceId },
      data: {
        cpuAllocated: newService.cpuLimit,
        memAllocated: newService.memLimit,
      },
    });

    logger.info("Pod resource migration completed successfully", {
      serviceInstanceId,
      podName: serviceInstance.podName,
      migrationResult,
    });

    return {
      success: true,
      serviceInstanceId,
      podName: serviceInstance.podName,
      newResources: newResourceConfig,
      migrationResult,
    };
  } catch (error) {
    logger.error("Error migrating pod resources:", error);
    throw error;
  }
};

export default {
  calculateProratedUpgrade,
  validateUpgradeEligibility,
  getUpgradeOptions,
  createProratedCalculation,
  executeSubscriptionUpgrade,
  migratePodResources,
};
