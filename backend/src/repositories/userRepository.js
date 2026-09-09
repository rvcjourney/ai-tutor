const { query } = require('../db');

async function findOrCreateByExternalId(externalId) {
  const existing = await query('SELECT * FROM users WHERE external_id = $1', [externalId]);
  if (existing.rows[0]) return existing.rows[0];

  // Being async (unlike the old synchronous SQLite version) opens a real race here:
  // two requests for the same brand-new externalId can both miss the SELECT above
  // and both attempt the INSERT. ON CONFLICT DO NOTHING makes the loser's INSERT
  // return no row instead of throwing on the UNIQUE constraint, so it just re-reads
  // the row the winner created.
  const inserted = await query(
    'INSERT INTO users (external_id) VALUES ($1) ON CONFLICT (external_id) DO NOTHING RETURNING *',
    [externalId]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const retry = await query('SELECT * FROM users WHERE external_id = $1', [externalId]);
  return retry.rows[0];
}

async function setDisplayName(userId, displayName) {
  await query('UPDATE users SET display_name = $1 WHERE id = $2', [displayName, userId]);
}

module.exports = { findOrCreateByExternalId, setDisplayName };
