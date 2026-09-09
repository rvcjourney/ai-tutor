const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// A single pooled connection, shared by every repository — `pg` manages the
// actual TCP connections; callers just `await query(...)`. `DATABASE_URL` is a
// standard Postgres connection string (e.g. postgresql://user:pass@db:5432/name);
// `db` as the host is the Docker Compose service name, not a literal hostname.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  return pool.query(text, params);
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Runs once at boot. `CREATE TABLE IF NOT EXISTS` is idempotent, so on every
// restart after the first this is a fast no-op against tables that already
// exist on the persistent volume — same shape as the old SQLite bootstrap, just
// awaited instead of synchronous.
async function ensureSchema() {
  await pool.query(schema);
}

module.exports = { query, pool, ensureSchema };
