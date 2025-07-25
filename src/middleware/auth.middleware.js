import { verifyAccessToken } from "../utils/crypto.util.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import { prisma } from "../config/database.js";
import { USER_ROLES } from "../utils/user-roles.util.js";

/**
 * JWT Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json(
          responseUtil.authError(
            "Authentication required. Please provide a valid access token."
          )
        );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyAccessToken(token);

    // Get user from database (without isActive filter first)
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res
        .status(401)
        .json(
          responseUtil.authError("Authentication failed. Please login again.")
        );
    }

    // Check if user account is active
    if (!user.isActive) {
      return res
        .status(401)
        .json(
          responseUtil.authError(
            "Account is inactive. Please contact administrator."
          )
        );
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    logger.error("Authentication error:", error);

    if (error.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json(
          responseUtil.authError(
            "Invalid authentication token. Please login again."
          )
        );
    }

    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(
          responseUtil.authError(
            "Authentication token has expired. Please login again."
          )
        );
    }

    return res.status(500).json(responseUtil.error("Authentication failed"));
  }
};

/**
 * Authorization middleware - check user roles
 * @param {Array} allowedRoles - Array of allowed roles
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json(
          responseUtil.authError(
            "Authentication required. Please login to access this resource."
          )
        );
    }

    if (allowedRoles.length === 0) {
      return next(); // No role restriction
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json(responseUtil.forbiddenError("Insufficient permissions"));
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // No token provided, continue without user
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Only attach user if they exist and are active
    if (user && user.isActive) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Invalid token, but continue without user
    next();
  }
};

/**
 * Administrator only middleware
 */
const adminOnly = [authenticate, authorize([USER_ROLES.ADMINISTRATOR])];

/**
 * Administrator only middleware (alias for consistency)
 */
const superAdminOnly = [authenticate, authorize([USER_ROLES.ADMINISTRATOR])];

/**
 * User or administrator middleware
 */
const userOrAdmin = [
  authenticate,
  authorize([USER_ROLES.USER, USER_ROLES.ADMINISTRATOR]),
];

export {
  authenticate,
  authorize,
  optionalAuth,
  adminOnly,
  superAdminOnly,
  userOrAdmin,
};
