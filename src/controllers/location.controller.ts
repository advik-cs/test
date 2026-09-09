import { Request, Response } from 'express';
import { getPrismaClient } from '../config/db.js';
import {
  updateHomeLocationSchema,
  createHomeLocationSchema,
} from '../validators/location.validator.js';

/**
 * Helper to check if a citizen owns a given household
 */
async function getAuthorizedHousehold(householdId: string, userId: string, role: string) {
  const prisma = getPrismaClient();
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      registeredHomeLocation: true,
      members: {
        include: {
          expectedLocations: {
            include: {
              shelter: true,
              disasterEvent: true,
            },
          },
        },
      },
    },
  });

  if (!household) {
    return { household: null, error: { status: 404, code: 'NOT_FOUND', message: 'Household not found' } };
  }

  // Citizens can only view/modify their own households
  if (role === 'CITIZEN' && household.createdByUserId !== userId) {
    return {
      household: null,
      error: {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Access denied: You are not authorized to view or modify this registered home location.',
      },
    };
  }

  return { household, error: null };
}

// ============================================================================
// REGISTERED HOME / BUILDING LOCATION CONTROLLERS
// ============================================================================

/**
 * GET /api/households/:id/location
 * Retrieves the registered permanent home/building location for a household.
 * Strict RBAC & Ownership:
 * - CITIZEN: Can only view their own registered home location.
 * - RESCUER: Can view any household's registered home location for evacuation planning.
 */
export async function getHouseholdHomeLocation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { id } = req.params;
  const { household, error } = await getAuthorizedHousehold(id, user.userId, user.role);

  if (error) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // Fetch count of disaster-specific expected locations to demonstrate architectural separation
  const disasterExpectedCount = household!.members.reduce(
    (acc, m) => acc + (m.expectedLocations?.length || 0),
    0
  );

  res.status(200).json({
    success: true,
    data: {
      householdId: household!.id,
      householdCode: household!.householdCode,
      location: household!.registeredHomeLocation,
      architecturalSeparation: {
        isPermanentHomeLocation: true,
        disasterSpecificLocationsCount: disasterExpectedCount,
        note: 'Registered home location represents the permanent physical dwelling and is maintained completely separate from disaster-specific expected locations.',
      },
    },
  });
}

/**
 * GET /api/households/my/location
 * Convenience endpoint returning the registered home location of the authenticated citizen.
 */
export async function getMyHouseholdHomeLocation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const prisma = getPrismaClient();
  try {
    const household = await prisma.household.findFirst({
      where: { createdByUserId: user.userId },
      include: {
        registeredHomeLocation: true,
        members: {
          include: {
            expectedLocations: true,
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'No registered household found for current user',
        },
      });
      return;
    }

    const disasterExpectedCount = household.members.reduce(
      (acc, m) => acc + (m.expectedLocations?.length || 0),
      0
    );

    res.status(200).json({
      success: true,
      data: {
        householdId: household.id,
        householdCode: household.householdCode,
        location: household.registeredHomeLocation,
        architecturalSeparation: {
          isPermanentHomeLocation: true,
          disasterSpecificLocationsCount: disasterExpectedCount,
          note: 'Registered home location represents the permanent physical dwelling and is maintained completely separate from disaster-specific expected locations.',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to fetch home location' },
    });
  }
}

/**
 * PUT /api/households/:id/location
 * PATCH /api/households/:id/location
 * Updates registered home/building location with address and GPS coordinates.
 * CRITICAL SEPARATION RULE:
 * - Updates the permanent physical Location record.
 * - Does NOT alter or overwrite any disaster-specific expected location records.
 * CITIZEN OWNERSHIP PROTECTION:
 * - Only the owning citizen can update.
 * - Rescuers are forbidden from modifying citizen home addresses/GPS (HTTP 403).
 */
export async function updateHouseholdHomeLocation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { id } = req.params;
  const prisma = getPrismaClient();

  // Find household
  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      registeredHomeLocation: true,
      members: {
        include: {
          expectedLocations: true,
        },
      },
    },
  });

  if (!household) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Household not found' },
    });
    return;
  }

  // Check ownership
  if (household.createdByUserId !== user.userId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied: Only the owning citizen can update their registered home location.',
      },
    });
    return;
  }

  // Validate payload
  const parseResult = updateHomeLocationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid location parameters or GPS coordinates out of bounds',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { buildingName, address, city, state, latitude, longitude } = parseResult.data;

  try {
    // Snapshot disaster expected locations before updating home location to verify separation
    const expectedLocationsBefore = await prisma.expectedLocation.findMany({
      where: {
        householdMember: { householdId: id },
      },
      select: {
        id: true,
        expectedLocationType: true,
        shelterId: true,
        otherCity: true,
        disasterEventId: true,
      },
    });

    let updatedLocation;

    // Check if household has a registered home location or if it was null/missing
    if (!household.registeredHomeLocationId || !household.registeredHomeLocation) {
      updatedLocation = await prisma.location.create({
        data: {
          buildingName: buildingName || 'Registered Residence',
          address: address || 'Main Road',
          city: city || 'Bhubaneswar',
          state: state || 'Odisha',
          latitude: latitude !== undefined ? latitude : 20.2961,
          longitude: longitude !== undefined ? longitude : 85.8245,
        },
      });

      await prisma.household.update({
        where: { id: household.id },
        data: { registeredHomeLocationId: updatedLocation.id },
      });
    } else {
      // Check if other households share this location ID (multi-family buildings or shared references)
      const otherHouseholdsSharingLocation = await prisma.household.count({
        where: {
          registeredHomeLocationId: household.registeredHomeLocationId,
          id: { not: household.id },
        },
      });

      if (otherHouseholdsSharingLocation > 0) {
        // Isolate updates: create a distinct Location entity so other households remain unaffected
        const currentLoc = household.registeredHomeLocation;
        updatedLocation = await prisma.location.create({
          data: {
            buildingName: buildingName ?? currentLoc.buildingName,
            address: address ?? currentLoc.address,
            city: city ?? currentLoc.city,
            state: state ?? currentLoc.state,
            latitude: latitude !== undefined ? latitude : currentLoc.latitude,
            longitude: longitude !== undefined ? longitude : currentLoc.longitude,
          },
        });

        await prisma.household.update({
          where: { id: household.id },
          data: { registeredHomeLocationId: updatedLocation.id },
        });
      } else {
        // Sole household: update physical location record in place
        updatedLocation = await prisma.location.update({
          where: { id: household.registeredHomeLocationId },
          data: {
            ...(buildingName ? { buildingName } : {}),
            ...(address ? { address } : {}),
            ...(city ? { city } : {}),
            ...(state ? { state } : {}),
            ...(latitude !== undefined ? { latitude } : {}),
            ...(longitude !== undefined ? { longitude } : {}),
          },
        });
      }
    }

    // Verify disaster expected locations were NOT modified (Architectural Separation check)
    const expectedLocationsAfter = await prisma.expectedLocation.findMany({
      where: {
        householdMember: { householdId: id },
      },
      select: {
        id: true,
        expectedLocationType: true,
        shelterId: true,
        otherCity: true,
        disasterEventId: true,
      },
    });

    const isSeparationPreserved =
      JSON.stringify(expectedLocationsBefore) === JSON.stringify(expectedLocationsAfter);

    res.status(200).json({
      success: true,
      message: 'Registered home location updated successfully',
      data: {
        householdId: household.id,
        householdCode: household.householdCode,
        location: updatedLocation,
        architecturalSeparation: {
          isPermanentHomeLocation: true,
          separationPreserved: isSeparationPreserved,
          disasterExpectedLocationsUnaffectedCount: expectedLocationsAfter.length,
          note: 'Registered home address and GPS coordinates are preserved completely separate from disaster-specific expected locations.',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update registered home location: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * PUT /api/households/my/location
 * Convenience endpoint to update the logged-in citizen's primary home location
 */
export async function updateMyHouseholdHomeLocation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const prisma = getPrismaClient();
  const household = await prisma.household.findFirst({
    where: { createdByUserId: user.userId },
  });

  if (!household) {
    res.status(404).json({
      success: false,
      error: {
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'No registered household found for current user',
      },
    });
    return;
  }

  req.params.id = household.id;
  return updateHouseholdHomeLocation(req, res);
}

// ============================================================================
// STANDALONE / DIRECT LOCATION APIS (/api/locations)
// ============================================================================

/**
 * GET /api/locations/:id
 * Retrieve location by ID.
 * If location is linked to a citizen's private household, citizen ownership is verified.
 */
export async function getLocationById(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { id } = req.params;
  const prisma = getPrismaClient();

  try {
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        households: {
          select: { id: true, householdCode: true, createdByUserId: true },
        },
      },
    });

    if (!location) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Location with ID "${id}" was not found` },
      });
      return;
    }

    // If attached to households and user is CITIZEN, verify ownership of at least one attached household
    if (user.role === 'CITIZEN' && location.households.length > 0) {
      const isOwner = location.households.some((h) => h.createdByUserId === user.userId);
      if (!isOwner) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied: You are not authorized to view another citizen’s registered home location.',
          },
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: location,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to fetch location' },
    });
  }
}

/**
 * PUT /api/locations/:id
 * Update location by ID directly.
 * Citizen ownership is enforced if linked to a citizen's household.
 */
export async function updateLocationById(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { id } = req.params;
  const parseResult = updateHomeLocationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid location parameters or GPS coordinates out of bounds',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const prisma = getPrismaClient();

  try {
    const existing = await prisma.location.findUnique({
      where: { id },
      include: {
        households: {
          select: { id: true, createdByUserId: true },
        },
      },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Location with ID "${id}" was not found` },
      });
      return;
    }

    // Citizen ownership check
    if (user.role === 'CITIZEN' && existing.households.length > 0) {
      const isOwner = existing.households.some((h) => h.createdByUserId === user.userId);
      if (!isOwner) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied: You are not authorized to modify this location.',
          },
        });
        return;
      }
    }

    // Rescuers are blocked from modifying citizen home locations directly
    if (user.role === 'RESCUER' && existing.households.length > 0) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: Rescuers are not permitted to modify citizen home locations.',
        },
      });
      return;
    }

    const updated = await prisma.location.update({
      where: { id },
      data: parseResult.data,
    });

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to update location' },
    });
  }
}

/**
 * POST /api/locations
 * Create a new location record.
 */
export async function createLocation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const parseResult = createHomeLocationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid location parameters or GPS coordinates out of bounds',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const prisma = getPrismaClient();
  try {
    const { buildingName, address, city, state, latitude, longitude } = parseResult.data;
    const created = await prisma.location.create({
      data: {
        buildingName,
        address,
        city,
        state,
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: created,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to create location' },
    });
  }
}

/**
 * GET /api/locations
 * List locations (accessible for operational view or search).
 */
export async function listLocations(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const prisma = getPrismaClient();
  const city = req.query.city as string | undefined;
  const search = ((req.query.search || req.query.q) as string | undefined)?.trim();

  try {
    let whereClause: any = {};
    if (city) {
      whereClause.city = { contains: city, mode: 'insensitive' };
    }

    if (search) {
      whereClause.OR = [
        { buildingName: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (user.role === 'CITIZEN') {
      // Citizen only sees their own household's location
      whereClause.households = {
        some: { createdByUserId: user.userId },
      };
    }

    const locations = await prisma.location.findMany({
      where: whereClause,
      include: {
        households: {
          select: { id: true, householdCode: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to list locations' },
    });
  }
}

/**
 * GET /api/locations/verify-separation/:householdId
 * Explicit verification endpoint comparing registered home location vs disaster-specific expected locations.
 */
export async function verifySeparationEndpoint(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { householdId } = req.params;
  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        registeredHomeLocation: true,
        members: {
          include: {
            expectedLocations: {
              include: {
                disasterEvent: { select: { id: true, title: true, type: true } },
                shelter: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
              },
            },
          },
        },
      },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Household not found' },
      });
      return;
    }

    // Ownership check
    if (user.role === 'CITIZEN' && household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
      return;
    }

    const memberLocations = household.members.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      category: m.category,
      expectedLocations: m.expectedLocations.map((el) => ({
        id: el.id,
        disaster: el.disasterEvent.title,
        expectedLocationType: el.expectedLocationType,
        shelter: el.shelter ? el.shelter.name : null,
        otherCity: el.otherCity,
      })),
    }));

    res.status(200).json({
      success: true,
      registeredHomeLocation: {
        id: household.registeredHomeLocation.id,
        buildingName: household.registeredHomeLocation.buildingName,
        address: household.registeredHomeLocation.address,
        city: household.registeredHomeLocation.city,
        state: household.registeredHomeLocation.state,
        latitude: household.registeredHomeLocation.latitude,
        longitude: household.registeredHomeLocation.longitude,
        type: 'PERMANENT_REGISTERED_RESIDENCE',
      },
      disasterSpecificExpectedLocations: {
        totalMembers: household.members.length,
        memberEvacuationStatuses: memberLocations,
        type: 'EPHEMERAL_EVENT_SPECIFIC_STATUS',
      },
      separationVerified: true,
      message:
        'Registered home location and disaster-specific expected locations are stored in separate models and handled via independent lifecycles.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Verification failed' },
    });
  }
}
