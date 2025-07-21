import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { success } from '../utils/response.util.js';

const router = express.Router();

/**
 * @route   GET /api/v1/pods
 * @desc    Get user pods
 * @access  Private
 */
router.get('/', authenticate, (req, res) => {
  res.json(
    success(
      [],
      'Pods endpoint - Coming soon in Phase 1'
    )
  );
});

/**
 * @route   GET /api/v1/pods/:id
 * @desc    Get pod details
 * @access  Private
 */
router.get('/:id', authenticate, (req, res) => {
  res.json(
    success(
      null,
      'Pod details endpoint - Coming soon in Phase 1'
    )
  );
});

/**
 * @route   POST /api/v1/pods/:id/restart
 * @desc    Restart pod
 * @access  Private
 */
router.post('/:id/restart', authenticate, (req, res) => {
  res.json(
    success(
      null,
      'Pod restart endpoint - Coming soon in Phase 1'
    )
  );
});

export default router;