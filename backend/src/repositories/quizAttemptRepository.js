const { query } = require('../db');

async function countAttempts(userId, stateId) {
  const result = await query('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = $1 AND state_id = $2', [
    userId,
    stateId,
  ]);
  // Postgres returns COUNT(*) as a string (it's a bigint) — cast back to a number,
  // same type the old SQLite version implicitly returned.
  return Number(result.rows[0].count);
}

async function log(userId, stateId, answerText, isCorrect, attemptNumber) {
  await query(
    `INSERT INTO quiz_attempts (user_id, state_id, answer_text, is_correct, attempt_number)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, stateId, answerText, isCorrect ? 1 : 0, attemptNumber]
  );
}

module.exports = { countAttempts, log };
