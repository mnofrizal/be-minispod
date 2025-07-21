import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/crypto.util.js";
import logger from "../utils/logger.util.js";
import { prisma } from "../config/database.js";
import { USER_ROLES } from "../utils/user-roles.util.js";

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user and tokens
 */
export const register = async (userData) => {
  const { name, email, password } = userData;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: USER_ROLES.USER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    logger.info(`New user registered: ${email}`);

    return {
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "24h",
      },
    };
  } catch (error) {
    logger.error("Registration error:", error);
    throw error;
  }
};

/**
 * Login user
 * @param {Object} credentials - Login credentials
 * @returns {Promise<Object>} User and tokens
 */
export const login = async (credentials) => {
  const { email, password } = credentials;

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("Account is deactivated");
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    logger.info(`User logged in: ${email}`);

    return {
      user: userWithoutPassword,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "24h",
      },
    };
  } catch (error) {
    logger.error("Login error:", error);
    throw error;
  }
};

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New tokens
 */
export const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new Error("Invalid refresh token");
    }

    // Generate new tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken({ userId: user.id });

    logger.info(`Token refreshed for user: ${user.email}`);

    return {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || "24h",
      },
    };
  } catch (error) {
    logger.error("Token refresh error:", error);
    throw error;
  }
};

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {Object} passwordData - Password change data
 * @returns {Promise<void>}
 */
export const changePassword = async (userId, passwordData) => {
  const { currentPassword, newPassword } = passwordData;

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    logger.info(`Password changed for user: ${user.email}`);
  } catch (error) {
    logger.error("Password change error:", error);
    throw error;
  }
};

/**
 * Get user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile
 */
export const getProfile = async (userId) => {
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
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch (error) {
    logger.error("Get profile error:", error);
    throw error;
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updateData - Profile update data
 * @returns {Promise<Object>} Updated user profile
 */
export const updateProfile = async (userId, updateData) => {
  try {
    // Check if email is being updated and if it's already taken
    if (updateData.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: updateData.email,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new Error("Email is already taken");
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

    logger.info(`Profile updated for user: ${updatedUser.email}`);

    return updatedUser;
  } catch (error) {
    logger.error("Profile update error:", error);
    throw error;
  }
};

/**
 * Deactivate user account
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const deactivateAccount = async (userId) => {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { email: true },
    });

    logger.info(`Account deactivated for user: ${user.email}`);
  } catch (error) {
    logger.error("Account deactivation error:", error);
    throw error;
  }
};
