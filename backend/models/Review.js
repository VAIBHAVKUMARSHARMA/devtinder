const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    reviewer: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Review must belong to a reviewer']
    },
    recipient: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Review must belong to a recipient']
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: [true, 'Review must have a rating']
    },
    content: {
        type: String,
        required: [true, 'Review must have content']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Prevent duplicate reviews
reviewSchema.index({ reviewer: 1, recipient: 1 }, { unique: true });

// Static method to calculate avg rating for a user (placeholder for future)
// reviewSchema.statics.calcAverageRatings = async function(userId) { ... }

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
