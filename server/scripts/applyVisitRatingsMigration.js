import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, '../../database/supabase/migrations/016_visit_ratings.sql');

await pool.query(readFileSync(sqlPath, 'utf8'));
const row = await pool.query('SELECT to_regclass(\'public.visit_ratings\') AS table_name');
console.log(row.rows[0]);
await pool.end();
