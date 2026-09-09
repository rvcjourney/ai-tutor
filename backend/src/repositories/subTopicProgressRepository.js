const { query } = require('../db');

async function markComplete(userId, moduleId, subTopicId) {
  await query(
    `INSERT INTO sub_topic_completions (user_id, module_id, sub_topic_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, module_id, sub_topic_id) DO NOTHING`,
    [userId, moduleId, subTopicId]
  );
}

async function getCompletedForUser(userId) {
  const result = await query('SELECT module_id, sub_topic_id FROM sub_topic_completions WHERE user_id = $1', [userId]);
  return result.rows;
}

async function isComplete(userId, moduleId, subTopicId) {
  const result = await query(
    'SELECT 1 FROM sub_topic_completions WHERE user_id = $1 AND module_id = $2 AND sub_topic_id = $3',
    [userId, moduleId, subTopicId]
  );
  return result.rows.length > 0;
}

module.exports = { markComplete, getCompletedForUser, isComplete };
