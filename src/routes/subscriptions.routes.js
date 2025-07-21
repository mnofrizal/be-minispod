import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { success } from '../utils/response.util.js';

const router = express.Router();

/**
 * @route   GET /api/v1/subscriptions
 * @desc    Get user subscriptions
 * @access  Private
 */
router.get('/', authenticate, (req, res) => {
  res.json(
    success(
      [],
      'Subscriptions endpoint - Coming soon in Phase 1'
    )
  );
});

/**
 * @route   POST /api/v1/subscriptions
 * @desc    Create new subscription
 * @access  Private
 */
router.post('/', authenticate, (req, res) => {
  res.json(
    success(
      null,
      'Create subscription endpoint - Coming soon in Phase 1'
    )
  );
});

/**
 * @route   GET /api/v1/subscriptions/:id
 * @desc    Get subscription details
 * @access  Private
 */
router.get('/:id', authenticate, (req, res) => {
  res.json(
    success(
      null,
      'Subscription details endpoint - Coming soon in Phase 1'
    )
  );
});

export default router;