const db = require('../db');

function countAttempts(userId, stateId) {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ? AND state_id = ?')
    .get(userId, stateId);
  return row.count;
}

function log(userId, stateId, answerText, isCorrect, attemptNumber) {
  db.prepare(
    `INSERT INTO quiz_attempts (user_id, state_id, answer_text, is_correct, attempt_number)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, stateId, answerText, isCorrect ? 1 : 0, attemptNumber);
}

module.exports = { countAttempts, log };
