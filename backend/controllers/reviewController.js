const Review = require('../models/Review');
const User = require('../models/User');

// @desc    Add a review
// @route   POST /api/reviews/:userId
// @access  Private
exports.addReview = async (req, res) => {
    try {
        const { rating, content } = req.body;
        const recipientId = req.params.userId;
        const reviewerId = req.user._id;

        // Prevent reviewing yourself
        if (recipientId === reviewerId.toString()) {
            return res.status(400).json({
                status: 'fail',
                message: 'You cannot review yourself'
            });
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        // Check if review already exists
        const existingReview = await Review.findOne({
            reviewer: reviewerId,
            recipient: recipientId
        });

        if (existingReview) {
            return res.status(400).json({
                status: 'fail',
                message: 'You have already reviewed this user'
            });
        }

        const review = await Review.create({
            reviewer: reviewerId,
            recipient: recipientId,
            rating,
            content
        });

        res.status(201).json({
            status: 'success',
            data: {
                review
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get reviews for a user
// @route   GET /api/reviews/:userId
// @access  Private
exports.getUserReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ recipient: req.params.userId })
            .populate('reviewer', 'name profilePicture headline')
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            results: reviews.length,
            data: {
                reviews
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};
