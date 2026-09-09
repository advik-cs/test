import { Router, Request, Response } from 'express';
import { checkDatabaseConnection, getPrismaClient } from '../config/db';
import { config } from '../config/env';
import { HealthCheckResponse } from '../types/index';
import { seedDemoData } from '../../prisma/seed';
import { verifyStage1 } from '../../scripts/verify-stage1';
import { verifyStage3 } from '../../scripts/verify-stage3';
import { verifyStage4 } from '../../scripts/verify-stage4';

export const healthRouter = Router();

const serverStartTime = Date.now();

healthRouter.get('/health', async (req: Request, res: Response) => {
  const dbCheck = await checkDatabaseConnection();
  const prisma = getPrismaClient();

  let dbStats: any = undefined;

  if (dbCheck.connected) {
    try {
      const [
        users,
        citizens,
        rescuers,
        households,
        householdMembers,
        locations,
        disasters,
        affectedZones,
        shelters,
        expectedLocations,
        facilities,
        roads,
        notifications,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: 'CITIZEN' } }),
        prisma.user.count({ where: { role: 'RESCUER' } }),
        prisma.household.count(),
        prisma.householdMember.count(),
        prisma.location.count(),
        prisma.disasterEvent.count(),
        prisma.affectedZone.count(),
        prisma.shelter.count(),
        prisma.expectedLocation.count(),
        prisma.emergencyFacility.count(),
        prisma.road.count(),
        prisma.notification.count(),
      ]);

      dbStats = {
        users,
        citizens,
        rescuers,
        households,
        householdMembers,
        locations,
        disasters,
        affectedZones,
        shelters,
        expectedLocations,
        facilities,
        roads,
        notifications,
      };
    } catch {
      // Ignore count errors if tables aren't queried
    }
  }

  const responsePayload: HealthCheckResponse = {
    status: dbCheck.connected ? 'healthy' : 'degraded',
    service: 'disaster-management-backend',
    version: '1.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    stage: 'Stage 4 - Registered Home/Building Location Management, GPS Coordinates & Disaster Expected Location Separation',
    database: {
      configured: Boolean(config.databaseUrl),
      provider: 'postgresql',
      status: dbCheck.connected ? 'connected' : 'disconnected',
      details: dbCheck.connected
        ? 'PostgreSQL connection verified via Prisma'
        : dbCheck.error || 'PostgreSQL not reachable or local connection pending',
      stats: dbStats,
    },
  };

  res.status(200).json(responsePayload);
});

// Guard against concurrent seed operations
let isSeeding = false;

// Endpoint to trigger or re-run database seed
healthRouter.post('/seed', async (req: Request, res: Response) => {
  if (isSeeding) {
    res.status(409).json({
      success: false,
      error: {
        code: 'SEED_IN_PROGRESS',
        message: 'Database seeding is already in progress, please wait.',
      },
    });
    return;
  }

  isSeeding = true;
  try {
    const prisma = getPrismaClient();
    await seedDemoData(prisma);
    res.status(200).json({
      success: true,
      message: 'Stage 1 demo data successfully seeded into PostgreSQL database',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SEED_ERROR',
        message: error?.message || 'Failed to execute seed',
      },
    });
  } finally {
    isSeeding = false;
  }
});

// Endpoint to verify Stage 1 database compliance
healthRouter.get('/seed/verify', async (req: Request, res: Response) => {
  if (isSeeding) {
    res.status(200).json({
      success: false,
      stage: 'Stage 1',
      summary: 'Database seeding is currently running, please re-check in a moment.',
      checks: [
        {
          step: 'Seed In Progress',
          passed: false,
          details: 'Data seeding operation currently active. Re-checking shortly.',
        },
      ],
    });
    return;
  }

  try {
    const prisma = getPrismaClient();
    const result = await verifyStage1(prisma);
    res.status(200).json({
      success: result.allPassed,
      stage: 'Stage 1',
      summary: result.allPassed ? 'All Stage 1 database checks passed' : 'Some checks failed',
      checks: result.results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error?.message || 'Failed to verify Stage 1',
      },
    });
  }
});

// Endpoint to verify Stage 3 Household, Member CRUD & Demographics compliance
healthRouter.get('/verify-stage3', async (req: Request, res: Response) => {
  try {
    const result = await verifyStage3();
    res.status(200).json({
      success: result.allPassed,
      stage: 'Stage 3',
      summary: result.allPassed
        ? 'All Stage 3 Household & Member CRUD and Ownership checks passed'
        : 'Some Stage 3 checks failed',
      checks: result.results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STAGE3_VERIFICATION_ERROR',
        message: error?.message || 'Failed to verify Stage 3',
      },
    });
  }
});

// Endpoint to verify Stage 4 Registered Home Location & GPS Coordinates compliance
healthRouter.get('/verify-stage4', async (req: Request, res: Response) => {
  try {
    const result = await verifyStage4();
    res.status(200).json({
      success: result.allPassed,
      stage: 'Stage 4',
      summary: result.allPassed
        ? 'All Stage 4 Registered Home Location, GPS bounds, Ownership, and Separation checks passed'
        : 'Some Stage 4 checks failed',
      checks: result.results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STAGE4_VERIFICATION_ERROR',
        message: error?.message || 'Failed to verify Stage 4',
      },
    });
  }
});


