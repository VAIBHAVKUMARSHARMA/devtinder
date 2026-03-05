const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a title for the task'],
        trim: true,
        maxlength: [200, 'Title cannot be more than 200 characters']
    },
    description: {
        type: String,
        maxlength: [2000, 'Description cannot be more than 2000 characters'],
        default: ''
    },
    status: {
        type: String,
        enum: ['Todo', 'In Progress', 'Done'],
        default: 'Todo'
    },
    workspace: {
        type: mongoose.Schema.ObjectId,
        ref: 'Workspace',
        required: true
    },
    assignee: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

// Index for faster queries
taskSchema.index({ workspace: 1, status: 1 });
taskSchema.index({ assignee: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
