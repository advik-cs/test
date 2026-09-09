import { PrismaClient } from '@prisma/client';
import { config } from './env';
import { logger } from '../utils/logger';
import { isPostgresListening, ensurePostgresRunning } from './embeddedPostgres';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (global.prismaGlobal) {
    return global.prismaGlobal;
  }

  if (!prismaInstance) {
    // Configure event-based logging to prevent uncaught Prisma standard error dumps
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    (client as any).$on('error', (event: any) => {
      logger.warn(`Prisma Event: ${event.message || 'database operation notice'}`);
    });

    (client as any).$on('warn', (event: any) => {
      logger.warn(`Prisma Warning: ${event.message}`);
    });

    prismaInstance = client;

    if (config.nodeEnv !== 'production') {
      global.prismaGlobal = prismaInstance;
    }
  }

  return prismaInstance;
}

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    // Check if Postgres is reachable first
    let isListening = await isPostgresListening(5432, '127.0.0.1', 800);

    if (!isListening) {
      // Attempt auto-start embedded postgres if in local development
      const started = await ensurePostgresRunning();
      if (started) {
        isListening = await isPostgresListening(5432, '127.0.0.1', 1500);
      }
    }

    if (!isListening) {
      return {
        connected: false,
        error: 'Database server is not active on localhost:5432',
      };
    }

    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error: any) {
    return {
      connected: false,
      error: error?.message || 'Database connection could not be established',
    };
  }
}
