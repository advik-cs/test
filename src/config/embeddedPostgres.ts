import net from 'net';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

let isStarting = false;
let embeddedInstance: any = null;

export function isPostgresListening(port = 5432, host = '127.0.0.1', timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    try {
      socket.connect(port, host);
    } catch {
      resolve(false);
    }
  });
}

export async function ensurePostgresRunning(): Promise<boolean> {
  // Check if port 5432 is already accepting connections
  const alreadyRunning = await isPostgresListening(5432);
  if (alreadyRunning) {
    return true;
  }

  if (isStarting) {
    // Wait up to 10s for ongoing start
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isPostgresListening(5432)) {
        return true;
      }
    }
    return false;
  }

  isStarting = true;

  try {
    logger.info('Initializing embedded PostgreSQL service on port 5432...');

    // Dynamically import embedded-postgres
    const embeddedModule: any = await import('embedded-postgres');
    const EmbeddedPostgres = embeddedModule.default?.default || embeddedModule.default || embeddedModule;

    const dataDir = path.resolve(process.cwd(), '.pgdata');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    embeddedInstance = new EmbeddedPostgres({
      databaseDir: dataDir,
      port: 5432,
      user: 'postgres',
      password: 'password',
      createPostgresUser: true,
      persistent: true,
    });

    // Check if initialized
    const isInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (!isInit) {
      logger.info('Performing initial PostgreSQL cluster bootstrap...');
      await embeddedInstance.initialise();
    }

    await embeddedInstance.start();
    logger.info('Embedded PostgreSQL started successfully on port 5432.');

    // Ensure database exists
    try {
      await embeddedInstance.createDatabase('disaster_management');
      logger.info('Database "disaster_management" verified/created.');
    } catch {
      // Already exists
    }

    return true;
  } catch (err: any) {
    logger.warn('Could not launch embedded PostgreSQL:', err?.message || err);
    return false;
  } finally {
    isStarting = false;
  }
}
