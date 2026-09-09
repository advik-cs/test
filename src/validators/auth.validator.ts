import { z } from 'zod';
import { normalizeMobileNumber } from '../utils/phone.js';

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters'),
  mobileNumber: z
    .string()
    .trim()
    .transform((val) => normalizeMobileNumber(val))
    .refine((val) => /^\+?[0-9]{10,15}$/.test(val), {
      message: 'Please enter a valid mobile number (10 to 15 digits)',
    }),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
  identityNumber: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s\-.]/g, ''))
    .refine((val) => val.length >= 4, {
      message: 'Identity number must have at least 4 digits after removing spaces or hyphens',
    }),
  role: z
    .enum(['CITIZEN', 'RESCUER'])
    .default('CITIZEN')
    .optional(),
});

export const loginSchema = z.object({
  mobileNumber: z
    .string()
    .trim()
    .min(5, 'Mobile number is required')
    .transform((val) => normalizeMobileNumber(val)),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
