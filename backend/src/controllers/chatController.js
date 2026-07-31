const fsmEngine = require('../engine/fsmEngine');

function start(req, res, next) {
  try {
    const { userId, simulateNextDay } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const response = fsmEngine.startSession(userId, { simulateNextDay: !!simulateNextDay });
    res.json(response);
  } catch (err) {
    next(err);
  }
}

function message(req, res, next) {
  try {
    const { userId, input } = req.body;
    if (!userId || typeof input === 'undefined') {
      return res.status(400).json({ error: 'userId and input are required' });
    }
    const response = fsmEngine.handleMessage(userId, input);
    res.json(response);
  } catch (err) {
    next(err);
  }
}

module.exports = { start, message };
