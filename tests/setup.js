/**
 * Test setup — forces SQLite mode with a temp DB path for isolation.
 * Must be imported before any backend modules.
 */
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '..', '.test-dbs');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Each test file gets its own DB
const dbPath = path.join(tmpDir, `test-${randomUUID()}.db`);
process.env.DB_PROVIDER = 'sqlite';
process.env.SQLITE_PATH = dbPath;
process.env.JWT_SECRET = 'test-secret-for-vitest';
process.env.NODE_ENV = 'test';

export { dbPath };
