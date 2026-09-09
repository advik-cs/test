import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { JwtUserPayload } from '../types/index.js';

/**
 * Generates a signed JWT for the authenticated user
 */
export function generateJwtToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies a JWT and extracts the user payload.
 * Throws an error if invalid or expired.
 */
export function verifyJwtToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  return decoded as JwtUserPayload;
}
