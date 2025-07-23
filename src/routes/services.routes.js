import express from "express";
import { adminOnly } from "../middleware/auth.middleware.js";
import * as serviceController from "../controllers/service.controller.js";
import {
  validate,
  createServiceSchema,
  updateServiceSchema,
  serviceIdSchema,
  serviceNameSchema,
  getServicesQuerySchema,
  getGroupedServicesQuerySchema,
} from "../validations/service.validation.js";

const router = express.Router();

/**
 * @route   GET /api/v1/services
 * @desc    Get active services for public catalog
 * @access  Public
 */
router.get("/", serviceController.getActiveServices);

/**
 * @route   GET /api/v1/services/grouped
 * @desc    Get grouped services (for frontend - one card per service with variants)
 * @access  Public
 * @query   search, category
 */
router.get(
  "/grouped",
  validate(getGroupedServicesQuerySchema, "query"),
  serviceController.getGroupedServices
);

/**
 * @route   GET /api/v1/services/categories
 * @desc    Get service categories
 * @access  Public
 */
router.get("/categories", serviceController.getServiceCategories);

/**
 * @route   GET /api/v1/services/admin
 * @desc    Get all services with pagination and filtering (Admin only)
 * @access  Private (Admin)
 * @query   page, limit, isActive, search
 */
router.get(
  "/admin",
  adminOnly,
  validate(getServicesQuerySchema, "query"),
  serviceController.getAllServices
);

/**
 * @route   GET /api/v1/services/admin/stats
 * @desc    Get service statistics (Admin only)
 * @access  Private (Admin)
 */
router.get("/admin/stats", adminOnly, serviceController.getServiceStats);

/**
 * @route   GET /api/v1/services/admin/:id
 * @desc    Get service by ID with full details (Admin only)
 * @access  Private (Admin)
 */
router.get(
  "/admin/:id",
  adminOnly,
  validate(serviceIdSchema, "params"),
  serviceController.getServiceById
);

/**
 * @route   GET /api/v1/services/:name/variants
 * @desc    Get all variants for a specific service
 * @access  Public
 */
router.get(
  "/:name/variants",
  validate(serviceNameSchema, "params"),
  serviceController.getServiceVariants
);

/**
 * @route   GET /api/v1/services/:name
 * @desc    Get service by name (public endpoint)
 * @access  Public
 */
router.get(
  "/:name",
  validate(serviceNameSchema, "params"),
  serviceController.getServiceByName
);

/**
 * @route   POST /api/v1/services
 * @desc    Create new service (Admin only)
 * @access  Private (Admin)
 * @body    name, displayName, description, version, isActive, cpuRequest, cpuLimit, memRequest, memLimit, monthlyPrice, dockerImage, containerPort, environmentVars
 */
router.post(
  "/",
  adminOnly,
  validate(createServiceSchema),
  serviceController.createService
);

/**
 * @route   PUT /api/v1/services/:id
 * @desc    Update service (Admin only)
 * @access  Private (Admin)
 * @body    displayName, description, version, isActive, cpuRequest, cpuLimit, memRequest, memLimit, monthlyPrice, dockerImage, containerPort, environmentVars
 */
router.put(
  "/:id",
  adminOnly,
  validate(serviceIdSchema, "params"),
  validate(updateServiceSchema),
  serviceController.updateService
);

/**
 * @route   PATCH /api/v1/services/:id/toggle-status
 * @desc    Toggle service active status (Admin only)
 * @access  Private (Admin)
 */
router.patch(
  "/:id/toggle-status",
  adminOnly,
  validate(serviceIdSchema, "params"),
  serviceController.toggleServiceStatus
);

/**
 * @route   DELETE /api/v1/services/:id
 * @desc    Delete service (Admin only)
 * @access  Private (Admin)
 */
router.delete(
  "/:id",
  adminOnly,
  validate(serviceIdSchema, "params"),
  serviceController.deleteService
);

export default router;
