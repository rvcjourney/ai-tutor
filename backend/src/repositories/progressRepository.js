const db = require('../db');

function get(userId) {
  return db.prepare('SELECT * FROM user_progress WHERE user_id = ?').get(userId);
}

function upsert(userId, { currentState, lastCompletedState, moduleId, status }) {
  const existing = get(userId);
  if (existing) {
    db.prepare(
      `UPDATE user_progress
       SET current_state = ?, last_completed_state = COALESCE(?, last_completed_state),
           module_id = COALESCE(?, module_id), status = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(currentState, lastCompletedState || null, moduleId || null, status, userId);
  } else {
    db.prepare(
      `INSERT INTO user_progress (user_id, current_state, last_completed_state, module_id, status)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, currentState, lastCompletedState || null, moduleId || null, status);
  }
  return get(userId);
}

module.exports = { get, upsert };
