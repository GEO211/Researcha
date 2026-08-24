import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runSqlFile(connection, relativePath) {
  const sql = await fs.readFile(path.join(projectRoot, relativePath), 'utf8');
  const statements = splitStatements(sql);

  for (const statement of statements) {
    await connection.query(statement);
  }
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  return Number(rows[0].count) > 0;
}

async function ensureColumn(connection, tableName, columnName, definition) {
  if (!(await columnExists(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function runCompatibilityMigrations(connection) {
  await connection.query(`USE ${process.env.DB_NAME || 'carelink'}`);
  await ensureColumn(connection, 'patients', 'email', 'VARCHAR(150) NULL AFTER contact_number');
  await ensureColumn(connection, 'patients', 'address2', 'VARCHAR(255) NULL AFTER address');
  await ensureColumn(connection, 'patients', 'city', 'VARCHAR(100) NULL AFTER address2');
  await ensureColumn(connection, 'patients', 'postal_code', 'VARCHAR(20) NULL AFTER city');
  await ensureColumn(connection, 'patients', 'province', 'VARCHAR(100) NULL AFTER postal_code');
  await ensureColumn(connection, 'patients', 'is_child', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER is_pwd');
  await ensureColumn(connection, 'patients', 'is_infant', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER is_child');
  await ensureColumn(connection, 'patients', 'is_indigenous', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER is_infant');
  await ensureColumn(connection, 'patients', 'is_solo_parent', 'BOOLEAN NOT NULL DEFAULT FALSE AFTER is_indigenous');
  await connection.query('ALTER TABLE patients MODIFY contact_number VARCHAR(30) NULL');
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
  });

  try {
    await runSqlFile(connection, 'database/schema.sql');
    await runCompatibilityMigrations(connection);
    await runSqlFile(connection, 'database/seed.sql');
    console.log('CareLink database schema and seed data imported successfully.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Database setup failed:');
  console.error(error.message);
  process.exit(1);
});
