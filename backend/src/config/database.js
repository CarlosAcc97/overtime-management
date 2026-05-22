import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../db/schema.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Turso (producción) vs SQLite local (desarrollo) ──────────────────────────
// Turso:  DATABASE_URL=libsql://nombre.turso.io  + TURSO_AUTH_TOKEN=ey...
// Local:  DATABASE_URL=./data/overtime.db  (o vacío)

const rawUrl = process.env.DATABASE_URL || './data/overtime.db';
const isTurso = rawUrl.startsWith('libsql://') || rawUrl.startsWith('https://');

let clientConfig;
if (isTurso) {
  clientConfig = {
    url:       rawUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  };
} else {
  // SQLite local — resolver path absoluto y crear directorio si no existe
  const urlWithoutPrefix = rawUrl.replace(/^file:/, '');
  const absolutePath = path.resolve(__dirname, '../../', urlWithoutPrefix);
  const dbDir = path.dirname(absolutePath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  clientConfig = { url: `file:${absolutePath}` };
}

export const client = createClient(clientConfig);
export const db = drizzle(client, { schema });

export default db;
