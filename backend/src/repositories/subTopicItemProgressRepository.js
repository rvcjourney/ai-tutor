const { query } = require('../db');

/** Only ever moves forward — if a learner re-enters a sub-topic and lands on an
 *  earlier item than they'd already reached (e.g. navigates back in), the stored
 *  "furthest reached" shouldn't regress. */
async function recordProgress(userId, moduleId, subTopicId, itemsSeen) {
  await query(
    `INSERT INTO sub_topic_item_progress (user_id, module_id, sub_topic_id, items_seen)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, module_id, sub_topic_id)
     DO UPDATE SET items_seen = GREATEST(sub_topic_item_progress.items_seen, EXCLUDED.items_seen), updated_at = NOW()`,
    [userId, moduleId, subTopicId, itemsSeen]
  );
}

async function getProgressForUser(userId) {
  const result = await query(
    'SELECT module_id, sub_topic_id, items_seen FROM sub_topic_item_progress WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

module.exports = { recordProgress, getProgressForUser };
