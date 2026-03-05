const express = require('express');
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Protect all routes

router
    .route('/:userId')
    .get(reviewController.getUserReviews)
    .post(reviewController.addReview);

module.exports = router;
