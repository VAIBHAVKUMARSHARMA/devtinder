const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name for the workspace'],
        trim: true,
        maxlength: [100, 'Workspace name cannot be more than 100 characters']
    },
    description: {
        type: String,
        maxlength: [1000, 'Description cannot be more than 1000 characters'],
        default: ''
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    pendingMembers: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    code: {
        type: String,
        default: '// Write your code here...\n\nconsole.log("Welcome to your Collaborative Workspace!");\n'
    },
    playValue: {
        type: Number,
        default: 0,
        min: [0, 'Play value cannot be negative']
    }
}, { timestamps: true });

// Index for faster queries
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ members: 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
