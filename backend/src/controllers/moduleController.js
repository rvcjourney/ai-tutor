const { getModulesRegistry } = require('../engine/conversationLoader');

function list(req, res) {
  res.json({ modules: getModulesRegistry() });
}

module.exports = { list };
