const fsmEngine = require('../engine/fsmEngine');
const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');

async function submit(req, res, next) {
  try {
    const { userId, answer } = req.body;
    if (!userId || typeof answer === 'undefined') {
      return res.status(400).json({ error: 'userId and answer are required' });
    }

    const user = await userRepository.findOrCreateByExternalId(userId);
    const progress = await progressRepository.get(user.id);
    if (!progress || fsmEngine.resolveNode(progress.current_state, progress.module_id).type !== 'quiz') {
      return res.status(400).json({ error: 'Current state is not a quiz' });
    }

    const response = await fsmEngine.handleMessage(userId, answer);
    res.json(response);
  } catch (err) {
    next(err);
  }
}

module.exports = { submit };
