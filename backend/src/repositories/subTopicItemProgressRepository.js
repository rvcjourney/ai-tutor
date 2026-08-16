const db = require('../db');

/** Only ever moves forward — if a learner re-enters a sub-topic and lands on an
 *  earlier item than they'd already reached (e.g. navigates back in), the stored
 *  "furthest reached" shouldn't regress. */
function recordProgress(userId, moduleId, subTopicId, itemsSeen) {
  db.prepare(
    `INSERT INTO sub_topic_item_progress (user_id, module_id, sub_topic_id, items_seen)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, module_id, sub_topic_id)
     DO UPDATE SET items_seen = MAX(items_seen, excluded.items_seen), updated_at = datetime('now')`
  ).run(userId, moduleId, subTopicId, itemsSeen);
}

function getProgressForUser(userId) {
  return db.prepare('SELECT module_id, sub_topic_id, items_seen FROM sub_topic_item_progress WHERE user_id = ?').all(userId);
}

module.exports = { recordProgress, getProgressForUser };
