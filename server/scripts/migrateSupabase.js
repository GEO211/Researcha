import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const schemaPath = path.resolve(__dirname, '../../database/supabase/schema.sql');
  const migrationsDir = path.resolve(__dirname, '../../database/supabase/migrations');

  console.log('Applying Supabase schema...');
  await pool.query(readFileSync(schemaPath, 'utf8'));
  console.log('Schema applied.');

  if (readdirSync(migrationsDir).length) {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`Applying migration ${file}...`);
      await pool.query(readFileSync(migrationPath, 'utf8'));
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
