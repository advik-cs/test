import { z } from 'zod';
import { MemberCategory } from '@prisma/client';
import { gpsLatitudeSchema, gpsLongitudeSchema } from './location.validator.js';

export const locationSchema = z.object({
  buildingName: z.string().trim().min(1, 'Building or landmark name is required'),
  address: z.string().trim().min(1, 'Address line is required'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().default('Odisha'),
  latitude: gpsLatitudeSchema,
  longitude: gpsLongitudeSchema,
});

export const initialMemberSchema = z.object({
  name: z.string().trim().min(1, 'Member name is required'),
  age: z
    .number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(130, 'Please enter a realistic age'),
  relationship: z.string().trim().min(1, 'Relationship is required'),
  category: z.nativeEnum(MemberCategory).optional(),
});

export const createHouseholdSchema = z
  .object({
    householdCode: z.string().trim().optional(),
    registeredHomeLocationId: z.string().uuid().optional(),
    location: locationSchema.optional(),
    members: z.array(initialMemberSchema).optional().default([]),
  })
  .refine(
    (data) => Boolean(data.registeredHomeLocationId) || Boolean(data.location),
    {
      message: 'Either registeredHomeLocationId or a location object must be provided',
      path: ['location'],
    }
  );

export const updateHouseholdSchema = z.object({
  householdCode: z.string().trim().min(1).optional(),
  registeredHomeLocationId: z.string().uuid().optional(),
  location: locationSchema.partial().optional(),
});

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, 'Member name is required'),
  age: z
    .number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(130, 'Please enter a realistic age'),
  relationship: z.string().trim().min(1, 'Relationship is required'),
  category: z.nativeEnum(MemberCategory).optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().trim().min(1).optional(),
  age: z
    .number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(130, 'Please enter a realistic age')
    .optional(),
  relationship: z.string().trim().min(1).optional(),
  category: z.nativeEnum(MemberCategory).optional(),
});
