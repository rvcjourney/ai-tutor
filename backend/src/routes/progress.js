const express = require('express');
const progressController = require('../controllers/progressController');

const router = express.Router();

router.get('/', progressController.get);

module.exports = router;
