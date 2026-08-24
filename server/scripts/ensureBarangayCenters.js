import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { pool } from '../src/config/db.js';
import { ensureKoronadalBarangayCenters } from '../src/lib/supabase/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const sqlPath = path.resolve(__dirname, '../../database/supabase/migrations/007_barangay_health_centers.sql');
await pool.query(readFileSync(sqlPath, 'utf8'));
const centers = await ensureKoronadalBarangayCenters();
const barangayCenters = centers.filter((center) => center.type === 'barangay');
console.log(`Barangay health centers: ${barangayCenters.length}`);
console.log(barangayCenters.map((center) => center.barangay_name || center.name).join(', '));
await pool.end();
