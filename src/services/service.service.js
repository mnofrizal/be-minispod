import { prisma } from "../config/database.js";
import logger from "../utils/logger.util.js";

/**
 * Service catalog service functions
 */

/**
 * Get all services with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {boolean} options.isActive - Active status filter
 * @param {string} options.search - Search term for name/displayName
 * @returns {Promise<Object>} Services list with pagination info
 */
const getAllServices = async (options = {}) => {
  try {
    const { page = 1, limit = 10, isActive, search } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get services with pagination
    const [services, totalCount] = await Promise.all([
      prisma.serviceCatalog.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          version: true,
          isActive: true,
          cpuRequest: true,
          cpuLimit: true,
          memRequest: true,
          memLimit: true,
          monthlyPrice: true,
          dockerImage: true,
          containerPort: true,
          environmentVars: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.serviceCatalog.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    logger.info(
      `Retrieved ${services.length} services (page ${page}/${totalPages})`
    );

    return {
      services,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    logger.error("Error getting services:", error);
    throw error;
  }
};

/**
 * Get active services for public catalog (limited fields)
 * @returns {Promise<Array>} Active services list for public view
 */
const getActiveServices = async () => {
  try {
    const services = await prisma.serviceCatalog.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        version: true,
        monthlyPrice: true,
      },
      orderBy: {
        displayName: "asc",
      },
    });

    logger.info(
      `Retrieved ${services.length} active services for public catalog`
    );

    return services;
  } catch (error) {
    logger.error("Error getting active services:", error);
    throw error;
  }
};

/**
 * Get active services with full details (admin only)
 * @returns {Promise<Array>} Active services list with technical details
 */
const getActiveServicesAdmin = async () => {
  try {
    const services = await prisma.serviceCatalog.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        version: true,
        monthlyPrice: true,
        dockerImage: true,
        containerPort: true,
        cpuRequest: true,
        cpuLimit: true,
        memRequest: true,
        memLimit: true,
        environmentVars: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: {
        displayName: "asc",
      },
    });

    logger.info(`Retrieved ${services.length} active services for admin view`);

    return services;
  } catch (error) {
    logger.error("Error getting active services for admin:", error);
    throw error;
  }
};

/**
 * Get service by ID
 * @param {string} serviceId - Service ID
 * @returns {Promise<Object|null>} Service object or null
 */
const getServiceById = async (serviceId) => {
  try {
    const service = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId },
      include: {
        subscriptions: {
          select: {
            id: true,
            status: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (service) {
      logger.info(`Retrieved service: ${service.name}`);
    }

    return service;
  } catch (error) {
    logger.error("Error getting service by ID:", error);
    throw error;
  }
};

/**
 * Get service by name
 * @param {string} serviceName - Service name
 * @returns {Promise<Object|null>} Service object or null
 */
const getServiceByName = async (serviceName) => {
  try {
    const service = await prisma.serviceCatalog.findUnique({
      where: { name: serviceName },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        version: true,
        isActive: true,
        cpuRequest: true,
        cpuLimit: true,
        memRequest: true,
        memLimit: true,
        monthlyPrice: true,
        dockerImage: true,
        containerPort: true,
        environmentVars: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (service) {
      logger.info(`Retrieved service by name: ${service.name}`);
    }

    return service;
  } catch (error) {
    logger.error("Error getting service by name:", error);
    throw error;
  }
};

/**
 * Create new service (admin only)
 * @param {Object} serviceData - Service data
 * @returns {Promise<Object>} Created service object
 */
const createService = async (serviceData) => {
  try {
    const {
      name,
      displayName,
      description,
      version = "latest",
      isActive = true,
      cpuRequest = "0.25",
      cpuLimit = "1",
      memRequest = "512Mi",
      memLimit = "1Gi",
      monthlyPrice = 0,
      dockerImage,
      containerPort = 80,
      environmentVars,
    } = serviceData;

    // Check if service name already exists
    const existingService = await prisma.serviceCatalog.findUnique({
      where: { name },
    });

    if (existingService) {
      const error = new Error("Service with this name already exists");
      error.code = "SERVICE_EXISTS";
      throw error;
    }

    // Create service
    const service = await prisma.serviceCatalog.create({
      data: {
        name,
        displayName,
        description,
        version,
        isActive,
        cpuRequest,
        cpuLimit,
        memRequest,
        memLimit,
        monthlyPrice,
        dockerImage,
        containerPort,
        environmentVars,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        version: true,
        isActive: true,
        cpuRequest: true,
        cpuLimit: true,
        memRequest: true,
        memLimit: true,
        monthlyPrice: true,
        dockerImage: true,
        containerPort: true,
        environmentVars: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(
      `Created new service: ${service.name} (${service.displayName})`
    );

    return service;
  } catch (error) {
    logger.error("Error creating service:", error);
    throw error;
  }
};

/**
 * Update service (admin only)
 * @param {string} serviceId - Service ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} Updated service object
 */
const updateService = async (serviceId, updateData) => {
  try {
    // Check if service exists
    const existingService = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId },
    });

    if (!existingService) {
      const error = new Error("Service not found");
      error.code = "SERVICE_NOT_FOUND";
      throw error;
    }

    // Update service
    const updatedService = await prisma.serviceCatalog.update({
      where: { id: serviceId },
      data: updateData,
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        version: true,
        isActive: true,
        cpuRequest: true,
        cpuLimit: true,
        memRequest: true,
        memLimit: true,
        monthlyPrice: true,
        dockerImage: true,
        containerPort: true,
        environmentVars: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`Updated service: ${updatedService.name}`);

    return updatedService;
  } catch (error) {
    logger.error("Error updating service:", error);
    throw error;
  }
};

/**
 * Delete service (admin only)
 * @param {string} serviceId - Service ID
 * @returns {Promise<Object>} Deleted service object
 */
const deleteService = async (serviceId) => {
  try {
    // Check if service exists
    const existingService = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId },
      include: {
        subscriptions: true,
      },
    });

    if (!existingService) {
      const error = new Error("Service not found");
      error.code = "SERVICE_NOT_FOUND";
      throw error;
    }

    // Check if service has active subscriptions
    const activeSubscriptions = existingService.subscriptions.filter(
      (sub) => sub.status === "ACTIVE"
    );

    if (activeSubscriptions.length > 0) {
      const error = new Error(
        "Cannot delete service with active subscriptions"
      );
      error.code = "SERVICE_HAS_ACTIVE_SUBSCRIPTIONS";
      throw error;
    }

    // Delete service (this will cascade delete subscriptions due to foreign key)
    const deletedService = await prisma.serviceCatalog.delete({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        displayName: true,
      },
    });

    logger.info(`Deleted service: ${deletedService.name}`);

    return deletedService;
  } catch (error) {
    logger.error("Error deleting service:", error);
    throw error;
  }
};

/**
 * Toggle service active status (admin only)
 * @param {string} serviceId - Service ID
 * @returns {Promise<Object>} Updated service object
 */
const toggleServiceStatus = async (serviceId) => {
  try {
    // Check if service exists
    const existingService = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId },
    });

    if (!existingService) {
      const error = new Error("Service not found");
      error.code = "SERVICE_NOT_FOUND";
      throw error;
    }

    // Toggle active status
    const updatedService = await prisma.serviceCatalog.update({
      where: { id: serviceId },
      data: { isActive: !existingService.isActive },
      select: {
        id: true,
        name: true,
        displayName: true,
        isActive: true,
        updatedAt: true,
      },
    });

    logger.info(
      `Toggled service status: ${updatedService.name} - Active: ${updatedService.isActive}`
    );

    return updatedService;
  } catch (error) {
    logger.error("Error toggling service status:", error);
    throw error;
  }
};

/**
 * Get service statistics (admin only)
 * @returns {Promise<Object>} Service statistics
 */
const getServiceStats = async () => {
  try {
    const [
      totalServices,
      activeServices,
      inactiveServices,
      totalSubscriptions,
      activeSubscriptions,
    ] = await Promise.all([
      prisma.serviceCatalog.count(),
      prisma.serviceCatalog.count({ where: { isActive: true } }),
      prisma.serviceCatalog.count({ where: { isActive: false } }),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
    ]);

    // Get most popular services
    const popularServices = await prisma.serviceCatalog.findMany({
      select: {
        name: true,
        displayName: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: {
        subscriptions: {
          _count: "desc",
        },
      },
      take: 5,
    });

    const stats = {
      totalServices,
      activeServices,
      inactiveServices,
      totalSubscriptions,
      activeSubscriptions,
      popularServices,
    };

    logger.info("Retrieved service statistics");

    return stats;
  } catch (error) {
    logger.error("Error getting service statistics:", error);
    throw error;
  }
};

export {
  getAllServices,
  getActiveServices,
  getActiveServicesAdmin,
  getServiceById,
  getServiceByName,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
  getServiceStats,
};
