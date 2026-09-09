import { Router } from 'express';
import {
  signup,
  login,
  getMe,
  getCitizenPortal,
  getRescuerPortal,
  getSharedEmergencyPortal,
} from '../controllers/auth.controller.js';
import { authenticateJwt, requireRole } from '../middleware/auth.js';
import { verifyStage2 } from '../../scripts/verify-stage2.js';
import { getPrismaClient } from '../config/db.js';

export const authRouter = Router();

// Public Authentication Endpoints
authRouter.post('/signup', signup);
authRouter.post('/login', login);

// Authenticated User Profile
authRouter.get('/me', authenticateJwt, getMe);

// Role-Protected Endpoints for RBAC Verification
authRouter.get('/citizen-only', authenticateJwt, requireRole('CITIZEN'), getCitizenPortal);
authRouter.get('/rescuer-only', authenticateJwt, requireRole('RESCUER'), getRescuerPortal);
authRouter.get('/shared-portal', authenticateJwt, requireRole('CITIZEN', 'RESCUER'), getSharedEmergencyPortal);

// Stage 2 Automated Verification Runner Endpoint
authRouter.get('/verify-stage2', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const result = await verifyStage2(prisma);
    res.status(200).json({
      success: result.allPassed,
      stage: 'Stage 2 - Authentication & RBAC Authorization',
      summary: result.allPassed
        ? 'All Stage 2 authentication, JWT, and RBAC tests passed successfully.'
        : 'Some Stage 2 tests failed.',
      checks: result.results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      stage: 'Stage 2',
      error: {
        code: 'VERIFY_STAGE2_ERROR',
        message: error?.message || 'Failed to execute Stage 2 verification test suite.',
      },
    });
  }
});
