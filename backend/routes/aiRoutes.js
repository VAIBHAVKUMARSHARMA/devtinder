const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

router.post('/icebreaker', protect, aiController.generateIcebreaker);
router.post('/bio', protect, aiController.optimizeBio);
router.post('/match', protect, aiController.calculateMatchScore);

module.exports = router;
