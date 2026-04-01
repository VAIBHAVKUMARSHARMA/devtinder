const mongoose = require('mongoose');

const DEFAULT_WHITEBOARD_DATA = {
    kind: 'excalidraw',
    elements: [],
    appState: {
        viewBackgroundColor: '#ffffff'
    },
    files: {},
    libraryItems: []
};

const buildDefaultWhiteboardData = () => ({
    kind: DEFAULT_WHITEBOARD_DATA.kind,
    elements: [...DEFAULT_WHITEBOARD_DATA.elements],
    appState: { ...DEFAULT_WHITEBOARD_DATA.appState },
    files: { ...DEFAULT_WHITEBOARD_DATA.files },
    libraryItems: [...DEFAULT_WHITEBOARD_DATA.libraryItems]
});

const developerDraftSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    codeFiles: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ([])
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

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
        default: ''
    },
    codeFiles: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ([])
    },
    whiteboardData: {
        type: mongoose.Schema.Types.Mixed,
        default: () => buildDefaultWhiteboardData()
    },
    developerDrafts: {
        type: [developerDraftSchema],
        default: () => ([])
    },
    combineDraftManagers: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    lastCombinedAt: {
        type: Date,
        default: null
    },
    lastCombinedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

// Index for faster queries
workspaceSchema.index({ owner: 1 });
workspaceSchema.index({ members: 1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
