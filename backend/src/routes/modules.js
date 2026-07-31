const express = require('express');
const moduleController = require('../controllers/moduleController');

const router = express.Router();

router.get('/', moduleController.list);

module.exports = router;
