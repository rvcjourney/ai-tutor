const { importCsv, parseRows } = require('../admin/csvImporter');
const { publish, removeTopic } = require('../admin/publishService');
const { getTopicContent, getTopicRows, getTopicEntry } = require('../admin/topicContent');
const { rowsToCsv } = require('../admin/csvExporter');
const crud = require('../admin/crudService');

function requireCsv(req, res) {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    res.status(400).json({ error: '"csv" (string) is required in the request body' });
    return null;
  }
  return csv;
}

function importContent(req, res, next) {
  try {
    const csv = requireCsv(req, res);
    if (csv === null) return;

    const topicPlans = importCsv(csv);
    const published = publish(topicPlans);
    res.json({ published });
  } catch (err) {
    next(err);
  }
}

/** Parses + validates a CSV exactly like /admin/import does, but never writes
 *  anything — returns the actual parsed rows (not just counts) so the admin can
 *  review the real data in a table before committing to it, plus a small per-topic
 *  summary for quick orientation above the table. */
function previewContent(req, res, next) {
  try {
    const csv = requireCsv(req, res);
    if (csv === null) return;

    const rows = parseRows(csv);

    const summaryMap = new Map();
    for (const row of rows) {
      if (!summaryMap.has(row.topic)) {
        summaryMap.set(row.topic, { title: row.topic, subTopics: new Set(), questions: 0, mcqs: 0 });
      }
      const s = summaryMap.get(row.topic);
      s.subTopics.add(row.subTopic);
      if (row.type === 'MCQ') s.mcqs += 1;
      else s.questions += 1; // Q, GREETING, and OVERVIEW are all plain fact cards
    }
    const summary = [...summaryMap.values()].map((s) => ({ ...s, subTopics: s.subTopics.size }));

    res.json({ summary, rows });
  } catch (err) {
    next(err);
  }
}

function getContent(req, res, next) {
  try {
    const { moduleId } = req.params;
    const content = getTopicContent(moduleId);
    res.json(content);
  } catch (err) {
    next(err);
  }
}

/** Downloads a topic's current content as the same CSV shape /admin/import accepts —
 *  lets an admin do bulk edits offline in a spreadsheet, then re-publish through the
 *  normal Preview/Publish flow. Filename is cosmetic only: re-upload matches by the
 *  "Topic" column text inside the file, not by the file's name. */
function exportContent(req, res, next) {
  try {
    const { moduleId } = req.params;
    const entry = getTopicEntry(moduleId);
    const rows = getTopicRows(moduleId);
    const csv = rowsToCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${moduleId}.csv"`);
    res.send('﻿' + csv);
  } catch (err) {
    next(err);
  }
}

// ---- Topics ----

function createTopic(req, res, next) {
  try {
    const registryEntry = crud.createTopic(req.body.title);
    res.status(201).json({ topic: registryEntry });
  } catch (err) {
    next(err);
  }
}

function renameTopic(req, res, next) {
  try {
    const registryEntry = crud.renameTopic(req.params.moduleId, req.body.title);
    res.json({ topic: registryEntry });
  } catch (err) {
    next(err);
  }
}

function deleteTopic(req, res, next) {
  try {
    const removed = removeTopic(req.params.moduleId);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
}

// ---- Sub-topics ----

function createSubTopic(req, res, next) {
  try {
    const subTopic = crud.createSubTopic(req.params.moduleId, req.body.label);
    res.status(201).json({ subTopic });
  } catch (err) {
    next(err);
  }
}

function renameSubTopic(req, res, next) {
  try {
    const subTopic = crud.renameSubTopic(req.params.moduleId, req.params.subTopicId, req.body.label);
    res.json({ subTopic });
  } catch (err) {
    next(err);
  }
}

function deleteSubTopic(req, res, next) {
  try {
    const removed = crud.deleteSubTopic(req.params.moduleId, req.params.subTopicId);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
}

// ---- Questions ----

function createQuestion(req, res, next) {
  try {
    const question = crud.createQuestion(req.params.moduleId, req.params.subTopicId, req.body);
    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
}

function updateQuestion(req, res, next) {
  try {
    const question = crud.updateQuestion(req.params.moduleId, req.params.subTopicId, req.params.index, req.body);
    res.json({ question });
  } catch (err) {
    next(err);
  }
}

function deleteQuestion(req, res, next) {
  try {
    const removed = crud.deleteQuestion(req.params.moduleId, req.params.subTopicId, req.params.index);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  importContent,
  previewContent,
  getContent,
  exportContent,
  createTopic,
  renameTopic,
  deleteTopic,
  createSubTopic,
  renameSubTopic,
  deleteSubTopic,
  createQuestion,
  updateQuestion,
  deleteQuestion,
};
