import Joi from "joi";

/**
 * Worker node creation validation schema
 */
const createWorkerNodeSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.empty": "Worker node name is required",
    "string.min": "Worker node name must be at least 2 characters long",
    "string.max": "Worker node name must not exceed 100 characters",
    "any.required": "Worker node name is required",
  }),

  hostname: Joi.string().min(3).max(255).required().messages({
    "string.empty": "Hostname is required",
    "string.min": "Hostname must be at least 3 characters long",
    "string.max": "Hostname must not exceed 255 characters",
    "any.required": "Hostname is required",
  }),

  ipAddress: Joi.string().ip().required().messages({
    "string.ip": "Please provide a valid IP address",
    "any.required": "IP address is required",
  }),

  // Node Specifications
  architecture: Joi.string().valid("amd64", "arm64").default("amd64").messages({
    "any.only": "Architecture must be either amd64 or arm64",
  }),

  operatingSystem: Joi.string().default("linux").messages({
    "string.base": "Operating system must be a string",
  }),

  // Hardware Resources
  cpuCores: Joi.number().integer().min(1).max(128).required().messages({
    "number.base": "CPU cores must be a number",
    "number.integer": "CPU cores must be an integer",
    "number.min": "CPU cores must be at least 1",
    "number.max": "CPU cores must not exceed 128",
    "any.required": "CPU cores is required",
  }),

  cpuArchitecture: Joi.string().required().messages({
    "string.empty": "CPU architecture is required",
    "any.required":
      "CPU architecture is required (e.g., 'Ryzen 6900HS', 'Intel i7 Gen7')",
  }),

  totalMemory: Joi.string().required().messages({
    "string.empty": "Total memory is required",
    "any.required": "Total memory is required (e.g., '32Gi', '64Gi')",
  }),

  totalStorage: Joi.string().required().messages({
    "string.empty": "Total storage is required",
    "any.required": "Total storage is required (e.g., '1Ti', '500Gi')",
  }),

  // Resource Allocation
  allocatedCPU: Joi.string().default("0").messages({
    "string.base": "Allocated CPU must be a string",
  }),

  allocatedMemory: Joi.string().default("0").messages({
    "string.base": "Allocated memory must be a string",
  }),

  allocatedStorage: Joi.string().default("0").messages({
    "string.base": "Allocated storage must be a string",
  }),

  // Capacity Management
  maxPods: Joi.number().integer().min(1).max(500).default(30).messages({
    "number.base": "Max pods must be a number",
    "number.integer": "Max pods must be an integer",
    "number.min": "Max pods must be at least 1",
    "number.max": "Max pods must not exceed 500",
  }),

  currentPods: Joi.number().integer().min(0).default(0).messages({
    "number.base": "Current pods must be a number",
    "number.integer": "Current pods must be an integer",
    "number.min": "Current pods cannot be negative",
  }),

  // Node Status
  status: Joi.string()
    .valid("PENDING", "ACTIVE", "INACTIVE", "MAINTENANCE", "NOT_READY")
    .default("PENDING")
    .messages({
      "any.only":
        "Status must be one of: PENDING, ACTIVE, INACTIVE, MAINTENANCE, NOT_READY",
    }),

  isReady: Joi.boolean().default(false).messages({
    "boolean.base": "Ready status must be a boolean",
  }),

  isSchedulable: Joi.boolean().default(true).messages({
    "boolean.base": "Schedulable status must be a boolean",
  }),

  // Kubernetes Labels and Taints
  labels: Joi.object()
    .pattern(Joi.string(), Joi.string())
    .default({})
    .messages({
      "object.base": "Labels must be an object",
    }),

  taints: Joi.array().items(Joi.object()).default([]).messages({
    "array.base": "Taints must be an array",
  }),

  // Additional Metadata
  kubeletVersion: Joi.string().optional().messages({
    "string.base": "Kubelet version must be a string",
  }),

  containerRuntime: Joi.string().optional().messages({
    "string.base": "Container runtime must be a string",
  }),

  kernelVersion: Joi.string().optional().messages({
    "string.base": "Kernel version must be a string",
  }),

  osImage: Joi.string().optional().messages({
    "string.base": "OS image must be a string",
  }),
});

/**
 * Worker node update validation schema
 */
const updateWorkerNodeSchema = Joi.object({
  name: Joi.string().min(2).max(100).messages({
    "string.empty": "Worker node name cannot be empty",
    "string.min": "Worker node name must be at least 2 characters long",
    "string.max": "Worker node name must not exceed 100 characters",
  }),

  hostname: Joi.string().min(3).max(255).messages({
    "string.empty": "Hostname cannot be empty",
    "string.min": "Hostname must be at least 3 characters long",
    "string.max": "Hostname must not exceed 255 characters",
  }),

  ipAddress: Joi.string().ip().messages({
    "string.ip": "Please provide a valid IP address",
  }),

  // Node Specifications
  architecture: Joi.string().valid("amd64", "arm64").messages({
    "any.only": "Architecture must be either amd64 or arm64",
  }),

  operatingSystem: Joi.string().messages({
    "string.base": "Operating system must be a string",
  }),

  // Hardware Resources
  cpuCores: Joi.number().integer().min(1).max(128).messages({
    "number.base": "CPU cores must be a number",
    "number.integer": "CPU cores must be an integer",
    "number.min": "CPU cores must be at least 1",
    "number.max": "CPU cores must not exceed 128",
  }),

  cpuArchitecture: Joi.string().messages({
    "string.base": "CPU architecture must be a string",
  }),

  totalMemory: Joi.string().messages({
    "string.base": "Total memory must be a string",
  }),

  totalStorage: Joi.string().messages({
    "string.base": "Total storage must be a string",
  }),

  // Resource Allocation
  allocatedCPU: Joi.string().messages({
    "string.base": "Allocated CPU must be a string",
  }),

  allocatedMemory: Joi.string().messages({
    "string.base": "Allocated memory must be a string",
  }),

  allocatedStorage: Joi.string().messages({
    "string.base": "Allocated storage must be a string",
  }),

  // Capacity Management
  maxPods: Joi.number().integer().min(1).max(500).messages({
    "number.base": "Max pods must be a number",
    "number.integer": "Max pods must be an integer",
    "number.min": "Max pods must be at least 1",
    "number.max": "Max pods must not exceed 500",
  }),

  currentPods: Joi.number().integer().min(0).messages({
    "number.base": "Current pods must be a number",
    "number.integer": "Current pods must be an integer",
    "number.min": "Current pods cannot be negative",
  }),

  // Node Status
  status: Joi.string()
    .valid("PENDING", "ACTIVE", "INACTIVE", "MAINTENANCE", "NOT_READY")
    .messages({
      "any.only":
        "Status must be one of: PENDING, ACTIVE, INACTIVE, MAINTENANCE, NOT_READY",
    }),

  isReady: Joi.boolean().messages({
    "boolean.base": "Ready status must be a boolean",
  }),

  isSchedulable: Joi.boolean().messages({
    "boolean.base": "Schedulable status must be a boolean",
  }),

  // Kubernetes Labels and Taints
  labels: Joi.object().pattern(Joi.string(), Joi.string()).messages({
    "object.base": "Labels must be an object",
  }),

  taints: Joi.array().items(Joi.object()).messages({
    "array.base": "Taints must be an array",
  }),

  // Additional Metadata
  kubeletVersion: Joi.string().messages({
    "string.base": "Kubelet version must be a string",
  }),

  containerRuntime: Joi.string().messages({
    "string.base": "Container runtime must be a string",
  }),

  kernelVersion: Joi.string().messages({
    "string.base": "Kernel version must be a string",
  }),

  osImage: Joi.string().messages({
    "string.base": "OS image must be a string",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

/**
 * Worker node query validation schema
 */
const queryWorkerNodesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),

  status: Joi.string()
    .valid("PENDING", "ACTIVE", "INACTIVE", "MAINTENANCE", "NOT_READY")
    .messages({
      "any.only":
        "Status filter must be one of: PENDING, ACTIVE, INACTIVE, MAINTENANCE, NOT_READY",
    }),

  isSchedulable: Joi.boolean().messages({
    "boolean.base": "Schedulable filter must be a boolean",
  }),

  isReady: Joi.boolean().messages({
    "boolean.base": "Ready filter must be a boolean",
  }),

  search: Joi.string().max(100).messages({
    "string.max": "Search term must not exceed 100 characters",
  }),

  sortBy: Joi.string()
    .valid("name", "hostname", "cpuCores", "totalMemory", "status", "createdAt")
    .default("createdAt")
    .messages({
      "any.only":
        "Sort by must be one of: name, hostname, cpuCores, totalMemory, status, createdAt",
    }),

  sortOrder: Joi.string().valid("asc", "desc").default("desc").messages({
    "any.only": "Sort order must be either asc or desc",
  }),
});

/**
 * Worker node status update validation schema
 */
const updateNodeStatusSchema = Joi.object({
  status: Joi.string()
    .valid("PENDING", "ACTIVE", "INACTIVE", "MAINTENANCE", "NOT_READY")
    .required()
    .messages({
      "any.only":
        "Status must be one of: PENDING, ACTIVE, INACTIVE, MAINTENANCE, NOT_READY",
      "any.required": "Status is required",
    }),
});

/**
 * Worker node resource update validation schema
 */
const updateNodeResourcesSchema = Joi.object({
  allocatedCPU: Joi.string().messages({
    "string.base": "Allocated CPU must be a string",
  }),

  allocatedMemory: Joi.string().messages({
    "string.base": "Allocated memory must be a string",
  }),

  allocatedStorage: Joi.string().messages({
    "string.base": "Allocated storage must be a string",
  }),

  currentPods: Joi.number().integer().min(0).messages({
    "number.base": "Current pods must be a number",
    "number.integer": "Current pods must be an integer",
    "number.min": "Current pods cannot be negative",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one resource field must be provided for update",
  });

/**
 * Worker node ID parameter validation schema
 */
const workerNodeIdSchema = Joi.object({
  id: Joi.string().required().messages({
    "string.empty": "Worker node ID is required",
    "any.required": "Worker node ID is required",
  }),
});

/**
 * Worker node name parameter validation schema
 */
const workerNodeNameSchema = Joi.object({
  name: Joi.string().required().messages({
    "string.empty": "Worker node name is required",
    "any.required": "Worker node name is required",
  }),
});

/**
 * Worker node ID or name parameter validation schema (flexible)
 */
const workerNodeIdOrNameSchema = Joi.object({
  nodeId: Joi.string().required().messages({
    "string.empty": "Worker node ID or name is required",
    "any.required": "Worker node ID or name is required",
  }),
});

/**
 * Worker node registration validation schema (for auto-registration)
 */
const workerRegistrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.empty": "Worker node name is required",
    "string.min": "Worker node name must be at least 2 characters long",
    "string.max": "Worker node name must not exceed 100 characters",
    "any.required": "Worker node name is required",
  }),

  hostname: Joi.string().min(3).max(255).required().messages({
    "string.empty": "Hostname is required",
    "string.min": "Hostname must be at least 3 characters long",
    "string.max": "Hostname must not exceed 255 characters",
    "any.required": "Hostname is required",
  }),

  ipAddress: Joi.string().ip().required().messages({
    "string.ip": "Please provide a valid IP address",
    "any.required": "IP address is required",
  }),

  // Hardware Resources (required for auto-registration)
  cpuCores: Joi.number().integer().min(1).max(128).required().messages({
    "number.base": "CPU cores must be a number",
    "number.integer": "CPU cores must be an integer",
    "number.min": "CPU cores must be at least 1",
    "number.max": "CPU cores must not exceed 128",
    "any.required": "CPU cores is required",
  }),

  cpuArchitecture: Joi.string().required().messages({
    "string.empty": "CPU architecture is required",
    "any.required": "CPU architecture is required",
  }),

  totalMemory: Joi.string().required().messages({
    "string.empty": "Total memory is required",
    "any.required": "Total memory is required (e.g., '32Gi', '64Gi')",
  }),

  totalStorage: Joi.string().required().messages({
    "string.empty": "Total storage is required",
    "any.required": "Total storage is required (e.g., '1Ti', '500Gi')",
  }),

  // Node Specifications
  architecture: Joi.string().valid("amd64", "arm64").default("amd64").messages({
    "any.only": "Architecture must be either amd64 or arm64",
  }),

  operatingSystem: Joi.string().default("linux").messages({
    "string.base": "Operating system must be a string",
  }),

  // Optional Kubernetes metadata
  kubeletVersion: Joi.string().optional().messages({
    "string.base": "Kubelet version must be a string",
  }),

  containerRuntime: Joi.string().optional().messages({
    "string.base": "Container runtime must be a string",
  }),

  kernelVersion: Joi.string().optional().messages({
    "string.base": "Kernel version must be a string",
  }),

  osImage: Joi.string().optional().messages({
    "string.base": "OS image must be a string",
  }),

  // Optional capacity settings
  maxPods: Joi.number().integer().min(1).max(250).default(110).messages({
    "number.base": "Max pods must be a number",
    "number.integer": "Max pods must be an integer",
    "number.min": "Max pods must be at least 1",
    "number.max": "Max pods must not exceed 250",
  }),

  // Optional labels and taints
  labels: Joi.object()
    .pattern(Joi.string(), Joi.string())
    .default({})
    .messages({
      "object.base": "Labels must be an object",
    }),

  taints: Joi.array().items(Joi.object()).default([]).messages({
    "array.base": "Taints must be an array",
  }),
});

/**
 * Worker node heartbeat validation schema (for realtime heartbeat updates)
 */
const workerHeartbeatSchema = Joi.object({
  // Optional resource metrics in heartbeat
  allocatedCPU: Joi.number().min(0).optional().messages({
    "number.base": "Allocated CPU must be a number",
    "number.min": "Allocated CPU cannot be negative",
  }),

  allocatedMemory: Joi.number().integer().min(0).optional().messages({
    "number.base": "Allocated memory must be a number (in MB)",
    "number.integer": "Allocated memory must be an integer",
    "number.min": "Allocated memory cannot be negative",
  }),

  allocatedStorage: Joi.number().integer().min(0).optional().messages({
    "number.base": "Allocated storage must be a number (in GB)",
    "number.integer": "Allocated storage must be an integer",
    "number.min": "Allocated storage cannot be negative",
  }),

  currentPods: Joi.number().integer().min(0).optional().messages({
    "number.base": "Current pods must be a number",
    "number.integer": "Current pods must be an integer",
    "number.min": "Current pods cannot be negative",
  }),

  // Note: System usage metrics (cpuUsagePercent, memoryUsagePercent, storageUsagePercent)
  // are not stored in database - removed from validation to match database schema

  // Optional status update
  status: Joi.string()
    .valid("ACTIVE", "INACTIVE", "MAINTENANCE", "PENDING", "NOT_READY")
    .optional()
    .messages({
      "any.only":
        "Status must be one of: ACTIVE, INACTIVE, MAINTENANCE, PENDING, NOT_READY",
    }),

  // Optional ready state update
  isReady: Joi.boolean().optional().messages({
    "boolean.base": "Ready status must be a boolean",
  }),
});

/**
 * Generic validation middleware
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate (body, query, params)
 */
const validate = (schema, property = "body") => {
  return async (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      const { validationError } = await import("../utils/response.util.js");
      return res.status(400).json(validationError(errors));
    }

    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

// Validation middleware functions
const validateCreateWorkerNode = validate(createWorkerNodeSchema);
const validateUpdateWorkerNode = validate(updateWorkerNodeSchema);
const validateGetAllWorkerNodes = validate(queryWorkerNodesSchema, "query");
const validateUpdateNodeStatus = validate(updateNodeStatusSchema);
const validateUpdateNodeResources = validate(updateNodeResourcesSchema);
const validateWorkerNodeId = validate(workerNodeIdSchema, "params");
const validateWorkerNodeName = validate(workerNodeNameSchema, "params");
const validateWorkerNodeIdOrName = validate(workerNodeIdOrNameSchema, "params");
const validateWorkerRegistration = validate(workerRegistrationSchema);
const validateWorkerHeartbeat = validate(workerHeartbeatSchema);

export {
  createWorkerNodeSchema,
  updateWorkerNodeSchema,
  queryWorkerNodesSchema,
  updateNodeStatusSchema,
  updateNodeResourcesSchema,
  workerNodeIdSchema,
  workerNodeNameSchema,
  workerNodeIdOrNameSchema,
  workerRegistrationSchema,
  workerHeartbeatSchema,
  validate,
  validateCreateWorkerNode,
  validateUpdateWorkerNode,
  validateGetAllWorkerNodes,
  validateUpdateNodeStatus,
  validateUpdateNodeResources,
  validateWorkerNodeId,
  validateWorkerNodeName,
  validateWorkerNodeIdOrName,
  validateWorkerRegistration,
  validateWorkerHeartbeat,
};
