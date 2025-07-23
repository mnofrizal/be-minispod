import * as serviceService from "../services/service.service.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import { USER_ROLES } from "../utils/user-roles.util.js";

/**
 * Service catalog controller
 */

/**
 * Get all services with pagination and filtering (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllServices = async (req, res) => {
  try {
    const result = await serviceService.getAllServices(req.query);

    res.json(responseUtil.success(result, "Services retrieved successfully"));
  } catch (error) {
    logger.error("Error in getAllServices controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve services",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get active services - returns different data based on user role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getActiveServices = async (req, res) => {
  try {
    // Check if user is authenticated and is an administrator
    const isAdmin = req.user && req.user.role === USER_ROLES.ADMINISTRATOR;

    // Use appropriate service function based on user role
    const services = isAdmin
      ? await serviceService.getActiveServicesAdmin()
      : await serviceService.getActiveServices();

    res.json(
      responseUtil.success(services, "Active services retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getActiveServices controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve active services",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get service by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getServiceById = async (req, res) => {
  try {
    const service = await serviceService.getServiceById(req.params.id);

    if (!service) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Service not found",
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res.json(responseUtil.success(service, "Service retrieved successfully"));
  } catch (error) {
    logger.error("Error in getServiceById controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve service",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get service by name - returns different data based on user role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getServiceByName = async (req, res) => {
  try {
    const service = await serviceService.getServiceByName(req.params.name);

    if (!service) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Service not found",
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    // Only return active services for public access
    if (!service.isActive) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Service not found",
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    // Check if user is authenticated and is an administrator
    const isAdmin = req.user && req.user.role === USER_ROLES.ADMINISTRATOR;

    // Filter sensitive data for non-admin users
    let responseData = service;
    if (!isAdmin) {
      const {
        dockerImage,
        containerPort,
        cpuRequest,
        cpuLimit,
        memRequest,
        memLimit,
        environmentVars,
        createdAt,
        updatedAt,
        _count,
        ...publicData
      } = service;
      responseData = publicData;
    }

    res.json(
      responseUtil.success(responseData, "Service retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getServiceByName controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve service",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Create new service (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createService = async (req, res) => {
  try {
    const service = await serviceService.createService(req.body);

    res
      .status(HTTP_STATUS.CREATED)
      .json(responseUtil.success(service, "Service created successfully"));
  } catch (error) {
    logger.error("Error in createService controller:", error);

    if (error.code === "SERVICE_EXISTS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_EXISTS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to create service",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update service (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateService = async (req, res) => {
  try {
    const service = await serviceService.updateService(req.params.id, req.body);

    res.json(responseUtil.success(service, "Service updated successfully"));
  } catch (error) {
    logger.error("Error in updateService controller:", error);

    if (error.code === "SERVICE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update service",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Delete service (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteService = async (req, res) => {
  try {
    const service = await serviceService.deleteService(req.params.id);

    res.json(responseUtil.success(service, "Service deleted successfully"));
  } catch (error) {
    logger.error("Error in deleteService controller:", error);

    if (error.code === "SERVICE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    if (error.code === "SERVICE_HAS_ACTIVE_SUBSCRIPTIONS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_HAS_ACTIVE_SUBSCRIPTIONS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to delete service",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Toggle service active status (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleServiceStatus = async (req, res) => {
  try {
    const service = await serviceService.toggleServiceStatus(req.params.id);

    res.json(
      responseUtil.success(service, "Service status toggled successfully")
    );
  } catch (error) {
    logger.error("Error in toggleServiceStatus controller:", error);

    if (error.code === "SERVICE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to toggle service status",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get service statistics (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getServiceStats = async (req, res) => {
  try {
    const stats = await serviceService.getServiceStats();

    res.json(
      responseUtil.success(stats, "Service statistics retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getServiceStats controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve service statistics",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get grouped services (for frontend - one card per service with variants)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getGroupedServices = async (req, res) => {
  try {
    const result = await serviceService.getGroupedServices(req.query);

    res.json(
      responseUtil.success(result, "Grouped services retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getGroupedServices controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve grouped services",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get service variants by base service name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getServiceVariants = async (req, res) => {
  try {
    const result = await serviceService.getServiceVariants(
      req.params.serviceName
    );

    res.json(
      responseUtil.success(result, "Service variants retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getServiceVariants controller:", error);

    if (error.code === "SERVICE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "SERVICE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve service variants",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get service categories
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getServiceCategories = async (req, res) => {
  try {
    const categories = await serviceService.getServiceCategories();

    res.json(
      responseUtil.success(
        categories,
        "Service categories retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error in getServiceCategories controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve service categories",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

export {
  getAllServices,
  getActiveServices,
  getServiceById,
  getServiceByName,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
  getServiceStats,
  getGroupedServices,
  getServiceVariants,
  getServiceCategories,
};
