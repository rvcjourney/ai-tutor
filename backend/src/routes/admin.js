const express = require('express');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.post('/import', adminController.importContent);
router.post('/preview', adminController.previewContent);

router.post('/topics', adminController.createTopic);
router.get('/topics/:moduleId', adminController.getContent);
router.get('/topics/:moduleId/export', adminController.exportContent);
router.put('/topics/:moduleId', adminController.renameTopic);
router.delete('/topics/:moduleId', adminController.deleteTopic);

router.post('/topics/:moduleId/subtopics', adminController.createSubTopic);
router.put('/topics/:moduleId/subtopics/:subTopicId', adminController.renameSubTopic);
router.delete('/topics/:moduleId/subtopics/:subTopicId', adminController.deleteSubTopic);

router.post('/topics/:moduleId/subtopics/:subTopicId/questions', adminController.createQuestion);
router.put('/topics/:moduleId/subtopics/:subTopicId/questions/:index', adminController.updateQuestion);
router.delete('/topics/:moduleId/subtopics/:subTopicId/questions/:index', adminController.deleteQuestion);

module.exports = router;
