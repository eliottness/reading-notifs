import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function runMigrations() {
  const migrationsFolder = resolve(__dirname, '../../drizzle');
  migrate(db, { migrationsFolder });
}
