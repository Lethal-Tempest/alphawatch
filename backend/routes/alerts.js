
const express = require('express');
const router = express.Router();
const { getAlerts, createAlert, updateAlert, deleteAlert, dismissAlert } = require('../controllers/alertController');
const verifyToken = require('../middleware/auth');

router.use(verifyToken);
router.route('/').get(getAlerts).post(createAlert);
router.route('/:id').delete(deleteAlert).put(updateAlert);
router.route('/:id/dismiss').patch(dismissAlert);

module.exports = router;
