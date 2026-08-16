const db = require('../db');

function get(userId) {
  return db.prepare('SELECT * FROM user_progress WHERE user_id = ?').get(userId);
}

function upsert(userId, { currentState, lastCompletedState, moduleId, subTopicId, status }) {
  const existing = get(userId);
  if (existing) {
    db.prepare(
      `UPDATE user_progress
       SET current_state = ?, last_completed_state = COALESCE(?, last_completed_state),
           module_id = COALESCE(?, module_id), sub_topic_id = COALESCE(?, sub_topic_id),
           status = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(currentState, lastCompletedState || null, moduleId || null, subTopicId || null, status, userId);
  } else {
    db.prepare(
      `INSERT INTO user_progress (user_id, current_state, last_completed_state, module_id, sub_topic_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, currentState, lastCompletedState || null, moduleId || null, subTopicId || null, status);
  }
  return get(userId);
}

module.exports = { get, upsert };
