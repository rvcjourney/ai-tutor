const db = require('../db');

function findOrCreateByExternalId(externalId) {
  const existing = db.prepare('SELECT * FROM users WHERE external_id = ?').get(externalId);
  if (existing) return existing;

  const result = db.prepare('INSERT INTO users (external_id) VALUES (?)').run(externalId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function setDisplayName(userId, displayName) {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
}

module.exports = { findOrCreateByExternalId, setDisplayName };
