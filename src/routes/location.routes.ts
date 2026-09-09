import { Router } from 'express';
import {
  getLocationById,
  updateLocationById,
  createLocation,
  listLocations,
  verifySeparationEndpoint,
} from '../controllers/location.controller.js';
import { authenticateJwt } from '../middleware/auth.js';

export const locationRouter = Router();

// Protect all location routes with JWT authentication
locationRouter.use(authenticateJwt);

// List locations (filtered by role and optional city query)
locationRouter.get('/', listLocations);

// Create a new location record
locationRouter.post('/', createLocation);

// Explicit verification of separation between registered home & disaster expected locations
locationRouter.get('/verify-separation/:householdId', verifySeparationEndpoint);

// Get single location by ID (ownership checked if private residence)
locationRouter.get('/:id', getLocationById);

// Update location by ID (ownership checked if private residence)
locationRouter.put('/:id', updateLocationById);
locationRouter.patch('/:id', updateLocationById);
