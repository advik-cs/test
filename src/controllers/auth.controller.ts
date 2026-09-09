import { Request, Response } from 'express';
import { getPrismaClient } from '../config/db.js';
import { signupSchema, loginSchema } from '../validators/auth.validator.js';
import { hashPassword, comparePassword, hashIdentity } from '../utils/security.js';
import { generateJwtToken } from '../utils/jwt.js';
import { getMobileLookupVariants } from '../utils/phone.js';
import { Role } from '@prisma/client';

/**
 * POST /api/auth/signup
 * Registers a new citizen or rescuer account with hashed password and identity number
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const parseResult = signupSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid registration parameters',
        details: parseResult.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  const { name, mobileNumber, password, identityNumber, role } = parseResult.data;
  const prisma = getPrismaClient();

  try {
    // Check if user already exists using all normalized phone variants
    const lookupVariants = getMobileLookupVariants(mobileNumber);
    const existingUser = await prisma.user.findFirst({
      where: { mobileNumber: { in: lookupVariants } },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'A user account with this mobile number already exists.',
        },
      });
      return;
    }

    // Cryptographic hashing of password and identity
    const passwordHash = await hashPassword(password);
    const { hash: identityNumberHash, last4: identityLast4 } = hashIdentity(identityNumber);

    const userRole = role === 'RESCUER' ? Role.RESCUER : Role.CITIZEN;

    // Create user record (never store plaintext password or full identity number)
    const newUser = await prisma.user.create({
      data: {
        name,
        mobileNumber,
        passwordHash,
        identityNumberHash,
        identityLast4,
        role: userRole,
      },
      select: {
        id: true,
        name: true,
        mobileNumber: true,
        role: true,
        identityLast4: true,
        createdAt: true,
      },
    });

    // Generate JWT authentication token
    const token = generateJwtToken({
      userId: newUser.id,
      role: newUser.role as 'CITIZEN' | 'RESCUER',
      mobileNumber: newUser.mobileNumber,
    });

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: newUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIGNUP_FAILED',
        message: error?.message || 'Failed to complete user registration.',
      },
    });
  }
}

/**
 * POST /api/auth/login
 * Authenticates user credentials and issues a signed JWT
 */
export async function login(req: Request, res: Response): Promise<void> {
  const parseResult = loginSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login parameters',
        details: parseResult.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  const { mobileNumber, password } = parseResult.data;
  const prisma = getPrismaClient();

  try {
    const lookupVariants = getMobileLookupVariants(mobileNumber);
    const user = await prisma.user.findFirst({
      where: { mobileNumber: { in: lookupVariants } },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid mobile number or password.',
        },
      });
      return;
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid mobile number or password.',
        },
      });
      return;
    }

    const token = generateJwtToken({
      userId: user.id,
      role: user.role as 'CITIZEN' | 'RESCUER',
      mobileNumber: user.mobileNumber,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        mobileNumber: user.mobileNumber,
        role: user.role,
        identityLast4: user.identityLast4,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: error?.message || 'Failed to authenticate user.',
      },
    });
  }
}

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile using the JWT payload
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  const prisma = getPrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        mobileNumber: true,
        role: true,
        identityLast4: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Authenticated user profile not found in database.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'ME_QUERY_FAILED',
        message: error?.message || 'Failed to retrieve profile.',
      },
    });
  }
}

/**
 * GET /api/auth/citizen-only
 * Role-protected endpoint accessible exclusively to CITIZEN role
 */
export function getCitizenPortal(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'Access granted: Welcome to the Citizen Evacuation & Household Portal.',
    permittedRole: 'CITIZEN',
    user: req.user,
  });
}

/**
 * GET /api/auth/rescuer-only
 * Role-protected endpoint accessible exclusively to RESCUER role
 */
export function getRescuerPortal(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'Access granted: Welcome to the Rescuer Emergency Operations & Dispatch Portal.',
    permittedRole: 'RESCUER',
    user: req.user,
  });
}

/**
 * GET /api/auth/shared-portal
 * Multi-role protected endpoint accessible to BOTH CITIZEN and RESCUER roles
 */
export function getSharedEmergencyPortal(req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'Access granted: Welcome to the Unified Disaster Emergency System.',
    permittedRoles: ['CITIZEN', 'RESCUER'],
    user: req.user,
  });
}

