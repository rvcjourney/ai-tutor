const express = require('express');
const quizController = require('../controllers/quizController');

const router = express.Router();

router.post('/submit', quizController.submit);

module.exports = router;
