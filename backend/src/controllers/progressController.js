const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');
const { getProgressSummary } = require('../engine/progressSummary');

function get(req, res, next) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId query param is required' });
    }
    const user = userRepository.findOrCreateByExternalId(userId);
    const progress = progressRepository.get(user.id);
    const summary = getProgressSummary(user.id);

    if (!progress) {
      return res.json({
        userId,
        displayName: user.display_name,
        currentState: null,
        lastCompletedState: null,
        moduleId: null,
        status: 'not_started',
        ...summary,
      });
    }
    res.json({
      userId,
      displayName: user.display_name,
      currentState: progress.current_state,
      lastCompletedState: progress.last_completed_state,
      moduleId: progress.module_id,
      subTopicId: progress.sub_topic_id,
      status: progress.status,
      updatedAt: progress.updated_at,
      ...summary,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { get };
