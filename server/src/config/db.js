import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(serverRoot, '.env') });

const { Pool } = pg;
const PLACEHOLDER_RE = /your-password|changeme|example\.com|YOUR_PASSWORD/i;

function supabaseProjectRef() {
  const url = process.env.SUPABASE_URL || 'https://oejvlgmoxefwwawqdpwo.supabase.co';
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'oejvlgmoxefwwawqdpwo';
  }
}

function hasRemoteCredentials() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const password = process.env.SUPABASE_DB_PASSWORD || '';
  if (databaseUrl && !PLACEHOLDER_RE.test(databaseUrl)) return true;
  if (password && !PLACEHOLDER_RE.test(password)) return true;
  return false;
}

function connectionCandidates() {
  const urls = [];
  if (process.env.DATABASE_URL && !PLACEHOLDER_RE.test(process.env.DATABASE_URL)) {
    urls.push(process.env.DATABASE_URL);
  }

  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '');
  if (!password) return urls;

  const ref = supabaseProjectRef();
  const database = process.env.SUPABASE_DB_NAME || 'postgres';
  const poolerHost = process.env.SUPABASE_DB_POOLER_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com';
  const preferPooler = process.env.SUPABASE_DB_USE_POOLER !== 'false';
  const poolerUser = `postgres.${ref}`;
  const poolerUrl = `postgresql://${poolerUser}:${password}@${poolerHost}:5432/${database}`;
  const directUrl = `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/${database}`;

  if (preferPooler) urls.push(poolerUrl, directUrl);
  else urls.push(directUrl, poolerUrl);

  return [...new Set(urls)];
}

function attachTransaction(pool) {
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

async function connectSupabasePool() {
  if (!hasRemoteCredentials()) {
    throw new Error('Supabase credentials are missing. Set DATABASE_URL or SUPABASE_DB_PASSWORD in server/.env.');
  }

  const urls = connectionCandidates();
  if (!urls.length) {
    throw new Error('Set DATABASE_URL or SUPABASE_DB_PASSWORD in server/.env.');
  }

  const errors = [];
  for (const connectionString of urls) {
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 12_000,
    });
    try {
      await pool.query('SELECT 1 AS ok');
      return attachTransaction(pool);
    } catch (error) {
      errors.push(error.message);
      await pool.end().catch(() => {});
    }
  }

  throw new Error(`Could not reach Supabase Postgres. ${errors.at(-1) || ''}`.trim());
}

function createDeferredPool() {
  let impl = null;
  const ready = (async () => {
    impl = await connectSupabasePool();
    if (process.env.NODE_ENV !== 'test') {
      console.log('Supabase PostgreSQL connected');
    }
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
