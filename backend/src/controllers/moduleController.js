const { getModulesRegistry } = require('../engine/conversationLoader');
const { getSubTopicQaList } = require('../admin/topicContent');

function list(req, res) {
  res.json({ modules: getModulesRegistry() });
}

function getSubTopicQa(req, res, next) {
  try {
    const { moduleId, subTopicId } = req.params;
    const items = getSubTopicQaList(moduleId, subTopicId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getSubTopicQa };
