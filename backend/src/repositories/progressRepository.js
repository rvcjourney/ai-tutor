const { query } = require('../db');

async function get(userId) {
  const result = await query('SELECT * FROM user_progress WHERE user_id = $1', [userId]);
  return result.rows[0];
}

async function upsert(userId, { currentState, lastCompletedState, moduleId, subTopicId, status }) {
  const existing = await get(userId);
  if (existing) {
    await query(
      `UPDATE user_progress
       SET current_state = $1, last_completed_state = COALESCE($2, last_completed_state),
           module_id = COALESCE($3, module_id), sub_topic_id = COALESCE($4, sub_topic_id),
           status = $5, updated_at = NOW()
       WHERE user_id = $6`,
      [currentState, lastCompletedState || null, moduleId || null, subTopicId || null, status, userId]
    );
  } else {
    await query(
      `INSERT INTO user_progress (user_id, current_state, last_completed_state, module_id, sub_topic_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, currentState, lastCompletedState || null, moduleId || null, subTopicId || null, status]
    );
  }
  return get(userId);
}

module.exports = { get, upsert };
