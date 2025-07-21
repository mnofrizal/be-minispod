import { prisma } from "../config/database.js";
import { hashPassword } from "../utils/crypto.util.js";
import logger from "../utils/logger.util.js";
import { USER_ROLES } from "../utils/user-roles.util.js";

/**
 * User service functions for admin operations
 */

/**
 * Get all users with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {string} options.role - Role filter
 * @param {boolean} options.isActive - Active status filter
 * @param {string} options.search - Search term for name/email
 * @returns {Promise<Object>} Users list with pagination info
 */
const getAllUsers = async (options = {}) => {
  try {
    const { page = 1, limit = 10, role, isActive, search } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (role) {
      where.role = role;
    }

    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
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
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    logger.info(`Retrieved ${users.length} users (page ${page}/${totalPages})`);

    return {
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    logger.error("Error getting users:", error);
    throw error;
  }
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
const getUserById = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        subscriptions: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            service: {
              select: {
                name: true,
                displayName: true,
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

    if (user) {
      logger.info(`Retrieved user: ${user.email}`);
    }

    return user;
  } catch (error) {
    logger.error("Error getting user by ID:", error);
    throw error;
  }
};

/**
 * Create new user (admin only)
 * @param {Object} userData - User data
 * @param {string} userData.name - User name
 * @param {string} userData.email - User email
 * @param {string} userData.password - User password
 * @param {string} userData.role - User role
 * @param {boolean} userData.isActive - User active status
 * @returns {Promise<Object>} Created user object
 */
const createUser = async (userData) => {
  try {
    const {
      name,
      email,
      password,
      role = USER_ROLES.USER,
      isActive = true,
    } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const error = new Error("User with this email already exists");
      error.code = "USER_EXISTS";
      throw error;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`Created new user: ${user.email} with role: ${user.role}`);

    return user;
  } catch (error) {
    logger.error("Error creating user:", error);
    throw error;
  }
};

/**
 * Update user (admin only)
 * @param {string} userId - User ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} Updated user object
 */
const updateUser = async (userId, updateData) => {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // Check if email is being updated and already exists
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: updateData.email },
      });

      if (emailExists) {
        const error = new Error("Email already exists");
        error.code = "EMAIL_EXISTS";
        throw error;
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info(`Updated user: ${updatedUser.email}`);

    return updatedUser;
  } catch (error) {
    logger.error("Error updating user:", error);
    throw error;
  }
};

/**
 * Change user password (admin only)
 * @param {string} userId - User ID
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Updated user object
 */
const changeUserPassword = async (userId, newPassword) => {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    logger.info(`Changed password for user: ${updatedUser.email}`);

    return updatedUser;
  } catch (error) {
    logger.error("Error changing user password:", error);
    throw error;
  }
};

/**
 * Delete user (admin only)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deleted user object
 */
const deleteUser = async (userId) => {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: true,
      },
    });

    if (!existingUser) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // Check if user has active subscriptions
    const activeSubscriptions = existingUser.subscriptions.filter(
      (sub) => sub.status === "ACTIVE"
    );

    if (activeSubscriptions.length > 0) {
      const error = new Error("Cannot delete user with active subscriptions");
      error.code = "USER_HAS_ACTIVE_SUBSCRIPTIONS";
      throw error;
    }

    // Delete user (this will cascade delete subscriptions due to foreign key)
    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    logger.info(`Deleted user: ${deletedUser.email}`);

    return deletedUser;
  } catch (error) {
    logger.error("Error deleting user:", error);
    throw error;
  }
};

/**
 * Toggle user active status (admin only)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated user object
 */
const toggleUserStatus = async (userId) => {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // Toggle active status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !existingUser.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    logger.info(
      `Toggled user status: ${updatedUser.email} - Active: ${updatedUser.isActive}`
    );

    return updatedUser;
  } catch (error) {
    logger.error("Error toggling user status:", error);
    throw error;
  }
};

/**
 * Get user statistics (admin only)
 * @returns {Promise<Object>} User statistics
 */
const getUserStats = async () => {
  try {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminUsers,
      regularUsers,
      usersWithSubscriptions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { role: USER_ROLES.ADMINISTRATOR } }),
      prisma.user.count({ where: { role: USER_ROLES.USER } }),
      prisma.user.count({
        where: {
          subscriptions: {
            some: {},
          },
        },
      }),
    ]);

    const stats = {
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminUsers,
      regularUsers,
      usersWithSubscriptions,
      usersWithoutSubscriptions: totalUsers - usersWithSubscriptions,
    };

    logger.info("Retrieved user statistics");

    return stats;
  } catch (error) {
    logger.error("Error getting user statistics:", error);
    throw error;
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
