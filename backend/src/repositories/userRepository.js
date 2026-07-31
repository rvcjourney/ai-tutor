const db = require('../db');

function findOrCreateByExternalId(externalId) {
  const existing = db.prepare('SELECT * FROM users WHERE external_id = ?').get(externalId);
  if (existing) return existing;

  const result = db.prepare('INSERT INTO users (external_id) VALUES (?)').run(externalId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = { findOrCreateByExternalId };
