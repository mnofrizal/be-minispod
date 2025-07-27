import { PrismaClient } from "@prisma/client";
import {
  getUpgradeOptions,
  validateUpgradeEligibility,
  calculateProratedUpgrade,
  executeSubscriptionUpgrade,
} from "../services/upgrade.service.js";
import { createResponse } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";

const prisma = new PrismaClient();

/**
 * Get available upgrade options for a subscription
 * GET /api/v1/subscriptions/:id/upgrade-options
 */
export const getSubscriptionUpgradeOptions = async (req, res) => {
  try {
    const { id: subscriptionId } = req.params;
    const userId = req.user.id;

    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    const upgradeOptions = await getUpgradeOptions(subscriptionId, {
      userRole: req.user.role,
      includeDowngrades: req.user.role === "ADMINISTRATOR",
    });

    logger.info("Upgrade options retrieved successfully", {
      subscriptionId,
      userId,
      optionCount: upgradeOptions.availableOptions.length,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Upgrade options retrieved successfully",
          upgradeOptions
        )
      );
  } catch (error) {
    logger.error("Error getting upgrade options:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(createResponse(false, "Failed to get upgrade options", null));
  }
};

/**
 * Validate upgrade eligibility
 * POST /api/v1/subscriptions/:id/validate-upgrade
 */
export const validateSubscriptionUpgrade = async (req, res) => {
  const { id: subscriptionId } = req.params;
  const { newServiceId } = req.body;
  const userId = req.user.id;

  try {
    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    const validation = await validateUpgradeEligibility(
      subscriptionId,
      newServiceId
    );

    logger.info("Upgrade validation completed", {
      subscriptionId,
      newServiceId,
      userId,
      isEligible: validation.isEligible,
    });

    const statusCode = validation.isEligible
      ? HTTP_STATUS.OK
      : HTTP_STATUS.BAD_REQUEST;
    const message = validation.isEligible
      ? "Upgrade validation successful"
      : "Upgrade validation failed";

    return res
      .status(statusCode)
      .json(createResponse(validation.isEligible, message, validation));
  } catch (error) {
    logger.error("Error validating upgrade:", error);

    // Handle specific error types with detailed responses
    if (error.message.includes("Subscription not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createResponse(false, "Subscription not found", {
          error: "SUBSCRIPTION_NOT_FOUND",
          message: error.message,
          subscriptionId,
        })
      );
    }

    if (error.message.includes("Target service not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createResponse(false, "Target service not found", {
          error: "SERVICE_NOT_FOUND",
          message: error.message,
          newServiceId,
        })
      );
    }

    if (error.message.includes("same as current service")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Cannot upgrade to the same service", {
          error: "SAME_SERVICE",
          message: error.message,
          subscriptionId,
          newServiceId,
        })
      );
    }

    if (error.message.includes("not available")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Target service is not available", {
          error: "SERVICE_UNAVAILABLE",
          message: error.message,
          newServiceId,
        })
      );
    }

    // Generic error with more details
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createResponse(false, "Failed to validate upgrade", {
        error: "VALIDATION_ERROR",
        message: error.message,
        subscriptionId,
        newServiceId,
        timestamp: new Date().toISOString(),
      })
    );
  }
};

/**
 * Calculate prorated cost for upgrade
 * POST /api/v1/subscriptions/:id/calculate-upgrade
 */
export const calculateUpgradeCost = async (req, res) => {
  const { id: subscriptionId } = req.params;
  const { newServiceId } = req.body;
  const userId = req.user.id;

  try {
    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    const calculation = await calculateProratedUpgrade(
      subscriptionId,
      newServiceId
    );

    logger.info("Upgrade cost calculation completed", {
      subscriptionId,
      newServiceId,
      userId,
      netAmount: calculation.financial.netAmount,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Upgrade cost calculated successfully",
          calculation
        )
      );
  } catch (error) {
    logger.error("Error calculating upgrade cost:", error);

    // Handle specific error types with detailed responses
    if (error.message.includes("Subscription not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createResponse(false, "Subscription not found", {
          error: "SUBSCRIPTION_NOT_FOUND",
          message: error.message,
          subscriptionId,
        })
      );
    }

    if (error.message.includes("Target service not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createResponse(false, "Target service not found", {
          error: "SERVICE_NOT_FOUND",
          message: error.message,
          newServiceId,
        })
      );
    }

    // Generic error with more details
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createResponse(false, "Failed to calculate upgrade cost", {
        error: "CALCULATION_ERROR",
        message: error.message,
        subscriptionId,
        newServiceId,
        timestamp: new Date().toISOString(),
      })
    );
  }
};

/**
 * Get plan change history for a subscription
 * GET /api/v1/subscriptions/:id/plan-changes
 */
export const getPlanChangeHistory = async (req, res) => {
  try {
    const { id: subscriptionId } = req.params;
    const { page = 1, limit = 10, status, changeType } = req.query;
    const userId = req.user.id;

    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    // Build where clause
    const where = {
      subscriptionId,
    };

    if (status) {
      where.status = status;
    }

    if (changeType) {
      where.changeType = changeType;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Get plan changes with related data
    const [planChanges, totalCount] = await Promise.all([
      prisma.subscriptionPlanChange.findMany({
        where,
        include: {
          fromService: {
            select: {
              displayName: true,
              variant: true,
              monthlyPrice: true,
            },
          },
          toService: {
            select: {
              displayName: true,
              variant: true,
              monthlyPrice: true,
            },
          },
          calculation: true,
          initiator: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      prisma.subscriptionPlanChange.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / take);

    const result = {
      planChanges,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPreviousPage: parseInt(page) > 1,
      },
    };

    logger.info("Plan change history retrieved", {
      subscriptionId,
      userId,
      page: parseInt(page),
      count: planChanges.length,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Plan change history retrieved successfully",
          result
        )
      );
  } catch (error) {
    logger.error("Error getting plan change history:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(createResponse(false, "Failed to get plan change history", null));
  }
};

/**
 * Execute subscription upgrade
 * POST /api/v1/subscriptions/:id/upgrade
 */
export const executeUpgrade = async (req, res) => {
  try {
    const { id: subscriptionId } = req.params;
    const { newServiceId, reason, confirmPayment } = req.body;
    const userId = req.user.id;

    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    // Require payment confirmation for upgrades
    if (!confirmPayment) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Payment confirmation required", {
          error: "PAYMENT_CONFIRMATION_REQUIRED",
          message: "Please confirm payment by setting confirmPayment to true",
        })
      );
    }

    const upgradeResult = await executeSubscriptionUpgrade(
      subscriptionId,
      newServiceId,
      {
        reason,
        initiatedBy: userId,
        skipPayment: false,
      }
    );

    logger.info("Subscription upgrade executed successfully", {
      subscriptionId,
      newServiceId,
      userId,
      planChangeId: upgradeResult.planChangeId,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Subscription upgrade completed successfully",
          upgradeResult
        )
      );
  } catch (error) {
    logger.error("Error executing subscription upgrade:", error);

    // Handle specific error types
    if (error.message.includes("Insufficient balance")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Insufficient balance for upgrade", {
          error: "INSUFFICIENT_BALANCE",
          message: error.message,
        })
      );
    }

    if (error.message.includes("not eligible")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Upgrade not eligible", {
          error: "UPGRADE_NOT_ELIGIBLE",
          message: error.message,
        })
      );
    }

    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Failed to execute subscription upgrade", null)
      );
  }
};

/**
 * Execute subscription downgrade
 * POST /api/v1/subscriptions/:id/downgrade
 */
export const executeDowngrade = async (req, res) => {
  try {
    const { id: subscriptionId } = req.params;
    const { newServiceId, reason, confirmDowngrade } = req.body;
    const userId = req.user.id;

    // Verify subscription belongs to user (unless admin)
    if (req.user.role !== "ADMINISTRATOR") {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      });

      if (!subscription) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(createResponse(false, "Subscription not found", null));
      }
    }

    // Require downgrade confirmation
    if (!confirmDowngrade) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createResponse(false, "Downgrade confirmation required", {
          error: "DOWNGRADE_CONFIRMATION_REQUIRED",
          message:
            "Please confirm downgrade by setting confirmDowngrade to true",
        })
      );
    }

    const downgradeResult = await executeSubscriptionUpgrade(
      subscriptionId,
      newServiceId,
      {
        reason,
        initiatedBy: userId,
        skipPayment: false,
      }
    );

    logger.info("Subscription downgrade executed successfully", {
      subscriptionId,
      newServiceId,
      userId,
      planChangeId: downgradeResult.planChangeId,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Subscription downgrade completed successfully",
          downgradeResult
        )
      );
  } catch (error) {
    logger.error("Error executing subscription downgrade:", error);

    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Failed to execute subscription downgrade", null)
      );
  }
};

export default {
  getSubscriptionUpgradeOptions,
  validateSubscriptionUpgrade,
  calculateUpgradeCost,
  getPlanChangeHistory,
  executeUpgrade,
  executeDowngrade,
};
