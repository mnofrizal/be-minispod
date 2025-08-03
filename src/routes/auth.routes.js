import express from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validate,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  refreshTokenSchema,
  googleOAuthSchema,
} from "../validations/auth.validation.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post("/register", validate(registerSchema), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post("/login", validate(loginSchema), (req, res, next) => {
  console.log("Login payload:", req.body);
  authController.login(req, res, next);
});

/**
 * @route   POST /api/v1/auth/google
 * @desc    Google OAuth authentication
 * @access  Public
 */
router.post("/google", validate(googleOAuthSchema), authController.googleOAuth);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refreshToken
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Check authentication status
 * @access  Private
 */
router.get("/me", authenticate, authController.checkAuth);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/profile", authenticate, authController.getProfile);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  authController.updateProfile
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post("/logout", authenticate, authController.logout);

/**
 * @route   DELETE /api/v1/auth/account
 * @desc    Deactivate user account
 * @access  Private
 */
router.delete("/account", authenticate, authController.deactivateAccount);

export default router;
