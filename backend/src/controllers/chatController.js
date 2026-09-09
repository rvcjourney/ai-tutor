const fsmEngine = require('../engine/fsmEngine');

async function start(req, res, next) {
  try {
    const { userId, simulateNextDay, displayName, clientHour } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const response = await fsmEngine.startSession(userId, {
      simulateNextDay: !!simulateNextDay,
      displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined,
      clientHour: Number.isInteger(clientHour) ? clientHour : undefined,
    });
    res.json(response);
  } catch (err) {
    next(err);
  }
}

async function message(req, res, next) {
  try {
    const { userId, input } = req.body;
    if (!userId || typeof input === 'undefined') {
      return res.status(400).json({ error: 'userId and input are required' });
    }
    const response = await fsmEngine.handleMessage(userId, input);
    res.json(response);
  } catch (err) {
    next(err);
  }
}

module.exports = { start, message };
