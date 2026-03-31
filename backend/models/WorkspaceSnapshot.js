const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        default: 'Snapshot'
    },
    description: {
        type: String,
        default: ''
    },
    codeFiles: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ([])
    },
    whiteboardData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

const WorkspaceSnapshot = mongoose.model('WorkspaceSnapshot', snapshotSchema);

module.exports = WorkspaceSnapshot;
