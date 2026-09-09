import { Request } from 'express';

export type UserRole = 'CITIZEN' | 'RESCUER';

export interface JwtUserPayload {
  userId: string;
  role: UserRole;
  mobileNumber: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  stage: string;
  database: {
    configured: boolean;
    provider: string;
    status: 'connected' | 'disconnected';
    details?: string;
    stats?: {
      users: number;
      citizens: number;
      rescuers: number;
      households: number;
      householdMembers: number;
      locations: number;
      disasters: number;
      affectedZones: number;
      shelters: number;
      expectedLocations: number;
      facilities: number;
      roads: number;
      notifications: number;
    };
  };
}
