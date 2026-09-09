import { app } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { getPrismaClient } from './config/db.js';
import { ensurePostgresRunning } from './config/embeddedPostgres.js';

const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`========================================================`);
  logger.info(`Disaster Management API Server`);
  logger.info(`Stage 0: Base Architecture & PostgreSQL/Prisma initialized`);
  logger.info(`Listening on: http://0.0.0.0:${PORT}`);
  logger.info(`Health check: http://0.0.0.0:${PORT}/api/health`);
  logger.info(`Environment:  ${config.nodeEnv}`);
  logger.info(`========================================================`);

  // Ensure PostgreSQL is active in background
  ensurePostgresRunning().catch((err) => {
    logger.warn('Background PostgreSQL init notice:', err);
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      const prisma = getPrismaClient();
      await prisma.$disconnect();
      logger.info('Prisma database connections closed.');
    } catch (err) {
      logger.error('Error disconnecting Prisma:', err);
    }
    process.exit(0);
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
