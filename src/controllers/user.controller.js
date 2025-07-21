import * as userService from "../services/user.service.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";

/**
 * User controller for admin operations
 */

/**
 * Get all users with pagination and filtering (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllUsers = async (req, res) => {
  try {
    const result = await userService.getAllUsers(req.query);

    res.json(responseUtil.success(result, "Users retrieved successfully"));
  } catch (error) {
    logger.error("Error in getAllUsers controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve users",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get user by ID (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);

    if (!user) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "User not found",
            "USER_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res.json(responseUtil.success(user, "User retrieved successfully"));
  } catch (error) {
    logger.error("Error in getUserById controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve user",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Create new user (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body);

    res
      .status(HTTP_STATUS.CREATED)
      .json(responseUtil.success(user, "User created successfully"));
  } catch (error) {
    logger.error("Error in createUser controller:", error);

    if (error.code === "USER_EXISTS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(error.message, "USER_EXISTS", HTTP_STATUS.CONFLICT)
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to create user",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update user (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);

    res.json(responseUtil.success(user, "User updated successfully"));
  } catch (error) {
    logger.error("Error in updateUser controller:", error);

    if (error.code === "USER_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "USER_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    if (error.code === "EMAIL_EXISTS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            error.message,
            "EMAIL_EXISTS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update user",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Change user password (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const changeUserPassword = async (req, res) => {
  try {
    const user = await userService.changeUserPassword(
      req.params.id,
      req.body.newPassword
    );

    res.json(responseUtil.success(user, "User password changed successfully"));
  } catch (error) {
    logger.error("Error in changeUserPassword controller:", error);

    if (error.code === "USER_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "USER_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to change user password",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Delete user (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteUser = async (req, res) => {
  try {
    const user = await userService.deleteUser(req.params.id);

    res.json(responseUtil.success(user, "User deleted successfully"));
  } catch (error) {
    logger.error("Error in deleteUser controller:", error);

    if (error.code === "USER_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "USER_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    if (error.code === "USER_HAS_ACTIVE_SUBSCRIPTIONS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            error.message,
            "USER_HAS_ACTIVE_SUBSCRIPTIONS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to delete user",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Toggle user active status (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleUserStatus = async (req, res) => {
  try {
    const user = await userService.toggleUserStatus(req.params.id);

    res.json(responseUtil.success(user, "User status toggled successfully"));
  } catch (error) {
    logger.error("Error in toggleUserStatus controller:", error);

    if (error.code === "USER_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            error.message,
            "USER_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to toggle user status",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get user statistics (Admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserStats = async (req, res) => {
  try {
    const stats = await userService.getUserStats();

    res.json(
      responseUtil.success(stats, "User statistics retrieved successfully")
    );
  } catch (error) {
    logger.error("Error in getUserStats controller:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve user statistics",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

export {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
  toggleUserStatus,
  getUserStats,
};
