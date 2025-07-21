import express from "express";
import { adminOnly } from "../middleware/auth.middleware.js";
import * as userController from "../controllers/user.controller.js";
import {
  validate,
  createUserSchema,
  updateUserSchema,
  changeUserPasswordSchema,
  userIdSchema,
  getUsersQuerySchema,
} from "../validations/user.validation.js";

const router = express.Router();

/**
 * @route   GET /api/v1/users
 * @desc    Get all users with pagination and filtering (Admin only)
 * @access  Private (Admin)
 * @query   page, limit, role, isActive, search
 */
router.get(
  "/",
  adminOnly,
  validate(getUsersQuerySchema, "query"),
  userController.getAllUsers
);

/**
 * @route   GET /api/v1/users/stats
 * @desc    Get user statistics (Admin only)
 * @access  Private (Admin)
 */
router.get("/stats", adminOnly, userController.getUserStats);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID (Admin only)
 * @access  Private (Admin)
 */
router.get(
  "/:id",
  adminOnly,
  validate(userIdSchema, "params"),
  userController.getUserById
);

/**
 * @route   POST /api/v1/users
 * @desc    Create new user (Admin only)
 * @access  Private (Admin)
 * @body    name, email, password, role, isActive
 */
router.post(
  "/",
  adminOnly,
  validate(createUserSchema),
  userController.createUser
);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user (Admin only)
 * @access  Private (Admin)
 * @body    name, email, role, isActive
 */
router.put(
  "/:id",
  adminOnly,
  validate(userIdSchema, "params"),
  validate(updateUserSchema),
  userController.updateUser
);

/**
 * @route   PATCH /api/v1/users/:id/password
 * @desc    Change user password (Admin only)
 * @access  Private (Admin)
 * @body    newPassword
 */
router.patch(
  "/:id/password",
  adminOnly,
  validate(userIdSchema, "params"),
  validate(changeUserPasswordSchema),
  userController.changeUserPassword
);

/**
 * @route   PATCH /api/v1/users/:id/toggle-status
 * @desc    Toggle user active status (Admin only)
 * @access  Private (Admin)
 */
router.patch(
  "/:id/toggle-status",
  adminOnly,
  validate(userIdSchema, "params"),
  userController.toggleUserStatus
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user (Admin only)
 * @access  Private (Admin)
 */
router.delete(
  "/:id",
  adminOnly,
  validate(userIdSchema, "params"),
  userController.deleteUser
);

export default router;
