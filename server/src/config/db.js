import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '');
  const host = process.env.SUPABASE_DB_HOST || 'db.oejvlgmoxefwwawqdpwo.supabase.co';
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const database = process.env.SUPABASE_DB_NAME || 'postgres';
  const port = process.env.SUPABASE_DB_PORT || '5432';

  if (!password) {
    throw new Error('Set DATABASE_URL or SUPABASE_DB_PASSWORD in server/.env');
  }

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: process.env.NODE_ENV === 'production' || process.env.SUPABASE_DB_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('Supabase PostgreSQL connected');
  }
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
