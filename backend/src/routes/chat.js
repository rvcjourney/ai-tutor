const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/start', chatController.start);
router.post('/message', chatController.message);

module.exports = router;
