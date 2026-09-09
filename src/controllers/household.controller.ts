import { Request, Response } from 'express';
import { getPrismaClient } from '../config/db.js';
import {
  createHouseholdSchema,
  updateHouseholdSchema,
  createMemberSchema,
  updateMemberSchema,
} from '../validators/household.validator.js';
import {
  determineMemberCategory,
  calculateHouseholdDemographics,
  formatHouseholdWithDemographics,
} from '../utils/demographics.js';

/**
 * Generates a unique household code if not supplied
 */
function generateHouseholdCode(): string {
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  return `HH-OD-${yearSuffix}${randomDigits}`;
}

// ============================================================================
// HOUSEHOLD REGISTRATION & MANAGEMENT
// ============================================================================

/**
 * POST /api/households
 * Registers a new household with home location and optional family members.
 * Automatically computes adult/child/elderly demographics.
 */
export async function createHousehold(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const parseResult = createHouseholdSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid household registration data',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { householdCode: providedCode, registeredHomeLocationId, location, members } = parseResult.data;
  const prisma = getPrismaClient();

  try {
    let locationId = registeredHomeLocationId;

    // Create location if inline location object is provided
    if (location) {
      const createdLoc = await prisma.location.create({
        data: {
          buildingName: location.buildingName,
          address: location.address,
          city: location.city,
          state: location.state || 'Odisha',
          latitude: location.latitude,
          longitude: location.longitude,
        },
      });
      locationId = createdLoc.id;
    }

    if (!locationId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Valid home location is required' },
      });
      return;
    }

    // Determine household code and check uniqueness
    let finalCode = providedCode || generateHouseholdCode();
    const existingHousehold = await prisma.household.findUnique({
      where: { householdCode: finalCode },
    });

    if (existingHousehold) {
      if (providedCode) {
        res.status(409).json({
          success: false,
          error: {
            code: 'HOUSEHOLD_EXISTS',
            message: `Household with code "${providedCode}" already exists`,
          },
        });
        return;
      }
      // If auto-generated conflicted, generate another
      finalCode = `${finalCode}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // Build initial members with auto-calculated categories
    const initialMembersData = (members || []).map((m) => {
      const category = m.category || determineMemberCategory(m.age);
      return {
        name: m.name,
        age: m.age,
        relationship: m.relationship,
        category,
      };
    });

    // Create Household
    const createdHousehold = await prisma.household.create({
      data: {
        householdCode: finalCode,
        createdByUserId: user.userId,
        registeredHomeLocationId: locationId,
        members: {
          create: initialMembersData,
        },
      },
      include: {
        registeredHomeLocation: true,
        createdByUser: {
          select: { id: true, name: true, mobileNumber: true, role: true },
        },
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const formatted = formatHouseholdWithDemographics(createdHousehold);

    res.status(201).json({
      success: true,
      message: 'Household registered successfully',
      data: formatted,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to register household: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * GET /api/households
 * Lists households.
 * - CITIZEN: Only lists their own registered household(s) (Ownership Protection).
 * - RESCUER: Permitted to list all registered households for emergency rescue operations.
 */
export async function listHouseholds(req: Request, res: Response): Promise<void> {
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
    const whereClause: any = {};
    if (user.role === 'CITIZEN') {
      // Strict Citizen Ownership Protection
      whereClause.createdByUserId = user.userId;
    }

    const households = await prisma.household.findMany({
      where: whereClause,
      include: {
        registeredHomeLocation: true,
        createdByUser: {
          select: { id: true, name: true, mobileNumber: true, role: true },
        },
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedHouseholds = households.map((h) => formatHouseholdWithDemographics(h));

    res.status(200).json({
      success: true,
      count: formattedHouseholds.length,
      data: formattedHouseholds,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve households: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * GET /api/households/my
 * Returns the primary household registered by the authenticated user.
 */
export async function getMyHousehold(req: Request, res: Response): Promise<void> {
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
        createdByUser: {
          select: { id: true, name: true, mobileNumber: true, role: true },
        },
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'No registered household found for current citizen account',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatHouseholdWithDemographics(household),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve my household: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * GET /api/households/:id
 * Retrieves a household by ID.
 * - CITIZEN: Can ONLY view their own household (403 Forbidden if accessing another citizen's household).
 * - RESCUER: Can view any household for disaster response assessment.
 */
export async function getHouseholdById(req: Request, res: Response): Promise<void> {
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
    const household = await prisma.household.findUnique({
      where: { id },
      include: {
        registeredHomeLocation: true,
        createdByUser: {
          select: { id: true, name: true, mobileNumber: true, role: true },
        },
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household with ID "${id}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (user.role === 'CITIZEN' && household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You are not authorized to view another citizen’s household.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatHouseholdWithDemographics(household),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch household: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * PUT /api/households/:id
 * Updates household metadata or home location.
 * CITIZEN OWNERSHIP PROTECTION: Only the owning citizen can update.
 */
export async function updateHousehold(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { id } = req.params;
  const parseResult = updateHouseholdSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid household update parameters',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household with ID "${id}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You can only modify your own household.',
        },
      });
      return;
    }

    const { householdCode, registeredHomeLocationId, location } = parseResult.data;

    // Check code uniqueness if changing
    if (householdCode && householdCode !== household.householdCode) {
      const codeClash = await prisma.household.findUnique({
        where: { householdCode },
      });
      if (codeClash) {
        res.status(409).json({
          success: false,
          error: {
            code: 'HOUSEHOLD_EXISTS',
            message: `Household code "${householdCode}" is already taken`,
          },
        });
        return;
      }
    }

    // Update location if location object was passed
    if (location) {
      const otherHouseholdsWithSameLocation = await prisma.household.count({
        where: {
          registeredHomeLocationId: household.registeredHomeLocationId,
          id: { not: household.id },
        },
      });

      if (otherHouseholdsWithSameLocation > 0) {
        const currentLoc = await prisma.location.findUnique({
          where: { id: household.registeredHomeLocationId },
        });
        const newLoc = await prisma.location.create({
          data: {
            buildingName: location.buildingName ?? currentLoc?.buildingName ?? 'Residence',
            address: location.address ?? currentLoc?.address ?? 'Main Road',
            city: location.city ?? currentLoc?.city ?? 'Bhubaneswar',
            state: location.state ?? currentLoc?.state ?? 'Odisha',
            latitude: location.latitude !== undefined ? location.latitude : (currentLoc?.latitude ?? 20.2961),
            longitude: location.longitude !== undefined ? location.longitude : (currentLoc?.longitude ?? 85.8245),
          },
        });
        await prisma.household.update({
          where: { id },
          data: { registeredHomeLocationId: newLoc.id },
        });
      } else {
        await prisma.location.update({
          where: { id: household.registeredHomeLocationId },
          data: location,
        });
      }
    }

    const updated = await prisma.household.update({
      where: { id },
      data: {
        ...(householdCode ? { householdCode } : {}),
        ...(registeredHomeLocationId ? { registeredHomeLocationId } : {}),
      },
      include: {
        registeredHomeLocation: true,
        createdByUser: {
          select: { id: true, name: true, mobileNumber: true, role: true },
        },
        members: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Household updated successfully',
      data: formatHouseholdWithDemographics(updated),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update household: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * DELETE /api/households/:id
 * Deletes a household and cascades member records.
 * CITIZEN OWNERSHIP PROTECTION: Only the owning citizen can delete.
 */
export async function deleteHousehold(req: Request, res: Response): Promise<void> {
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
    const household = await prisma.household.findUnique({
      where: { id },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household with ID "${id}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You can only delete your own household.',
        },
      });
      return;
    }

    const locationId = household.registeredHomeLocationId;

    await prisma.household.delete({
      where: { id },
    });

    // Cleanup orphaned location row if not referenced by any other household
    if (locationId) {
      const otherHouseholds = await prisma.household.count({
        where: { registeredHomeLocationId: locationId },
      });
      if (otherHouseholds === 0) {
        await prisma.location.delete({
          where: { id: locationId },
        }).catch(() => {});
      }
    }

    res.status(200).json({
      success: true,
      message: 'Household and associated family members deleted successfully',
      deletedHouseholdId: id,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete household: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

// ============================================================================
// HOUSEHOLD MEMBERS CRUD & DEMOGRAPHIC CALCULATIONS
// ============================================================================

/**
 * POST /api/households/:householdId/members
 * Adds a new member to a household.
 * AUTOMATIC DEMOGRAPHIC CALCULATION:
 * - Automatically derives category (CHILD / ADULT / ELDERLY) from age if not explicitly provided.
 * - Recalculates aggregate household population, adultCount, childCount, and elderlyCount.
 * CITIZEN OWNERSHIP PROTECTION:
 * - Only the owning citizen can add members.
 */
export async function addHouseholdMember(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { householdId } = req.params;
  const parseResult = createMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid member data',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: { members: true },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household "${householdId}" does not exist` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You can only add members to your own household.',
        },
      });
      return;
    }

    const { name, age, relationship, category: explicitCategory } = parseResult.data;
    // Automatic category assignment if omitted
    const category = explicitCategory || determineMemberCategory(age);

    const newMember = await prisma.householdMember.create({
      data: {
        householdId,
        name,
        age,
        relationship,
        category,
      },
    });

    // Fetch updated members and recalculate demographics
    const updatedMembers = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    const demographics = calculateHouseholdDemographics(updatedMembers);

    res.status(201).json({
      success: true,
      message: `Member "${name}" successfully registered into household.`,
      data: {
        member: newMember,
        householdId,
        ...demographics,
        demographics,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add member: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * GET /api/households/:householdId/members
 * Lists all members of a specific household with demographic counts.
 * - CITIZEN: Can only list members of their own household.
 * - RESCUER: Allowed to view members for rescue and evacuation planning.
 */
export async function listHouseholdMembers(req: Request, res: Response): Promise<void> {
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
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household "${householdId}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (user.role === 'CITIZEN' && household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You cannot view members of another citizen’s household.',
        },
      });
      return;
    }

    const members = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    const demographics = calculateHouseholdDemographics(members);

    res.status(200).json({
      success: true,
      householdId,
      ...demographics,
      demographics,
      members,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve household members: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * GET /api/households/:householdId/members/:memberId
 * Retrieves a single member's record.
 */
export async function getHouseholdMember(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { householdId, memberId } = req.params;
  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household "${householdId}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (user.role === 'CITIZEN' && household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You cannot view members of another citizen’s household.',
        },
      });
      return;
    }

    const member = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });

    if (!member) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Member "${memberId}" was not found in household` },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve member: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * PUT /api/households/:householdId/members/:memberId
 * Updates a member's profile.
 * AUTOMATIC DEMOGRAPHIC RE-CALCULATION:
 * - When member age is updated, category is automatically adjusted if not explicitly specified.
 * - Aggregate household demographics are recalculated and returned.
 * CITIZEN OWNERSHIP PROTECTION:
 * - Only the owning citizen can update their household members.
 */
export async function updateHouseholdMember(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { householdId, memberId } = req.params;
  const parseResult = updateMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid member update parameters',
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household "${householdId}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You can only update members of your own household.',
        },
      });
      return;
    }

    const existingMember = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });

    if (!existingMember) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Member "${memberId}" not found in this household` },
      });
      return;
    }

    const { name, age, relationship, category: explicitCategory } = parseResult.data;

    // Automatic category recalibration
    let finalCategory = explicitCategory;
    if (!finalCategory && age !== undefined) {
      finalCategory = determineMemberCategory(age);
    }

    const updatedMember = await prisma.householdMember.update({
      where: { id: memberId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(age !== undefined ? { age } : {}),
        ...(relationship !== undefined ? { relationship } : {}),
        ...(finalCategory !== undefined ? { category: finalCategory } : {}),
      },
    });

    // Recompute household demographics
    const updatedMembers = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    const demographics = calculateHouseholdDemographics(updatedMembers);

    res.status(200).json({
      success: true,
      message: 'Member record updated successfully',
      data: {
        member: updatedMember,
        householdId,
        ...demographics,
        demographics,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update member: ' + (error?.message || 'Unknown'),
      },
    });
  }
}

/**
 * DELETE /api/households/:householdId/members/:memberId
 * Deletes a member from a household.
 * AUTOMATIC DEMOGRAPHIC RE-CALCULATION:
 * - Recalculates remaining population, adults, children, and elderly.
 * CITIZEN OWNERSHIP PROTECTION:
 * - Only the owning citizen can delete members from their household.
 */
export async function deleteHouseholdMember(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const { householdId, memberId } = req.params;
  const prisma = getPrismaClient();

  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
    });

    if (!household) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Household "${householdId}" was not found` },
      });
      return;
    }

    // Citizen Ownership Protection
    if (household.createdByUserId !== user.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: You can only delete members from your own household.',
        },
      });
      return;
    }

    const existingMember = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });

    if (!existingMember) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Member "${memberId}" not found in this household` },
      });
      return;
    }

    await prisma.householdMember.delete({
      where: { id: memberId },
    });

    // Recompute household demographics
    const remainingMembers = await prisma.householdMember.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    });

    const demographics = calculateHouseholdDemographics(remainingMembers);

    res.status(200).json({
      success: true,
      message: `Member "${existingMember.name}" successfully removed.`,
      deletedMemberId: memberId,
      data: {
        householdId,
        ...demographics,
        demographics,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete member: ' + (error?.message || 'Unknown'),
      },
    });
  }
}
