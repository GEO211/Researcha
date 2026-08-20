import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(serverRoot, '.env') });

const { Pool } = pg;
const PLACEHOLDER_RE = /your-password|changeme|example\.com/i;

function hasUsableRemoteDatabase() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const password = process.env.SUPABASE_DB_PASSWORD || '';

  if (databaseUrl && !PLACEHOLDER_RE.test(databaseUrl)) return true;
  if (password && !PLACEHOLDER_RE.test(password)) return true;
  return false;
}

function buildConnectionString() {
  if (process.env.DATABASE_URL && !PLACEHOLDER_RE.test(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL;
  }

  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '');
  const host = process.env.SUPABASE_DB_HOST || 'db.oejvlgmoxefwwawqdpwo.supabase.co';
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const database = process.env.SUPABASE_DB_NAME || 'postgres';
  const port = process.env.SUPABASE_DB_PORT || '5432';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function createPgPool() {
  const useSsl = process.env.NODE_ENV === 'production' || process.env.SUPABASE_DB_SSL !== 'false';
  const pool = new Pool({
    connectionString: buildConnectionString(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  pool.transaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return pool;
}

function createPglitePool(db) {
  return {
    async query(text, params) {
      if (!params?.length && /;\s*\S/.test(text.trim().replace(/;\s*$/, ''))) {
        const results = await db.exec(text);
        return results.at(-1) || { rows: [] };
      }
      return db.query(text, params);
    },
    transaction: (fn) => db.transaction((tx) => fn(tx)),
    async connect() {
      return {
        query: (sql, params) => db.query(sql, params),
        release() {},
      };
    },
    async end() {
      await db.close();
    },
    on() {},
  };
}

async function applyLocalSchema(db) {
  const schemaPath = path.resolve(serverRoot, '../database/supabase/schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  await db.exec(schemaSql);
}

async function ensureLocalData(db) {
  await applyLocalSchema(db);
  const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0]?.count > 0) return;

  const { seedCareLink } = await import('../../scripts/seedSupabase.js');
  await seedCareLink();
}

function createDeferredPool() {
  let impl = null;
  const ready = (async () => {
    if (hasUsableRemoteDatabase()) {
      impl = createPgPool();
      impl.on('connect', () => {
        if (process.env.NODE_ENV !== 'test') {
          console.log('Supabase PostgreSQL connected');
        }
      });
      return impl;
    }

    const { PGlite } = await import('@electric-sql/pglite');
    // In-memory avoids Windows file locks and nodemon restart loops on data/.
    const db = await PGlite.create();
    impl = createPglitePool(db);
    await ensureLocalData(db);
    console.log('Using in-memory PGlite database (set DATABASE_URL in server/.env to use Supabase)');
    return impl;
  })();

  const call = (method) => async (...args) => {
    const target = impl || (await ready);
    return target[method](...args);
  };

  return {
    ready,
    query: call('query'),
    connect: call('connect'),
    end: call('end'),
    transaction: call('transaction'),
    on(event, listener) {
      ready.then((target) => target.on?.(event, listener)).catch(() => {});
    },
  };
}

export const pool = createDeferredPool();

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
