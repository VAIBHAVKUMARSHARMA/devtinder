const mongoose = require('mongoose');

const projectIdeaSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a title for your idea'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Please provide a description'],
        maxlength: [1000, 'Description cannot be more than 1000 characters']
    },
    skills: [{
        type: String,
        trim: true
    }],
    author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    },
    interestedUsers: [{
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        }
    }]
}, { timestamps: true });

// Index for faster queries
projectIdeaSchema.index({ author: 1, createdAt: -1 });

const ProjectIdea = mongoose.model('ProjectIdea', projectIdeaSchema);

module.exports = ProjectIdea;
