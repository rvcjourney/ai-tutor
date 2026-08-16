const db = require('../db');

function markComplete(userId, moduleId, subTopicId) {
  db.prepare(
    `INSERT OR IGNORE INTO sub_topic_completions (user_id, module_id, sub_topic_id) VALUES (?, ?, ?)`
  ).run(userId, moduleId, subTopicId);
}

function getCompletedForUser(userId) {
  return db.prepare('SELECT module_id, sub_topic_id FROM sub_topic_completions WHERE user_id = ?').all(userId);
}

module.exports = { markComplete, getCompletedForUser };
