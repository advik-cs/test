import { z } from 'zod';

/**
 * Preprocesses GPS coordinate values:
 * - Passes through valid finite numbers
 * - Coerces clean numeric strings (e.g., "20.301", "-85.828")
 * - Flags empty strings, non-numeric strings, or infinite values for rejection
 */
export const preprocessGpsCoordinate = (val: unknown) => {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : NaN;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : NaN;
  }
  return val;
};

export const gpsLatitudeSchema = z.preprocess(
  preprocessGpsCoordinate,
  z
    .number({ message: 'Latitude must be a valid number' })
    .refine((n) => Number.isFinite(n) && !Number.isNaN(n), {
      message: 'Latitude must be a valid finite number',
    })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
);

export const gpsLongitudeSchema = z.preprocess(
  preprocessGpsCoordinate,
  z
    .number({ message: 'Longitude must be a valid number' })
    .refine((n) => Number.isFinite(n) && !Number.isNaN(n), {
      message: 'Longitude must be a valid finite number',
    })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
);

export const updateHomeLocationSchema = z
  .object({
    buildingName: z.string().trim().min(1, 'Building or landmark name cannot be empty').optional(),
    address: z.string().trim().min(1, 'Address line cannot be empty').optional(),
    city: z.string().trim().min(1, 'City cannot be empty').optional(),
    state: z.string().trim().min(1, 'State cannot be empty').optional(),
    latitude: gpsLatitudeSchema.optional(),
    longitude: gpsLongitudeSchema.optional(),
  })
  .refine(
    (data) =>
      data.buildingName !== undefined ||
      data.address !== undefined ||
      data.city !== undefined ||
      data.state !== undefined ||
      data.latitude !== undefined ||
      data.longitude !== undefined,
    {
      message: 'At least one location field must be provided for update',
    }
  );

export const createHomeLocationSchema = z.object({
  buildingName: z.string().trim().min(1, 'Building or landmark name is required'),
  address: z.string().trim().min(1, 'Address line is required'),
  city: z.string().trim().min(1, 'City is required'),
  state: z.string().trim().default('Odisha'),
  latitude: gpsLatitudeSchema,
  longitude: gpsLongitudeSchema,
});

