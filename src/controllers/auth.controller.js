import * as authService from "../services/auth.service.js";
import {
  success,
  conflictError,
  authError,
  notFoundError,
  error,
} from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    res
      .status(HTTP_STATUS.CREATED)
      .json(
        success(result, "User registered successfully", HTTP_STATUS.CREATED)
      );
  } catch (err) {
    if (err.message === "User with this email already exists") {
      return res.status(HTTP_STATUS.CONFLICT).json(conflictError(err.message));
    }
    next(err);
  }
};

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);

    res.json(success(result, "Login successful"));
  } catch (err) {
    if (
      err.message === "Invalid email or password" ||
      err.message === "Account is deactivated"
    ) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(authError(err.message));
    }
    next(err);
  }
};

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);

    res.json(success(result, "Token refreshed successfully"));
  } catch (err) {
    if (
      err.message === "Invalid refresh token" ||
      err.name === "JsonWebTokenError" ||
      err.name === "TokenExpiredError"
    ) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(authError("Invalid or expired refresh token"));
    }
    next(err);
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/profile
 */
export const getProfile = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.userId);

    res.json(success(profile, "Profile retrieved successfully"));
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(HTTP_STATUS.NOT_FOUND).json(notFoundError("User"));
    }
    next(err);
  }
};

/**
 * Update user profile
 * PUT /api/v1/auth/profile
 */
export const updateProfile = async (req, res, next) => {
  try {
    const updatedProfile = await authService.updateProfile(
      req.userId,
      req.body
    );

    res.json(success(updatedProfile, "Profile updated successfully"));
  } catch (err) {
    if (err.message === "Email is already taken") {
      return res.status(HTTP_STATUS.CONFLICT).json(conflictError(err.message));
    }
    if (err.message === "User not found") {
      return res.status(HTTP_STATUS.NOT_FOUND).json(notFoundError("User"));
    }
    next(err);
  }
};

/**
 * Change password
 * POST /api/v1/auth/change-password
 */
export const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.userId, req.body);

    res.json(success(null, "Password changed successfully"));
  } catch (err) {
    if (err.message === "Current password is incorrect") {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(error(err.message, "INVALID_PASSWORD", HTTP_STATUS.BAD_REQUEST));
    }
    if (err.message === "User not found") {
      return res.status(HTTP_STATUS.NOT_FOUND).json(notFoundError("User"));
    }
    next(err);
  }
};

/**
 * Logout user (client-side token removal)
 * POST /api/v1/auth/logout
 */
export const logout = async (req, res) => {
  // Since we're using stateless JWT tokens, logout is handled client-side
  // by removing the tokens from storage. This endpoint exists for consistency
  // and can be extended later for token blacklisting if needed.

  logger.info(`User logged out: ${req.user.email}`);

  res.json(success(null, "Logout successful"));
};

/**
 * Deactivate account
 * DELETE /api/v1/auth/account
 */
export const deactivateAccount = async (req, res, next) => {
  try {
    await authService.deactivateAccount(req.userId);

    res.json(success(null, "Account deactivated successfully"));
  } catch (err) {
    next(err);
  }
};

/**
 * Check authentication status
 * GET /api/v1/auth/me
 */
export const checkAuth = async (req, res) => {
  // This endpoint is protected by auth middleware
  // If we reach here, the user is authenticated
  res.json(
    success(
      {
        user: req.user,
        authenticated: true,
      },
      "User is authenticated"
    )
  );
};

/**
 * Google OAuth authentication
 * POST /api/v1/auth/google
 */
export const googleOAuth = async (req, res, next) => {
  try {
    const result = await authService.googleOAuth(req.body);

    const message = result.isNewUser
      ? "Account created and logged in successfully"
      : "Login successful";

    res.json(success(result, message));
  } catch (err) {
    if (
      err.message === "Invalid Google ID token" ||
      err.message === "Google email not verified" ||
      err.message === "Account is deactivated"
    ) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(authError(err.message));
    }
    next(err);
  }
};
