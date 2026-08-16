const { slugifyLower } = require('./slugify');
const { buildTopic, validateRow } = require('./csvImporter');
const { getTopicRows, getTopicEntry } = require('./topicContent');
const { publish, removeTopic } = require('./publishService');
const { getModulesRegistry } = require('../engine/conversationLoader');

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

/** Every CRUD mutation ends here: renumber rows in list order (an admin never types
 *  a sequence number by hand — order is just array order), group them back into the
 *  Map shape buildTopic() already expects, regenerate the topic's states from
 *  scratch, and publish. Reuses the exact same validated, rollback-safe write path
 *  the CSV importer uses — a CRUD edit is just "the same generator, fed different rows." */
function regenerateAndPublish(title, rows, allSubTopicLabels) {
  const counters = new Map();
  const numberedRows = rows.map((row) => {
    const key = `${row.subTopic}::${row.type}`;
    const num = (counters.get(key) || 0) + 1;
    counters.set(key, num);
    return { ...row, num };
  });

  const subTopicsMap = new Map();
  for (const label of allSubTopicLabels) {
    if (!subTopicsMap.has(label)) subTopicsMap.set(label, []);
  }
  for (const row of numberedRows) {
    if (!subTopicsMap.has(row.subTopic)) subTopicsMap.set(row.subTopic, []);
    subTopicsMap.get(row.subTopic).push(row);
  }

  const topicPlan = buildTopic(title, subTopicsMap);
  publish([topicPlan]);
  return topicPlan;
}

function createTopic(title) {
  if (!title || !title.trim()) throw badRequest('title is required');
  const trimmed = title.trim();
  const moduleId = slugifyLower(trimmed);
  if (getModulesRegistry().find((m) => m.id === moduleId)) {
    throw badRequest(`A topic with id "${moduleId}" already exists`);
  }
  const topicPlan = buildTopic(trimmed, new Map());
  publish([topicPlan]);
  return topicPlan.registryEntry;
}

function renameTopic(moduleId, newTitle) {
  if (!newTitle || !newTitle.trim()) throw badRequest('title is required');
  const trimmed = newTitle.trim();
  const entry = getTopicEntry(moduleId);
  const newModuleId = slugifyLower(trimmed);
  const allLabels = (entry.subTopics || []).map((st) => st.label);

  if (newModuleId === moduleId) {
    // Title text changed (e.g. casing/punctuation) but the slug didn't — safe to
    // regenerate in place, no old/new identity split to reconcile.
    const rows = getTopicRows(moduleId);
    const topicPlan = regenerateAndPublish(trimmed, rows, allLabels);
    return topicPlan.registryEntry;
  }

  if (getModulesRegistry().find((m) => m.id === newModuleId)) {
    throw badRequest(`A topic with id "${newModuleId}" already exists`);
  }

  // The slug changes, so this is really "create under the new id, then remove the
  // old one" — deliberately in that order: if creating the new one fails, the old
  // topic is untouched; if removing the old one afterward fails, you're left with
  // both (recoverable — just delete the old one) rather than with neither.
  const rows = getTopicRows(moduleId).map((r) => ({ ...r, topic: trimmed }));
  const topicPlan = regenerateAndPublish(trimmed, rows, allLabels);
  removeTopic(moduleId);
  return topicPlan.registryEntry;
}

function createSubTopic(moduleId, label) {
  if (!label || !label.trim()) throw badRequest('label is required');
  const trimmed = label.trim();
  const entry = getTopicEntry(moduleId);
  const subTopicId = slugifyLower(trimmed);
  if ((entry.subTopics || []).some((st) => st.id === subTopicId)) {
    throw badRequest(`A sub-topic with id "${subTopicId}" already exists in this topic`);
  }

  const rows = getTopicRows(moduleId);
  const allLabels = [...(entry.subTopics || []).map((st) => st.label), trimmed];
  regenerateAndPublish(entry.title, rows, allLabels);
  return { id: subTopicId, label: trimmed };
}

function renameSubTopic(moduleId, subTopicId, newLabel) {
  if (!newLabel || !newLabel.trim()) throw badRequest('label is required');
  const trimmed = newLabel.trim();
  const entry = getTopicEntry(moduleId);
  const subTopic = (entry.subTopics || []).find((st) => st.id === subTopicId);
  if (!subTopic) throw notFound(`No sub-topic with id "${subTopicId}"`);

  const newSubTopicId = slugifyLower(trimmed);
  if (newSubTopicId !== subTopicId && (entry.subTopics || []).some((st) => st.id === newSubTopicId)) {
    throw badRequest(`A sub-topic with id "${newSubTopicId}" already exists in this topic`);
  }

  const rows = getTopicRows(moduleId).map((r) => (r.subTopic === subTopic.label ? { ...r, subTopic: trimmed } : r));
  const allLabels = (entry.subTopics || []).map((st) => (st.id === subTopicId ? trimmed : st.label));
  regenerateAndPublish(entry.title, rows, allLabels);
  return { id: newSubTopicId, label: trimmed };
}

function deleteSubTopic(moduleId, subTopicId) {
  const entry = getTopicEntry(moduleId);
  const subTopic = (entry.subTopics || []).find((st) => st.id === subTopicId);
  if (!subTopic) throw notFound(`No sub-topic with id "${subTopicId}"`);

  const rows = getTopicRows(moduleId).filter((r) => r.subTopic !== subTopic.label);
  const allLabels = (entry.subTopics || []).filter((st) => st.id !== subTopicId).map((st) => st.label);
  regenerateAndPublish(entry.title, rows, allLabels);
  return { removed: subTopicId };
}

function findQuestion(moduleId, subTopicId, index) {
  const entry = getTopicEntry(moduleId);
  const subTopic = (entry.subTopics || []).find((st) => st.id === subTopicId);
  if (!subTopic) throw notFound(`No sub-topic with id "${subTopicId}"`);

  const rows = getTopicRows(moduleId);
  const subRows = rows.filter((r) => r.subTopic === subTopic.label);
  const i = parseInt(index, 10);
  if (!Number.isInteger(i) || i < 0 || i >= subRows.length) {
    throw notFound(`No question at index ${index} in sub-topic "${subTopicId}"`);
  }
  return { entry, subTopic, rows, subRows, index: i };
}

function createQuestion(moduleId, subTopicId, questionData) {
  const entry = getTopicEntry(moduleId);
  const subTopic = (entry.subTopics || []).find((st) => st.id === subTopicId);
  if (!subTopic) throw notFound(`No sub-topic with id "${subTopicId}"`);

  const { errors, row } = validateRow({ ...questionData, topic: entry.title, subTopic: subTopic.label }, { requireNum: false });
  if (errors.length) throw badRequest(errors.join('; '));

  const rows = [...getTopicRows(moduleId), row];
  const allLabels = (entry.subTopics || []).map((st) => st.label);
  regenerateAndPublish(entry.title, rows, allLabels);
  return row;
}

function updateQuestion(moduleId, subTopicId, index, questionData) {
  const { entry, subTopic, rows, subRows, index: i } = findQuestion(moduleId, subTopicId, index);
  const target = subRows[i];
  const merged = { ...target, ...questionData, topic: entry.title, subTopic: subTopic.label, type: target.type };
  const { errors, row } = validateRow(merged, { requireNum: false });
  if (errors.length) throw badRequest(errors.join('; '));

  const targetPos = rows.indexOf(target);
  rows[targetPos] = row;
  const allLabels = (entry.subTopics || []).map((st) => st.label);
  regenerateAndPublish(entry.title, rows, allLabels);
  return row;
}

function deleteQuestion(moduleId, subTopicId, index) {
  const { entry, subTopic, rows, subRows, index: i } = findQuestion(moduleId, subTopicId, index);
  const target = subRows[i];
  const filtered = rows.filter((r) => r !== target);
  const allLabels = (entry.subTopics || []).map((st) => st.label);
  regenerateAndPublish(entry.title, filtered, allLabels);
  return { removed: true };
}

module.exports = {
  createTopic,
  renameTopic,
  createSubTopic,
  renameSubTopic,
  deleteSubTopic,
  createQuestion,
  updateQuestion,
  deleteQuestion,
};
