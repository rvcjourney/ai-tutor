const express = require('express');
const moduleController = require('../controllers/moduleController');

const router = express.Router();

router.get('/', moduleController.list);
router.get('/:moduleId/subtopics/:subTopicId/qa', moduleController.getSubTopicQa);

module.exports = router;
