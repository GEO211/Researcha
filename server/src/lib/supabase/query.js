import { pool } from '../../config/db.js';

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function withTransaction(fn) {
  return pool.transaction(fn);
}
