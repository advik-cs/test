import { Router } from 'express';
import {
  createHousehold,
  listHouseholds,
  getMyHousehold,
  getHouseholdById,
  updateHousehold,
  deleteHousehold,
  addHouseholdMember,
  listHouseholdMembers,
  getHouseholdMember,
  updateHouseholdMember,
  deleteHouseholdMember,
} from '../controllers/household.controller.js';
import {
  getHouseholdHomeLocation,
  getMyHouseholdHomeLocation,
  updateHouseholdHomeLocation,
  updateMyHouseholdHomeLocation,
} from '../controllers/location.controller.js';
import { authenticateJwt } from '../middleware/auth.js';
import { verifyStage3 } from '../../scripts/verify-stage3.js';

export const householdRouter = Router();

// ============================================================================
// STAGE 3 VERIFICATION RUNNER ENDPOINT
// ============================================================================
householdRouter.get('/verify-stage3', async (req, res) => {
  try {
    const summary = await verifyStage3();
    res.status(200).json({
      success: summary.allPassed,
      stage: 'Stage 3',
      summary: summary.allPassed
        ? 'All Stage 3 Household & Member CRUD and Ownership checks passed'
        : 'Some Stage 3 checks failed',
      checks: summary.results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STAGE3_VERIFICATION_ERROR',
        message: error?.message || 'Failed to execute Stage 3 verification',
      },
    });
  }
});

// ============================================================================
// HOUSEHOLD APIS (CITIZEN OWNERSHIP PROTECTED)
// ============================================================================

// Register a new household
householdRouter.post('/', authenticateJwt, createHousehold);

// List households (Citizens see their own; Rescuers see all)
householdRouter.get('/', authenticateJwt, listHouseholds);

// Get primary household of authenticated citizen
householdRouter.get('/my', authenticateJwt, getMyHousehold);

// Registered home location of authenticated citizen's primary household
householdRouter.get('/my/location', authenticateJwt, getMyHouseholdHomeLocation);
householdRouter.put('/my/location', authenticateJwt, updateMyHouseholdHomeLocation);
householdRouter.patch('/my/location', authenticateJwt, updateMyHouseholdHomeLocation);

// Get specific household by ID
householdRouter.get('/:id', authenticateJwt, getHouseholdById);

// Registered home location management for specific household
householdRouter.get('/:id/location', authenticateJwt, getHouseholdHomeLocation);
householdRouter.put('/:id/location', authenticateJwt, updateHouseholdHomeLocation);
householdRouter.patch('/:id/location', authenticateJwt, updateHouseholdHomeLocation);

// Update household (Citizen owner only)
householdRouter.put('/:id', authenticateJwt, updateHousehold);
householdRouter.patch('/:id', authenticateJwt, updateHousehold);

// Delete household (Citizen owner only)
householdRouter.delete('/:id', authenticateJwt, deleteHousehold);

// ============================================================================
// HOUSEHOLD MEMBER CRUD APIS (AUTOMATIC DEMOGRAPHICS & OWNERSHIP PROTECTED)
// ============================================================================

// Add a family member to household
householdRouter.post('/:householdId/members', authenticateJwt, addHouseholdMember);

// List all members of a household
householdRouter.get('/:householdId/members', authenticateJwt, listHouseholdMembers);

// Get specific member
householdRouter.get('/:householdId/members/:memberId', authenticateJwt, getHouseholdMember);

// Update member (Citizen owner only; auto-recalculates categories & demographics)
householdRouter.put('/:householdId/members/:memberId', authenticateJwt, updateHouseholdMember);
householdRouter.patch('/:householdId/members/:memberId', authenticateJwt, updateHouseholdMember);

// Delete member (Citizen owner only; auto-recalculates remaining demographics)
householdRouter.delete('/:householdId/members/:memberId', authenticateJwt, deleteHouseholdMember);
