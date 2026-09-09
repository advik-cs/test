import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { householdRouter } from './household.routes.js';
import { locationRouter } from './location.routes.js';

export const apiRouter = Router();

// Base Health Check Route: GET /api/health
apiRouter.use('/', healthRouter);

// Stage 2: Authentication & Role-Based Authorization
apiRouter.use('/auth', authRouter);

// Stage 3: Household Registration, Members CRUD, and Demographics
apiRouter.use('/households', householdRouter);

// Convenient alias for citizen's primary household
apiRouter.use('/my-household', householdRouter);

// Stage 4: Registered Home/Building Location Management & GPS Coordinates
apiRouter.use('/locations', locationRouter);

// Future Stages placeholders (will be mounted as implemented):
// apiRouter.use('/disasters', disasterRouter);
// apiRouter.use('/shelters', shelterRouter);
// apiRouter.use('/facilities', facilityRouter);
// apiRouter.use('/map', mapRouter);
// apiRouter.use('/notifications', notificationRouter);
