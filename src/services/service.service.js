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
          availableQuota: true,
          variant: true,
          variantDisplayName: true,
          sortOrder: true,
          isDefaultVariant: true,
          category: true,
          tags: true,
          icon: true,
          features: true,
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
        availableQuota: true,
        variant: true,
        variantDisplayName: true,
        sortOrder: true,
        isDefaultVariant: true,
        category: true,
        tags: true,
        icon: true,
        features: true,
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
        availableQuota: true,
        variant: true,
        variantDisplayName: true,
        sortOrder: true,
        isDefaultVariant: true,
        category: true,
        tags: true,
        icon: true,
        features: true,
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
        availableQuota: true,
        variant: true,
        variantDisplayName: true,
        sortOrder: true,
        isDefaultVariant: true,
        category: true,
        tags: true,
        icon: true,
        features: true,
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
        availableQuota: true,
        variant: true,
        variantDisplayName: true,
        sortOrder: true,
        isDefaultVariant: true,
        category: true,
        tags: true,
        icon: true,
        features: true,
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

/**
 * Get grouped services (for frontend - one card per service with variants)
 * @param {Object} options - Query options
 * @param {string} options.search - Search term
 * @param {string} options.category - Category filter
 * @returns {Promise<Object>} Grouped services with variants
 */
const getGroupedServices = async (options = {}) => {
  try {
    const { search, category } = options;

    const where = {
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(category && { category }),
    };

    // Get all services ordered by name and variant sort order
    const allServices = await prisma.serviceCatalog.findMany({
      where,
      orderBy: [{ name: "asc" }, { sortOrder: "asc" }],
    });

    // Group services by base name
    const groupedMap = new Map();

    allServices.forEach((service) => {
      if (!groupedMap.has(service.name)) {
        groupedMap.set(service.name, {
          name: service.name,
          displayName: service.displayName,
          description: service.description,
          category: service.category,
          tags: service.tags || [],
          icon: service.icon,
          variants: [],
        });
      }

      const group = groupedMap.get(service.name);

      // Convert memory format from Mi/Gi to MB/GB for user-friendly display
      const convertMemoryFormat = (memValue) => {
        if (!memValue) return memValue;
        return memValue.replace(/Mi$/, "MB RAM").replace(/Gi$/, "GB RAM");
      };

      // Add CPU suffix for user-friendly display
      const formatCpuSpec = (cpuValue) => {
        if (!cpuValue) return cpuValue;
        return `${cpuValue} CPU`;
      };

      group.variants.push({
        id: service.id,
        variant: service.variant,
        variantDisplayName: service.variantDisplayName,
        description: service.description,
        cpuSpec: formatCpuSpec(service.cpuRequest),
        memSpec: convertMemoryFormat(service.memRequest),
        monthlyPrice: service.monthlyPrice,
        availableQuota: service.availableQuota,
        isDefault: service.isDefaultVariant,
        features: service.features || [],
        sortOrder: service.sortOrder,
      });
    });

    // Convert map to array and sort variants within each group
    const groupedServices = Array.from(groupedMap.values()).map((group) => ({
      ...group,
      variants: group.variants.sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    logger.info(`Retrieved ${groupedServices.length} grouped services`);

    return {
      services: groupedServices,
      total: groupedServices.length,
    };
  } catch (error) {
    logger.error("Error getting grouped services:", error);
    throw error;
  }
};

/**
 * Get service variants by base service name
 * @param {string} serviceName - Base service name
 * @returns {Promise<Object>} Service with all variants
 */
const getServiceVariants = async (serviceName) => {
  try {
    const variants = await prisma.serviceCatalog.findMany({
      where: {
        name: serviceName,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    if (variants.length === 0) {
      const error = new Error("Service not found");
      error.code = "SERVICE_NOT_FOUND";
      throw error;
    }

    const baseService = variants[0];

    const result = {
      serviceName: baseService.name,
      displayName: baseService.displayName,
      description: baseService.description,
      category: baseService.category,
      tags: baseService.tags || [],
      icon: baseService.icon,
      variants: variants.map((variant) => ({
        id: variant.id,
        variant: variant.variant,
        variantDisplayName: variant.variantDisplayName,
        description: variant.description,
        cpuRequest: variant.cpuRequest,
        cpuLimit: variant.cpuLimit,
        memRequest: variant.memRequest,
        memLimit: variant.memLimit,
        monthlyPrice: variant.monthlyPrice,
        isDefault: variant.isDefaultVariant,
        features: variant.features || [],
        dockerImage: variant.dockerImage,
        containerPort: variant.containerPort,
        environmentVars: variant.environmentVars,
        sortOrder: variant.sortOrder,
      })),
    };

    logger.info(
      `Retrieved ${variants.length} variants for service: ${serviceName}`
    );

    return result;
  } catch (error) {
    logger.error(`Error getting service variants for ${serviceName}:`, error);
    throw error;
  }
};

/**
 * Get service categories
 * @returns {Promise<Array>} List of unique categories
 */
const getServiceCategories = async () => {
  try {
    const categories = await prisma.serviceCatalog.findMany({
      where: {
        isActive: true,
        category: { not: null },
      },
      select: {
        category: true,
      },
      distinct: ["category"],
    });

    const categoryList = categories
      .map((item) => item.category)
      .filter(Boolean)
      .sort();

    logger.info(`Retrieved ${categoryList.length} service categories`);

    return categoryList;
  } catch (error) {
    logger.error("Error getting service categories:", error);
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
  getGroupedServices,
  getServiceVariants,
  getServiceCategories,
};
