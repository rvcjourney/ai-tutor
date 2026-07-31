const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');

function get(req, res, next) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId query param is required' });
    }
    const user = userRepository.findOrCreateByExternalId(userId);
    const progress = progressRepository.get(user.id);
    if (!progress) {
      return res.json({ userId, currentState: null, lastCompletedState: null, moduleId: null, status: 'not_started' });
    }
    res.json({
      userId,
      currentState: progress.current_state,
      lastCompletedState: progress.last_completed_state,
      moduleId: progress.module_id,
      status: progress.status,
      updatedAt: progress.updated_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { get };
