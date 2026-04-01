const Workspace = require('../models/Workspace');
const User = require('../models/User');
const Task = require('../models/Task');
const { runWorkspaceCodeFiles, runWorkspaceTerminalCommand } = require('../utils/workspaceCodeRunner');

const DEFAULT_JS_CODE = '';
const DEFAULT_WHITEBOARD_DATA = {
    kind: 'excalidraw',
    elements: [],
    appState: {
        viewBackgroundColor: '#ffffff'
    },
    files: {},
    libraryItems: []
};

const createNodeId = () => `node_${Math.random().toString(36).slice(2, 10)}`;

const isPlainObject = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneSerializable = (value, fallback) => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return fallback;
    }
};

const normalizePath = (path = '') =>
    String(path)
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .trim();

const getNodeName = (path = '') => {
    const segments = path.split('/');
    return segments[segments.length - 1] || path;
};

const isValidWorkspacePath = (rawPath) => {
    if (typeof rawPath !== 'string') {
        return false;
    }

    const normalized = normalizePath(rawPath);
    if (!normalized) {
        return false;
    }

    return !normalized.toLowerCase().includes('[object object]');
};

const sortCodeFiles = (codeFiles = []) =>
    [...codeFiles].sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }
        return a.path.localeCompare(b.path);
    });

const dedupeCodeFiles = (codeFiles = []) => {
    const seen = new Set();
    const deduped = [];

    codeFiles.forEach((entry) => {
        const key = `${entry.type}:${entry.path.toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(entry);
        }
    });

    return deduped;
};

const buildLegacyCodeFiles = (fallbackJs = DEFAULT_JS_CODE) => {
    if (typeof fallbackJs !== 'string' || fallbackJs.length === 0) {
        return [];
    }

    return [
        {
            id: 'file_script_js',
            type: 'file',
            path: 'script.js',
            name: 'script.js',
            content: fallbackJs
        }
    ];
};

const normalizeArrayCodeFiles = (codeFiles = []) => {
    const normalized = codeFiles
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const type = entry.type === 'folder' ? 'folder' : 'file';
            if (!isValidWorkspacePath(entry.path)) {
                return null;
            }

            const path = normalizePath(entry.path);

            if (!path) {
                return null;
            }

            return {
                id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : createNodeId(),
                type,
                path,
                name: getNodeName(path),
                content: type === 'file' && typeof entry.content === 'string' ? entry.content : ''
            };
        })
        .filter(Boolean);

    return sortCodeFiles(dedupeCodeFiles(normalized));
};

const normalizeLegacyObjectCodeFiles = (codeFiles = {}, fallbackJs = DEFAULT_JS_CODE) => {
    const hasLegacyHtmlCssJs =
        typeof codeFiles?.html === 'string' ||
        typeof codeFiles?.css === 'string' ||
        typeof codeFiles?.js === 'string';

    if (hasLegacyHtmlCssJs) {
        return sortCodeFiles(dedupeCodeFiles([
            typeof codeFiles?.html === 'string'
                ? {
                    id: 'file_index_html',
                    type: 'file',
                    path: 'index.html',
                    name: 'index.html',
                    content: codeFiles.html
                }
                : null,
            typeof codeFiles?.css === 'string'
                ? {
                    id: 'file_styles_css',
                    type: 'file',
                    path: 'styles.css',
                    name: 'styles.css',
                    content: codeFiles.css
                }
                : null,
            typeof codeFiles?.js === 'string'
                ? {
                    id: 'file_script_js',
                    type: 'file',
                    path: 'script.js',
                    name: 'script.js',
                    content: codeFiles.js
                }
                : null
        ].filter(Boolean)));
    }

    const objectValues = Object.values(codeFiles).filter(
        (value) => value && typeof value === 'object' && typeof value.path === 'string'
    );

    if (objectValues.length > 0) {
        return normalizeArrayCodeFiles(objectValues);
    }

    return sortCodeFiles(buildLegacyCodeFiles(fallbackJs));
};

const normalizeCodeFiles = (codeFiles, fallbackJs = DEFAULT_JS_CODE) => {
    if (Array.isArray(codeFiles)) {
        return normalizeArrayCodeFiles(codeFiles);
    }

    if (codeFiles && typeof codeFiles === 'object') {
        return normalizeLegacyObjectCodeFiles(codeFiles, fallbackJs);
    }

    return sortCodeFiles(buildLegacyCodeFiles(fallbackJs));
};

const getPrimaryCode = (codeFiles = []) => {
    const jsFile = codeFiles.find(
        (entry) =>
            entry.type === 'file' &&
            typeof entry.path === 'string' &&
            entry.path.toLowerCase().endsWith('.js')
    );

    if (jsFile) {
        return jsFile.content || '';
    }

    const firstFile = codeFiles.find((entry) => entry.type === 'file');
    return firstFile?.content || '';
};

const getUserIdString = (userValue) => {
    if (!userValue) {
        return '';
    }

    if (typeof userValue === 'string') {
        return userValue;
    }

    if (userValue._id) {
        return userValue._id.toString();
    }

    if (typeof userValue.toString === 'function') {
        return userValue.toString();
    }

    return '';
};

const isWorkspaceMember = (workspace, userId) =>
    workspace.members.some((member) => getUserIdString(member) === getUserIdString(userId));

const canUserCombineDrafts = (workspace, userId) => {
    const normalizedUserId = getUserIdString(userId);
    if (!normalizedUserId) {
        return false;
    }

    if (getUserIdString(workspace.owner) === normalizedUserId) {
        return true;
    }

    const combineManagers = Array.isArray(workspace.combineDraftManagers)
        ? workspace.combineDraftManagers
        : [];

    return combineManagers.some((member) => getUserIdString(member) === normalizedUserId);
};

const resolveNextCodeFiles = ({ code, codeFiles }, existingCodeFiles = [], fallbackJs = DEFAULT_JS_CODE) => {
    let nextCodeFiles = existingCodeFiles;

    if (codeFiles && typeof codeFiles === 'object') {
        nextCodeFiles = normalizeCodeFiles(codeFiles, getPrimaryCode(existingCodeFiles));
    } else if (typeof code === 'string') {
        const jsFileIndex = existingCodeFiles.findIndex(
            (entry) => entry.type === 'file' && entry.path.toLowerCase().endsWith('.js')
        );

        if (jsFileIndex >= 0) {
            nextCodeFiles = existingCodeFiles.map((entry, index) =>
                index === jsFileIndex ? { ...entry, content: code } : entry
            );
        } else {
            nextCodeFiles = sortCodeFiles([
                ...existingCodeFiles,
                {
                    id: createNodeId(),
                    type: 'file',
                    path: 'script.js',
                    name: 'script.js',
                    content: code
                }
            ]);
        }
    } else {
        return {
            error: 'Provide codeFiles or code to save'
        };
    }

    return {
        codeFiles: sortCodeFiles(nextCodeFiles)
    };
};

const ensureFolderEntries = (codeFiles = []) => {
    const fileEntries = [];
    const folderMap = new Map();

    codeFiles.forEach((entry) => {
        if (!entry || typeof entry.path !== 'string') {
            return;
        }

        const normalizedPath = normalizePath(entry.path);
        if (!normalizedPath) {
            return;
        }

        const segments = normalizedPath.split('/');
        const folderDepth = entry.type === 'folder' ? segments.length : segments.length - 1;
        let currentPath = '';

        for (let index = 0; index < folderDepth; index += 1) {
            currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
            const key = currentPath.toLowerCase();

            if (!folderMap.has(key)) {
                folderMap.set(key, {
                    id: createNodeId(),
                    type: 'folder',
                    path: currentPath,
                    name: getNodeName(currentPath),
                    content: ''
                });
            }
        }

        if (entry.type === 'folder') {
            folderMap.set(normalizedPath.toLowerCase(), {
                ...entry,
                path: normalizedPath,
                name: getNodeName(normalizedPath),
                content: ''
            });
            return;
        }

        fileEntries.push({
            ...entry,
            path: normalizedPath,
            name: getNodeName(normalizedPath)
        });
    });

    return sortCodeFiles(dedupeCodeFiles([
        ...folderMap.values(),
        ...fileEntries
    ]));
};

const getDraftUserSummary = (userValue) => {
    if (userValue && typeof userValue === 'object' && userValue._id) {
        return {
            _id: userValue._id,
            name: userValue.name || 'Developer',
            profilePicture: userValue.profilePicture || ''
        };
    }

    const userId = getUserIdString(userValue);
    return userId
        ? {
            _id: userId,
            name: 'Developer',
            profilePicture: ''
        }
        : null;
};

const findDraftByUserId = (developerDrafts = [], userId) =>
    developerDrafts.find((draft) => getUserIdString(draft.user) === getUserIdString(userId));

const buildDraftSummary = (developerDrafts = []) =>
    developerDrafts
        .map((draft) => {
            const user = getDraftUserSummary(draft.user);
            if (!user) {
                return null;
            }

            const normalizedCodeFiles = normalizeCodeFiles(draft.codeFiles, DEFAULT_JS_CODE);

            return {
                user,
                updatedAt: draft.updatedAt || null,
                fileCount: normalizedCodeFiles.filter((entry) => entry.type === 'file').length
            };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

const compareDraftUpdatedAt = (a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);

const combineWorkspaceDraftCodeFiles = (sharedCodeFiles = [], developerDrafts = []) => {
    const normalizedSharedCodeFiles = normalizeCodeFiles(sharedCodeFiles, getPrimaryCode(sharedCodeFiles));
    const folderMap = new Map();
    const fileVersionsByPath = new Map();

    normalizedSharedCodeFiles.forEach((entry) => {
        const key = entry.path.toLowerCase();

        if (entry.type === 'folder') {
            folderMap.set(key, entry);
            return;
        }

        fileVersionsByPath.set(key, {
            path: entry.path,
            base: entry,
            drafts: []
        });
    });

    developerDrafts.forEach((draft) => {
        const user = getDraftUserSummary(draft.user);
        const userId = getUserIdString(draft.user);

        if (!user || !userId) {
            return;
        }

        const normalizedDraftCodeFiles = normalizeCodeFiles(
            draft.codeFiles,
            getPrimaryCode(normalizedSharedCodeFiles)
        );

        normalizedDraftCodeFiles.forEach((entry) => {
            const key = entry.path.toLowerCase();

            if (entry.type === 'folder') {
                if (!folderMap.has(key)) {
                    folderMap.set(key, entry);
                }
                return;
            }

            if (!fileVersionsByPath.has(key)) {
                fileVersionsByPath.set(key, {
                    path: entry.path,
                    base: null,
                    drafts: []
                });
            }

            fileVersionsByPath.get(key).drafts.push({
                userId,
                userName: user.name,
                updatedAt: draft.updatedAt || null,
                entry
            });
        });
    });

    const mergedFiles = [];
    const mergedContributorIds = new Set();
    const conflicts = [];

    fileVersionsByPath.forEach(({ path, base, drafts }) => {
        if (drafts.length === 0) {
            if (base) {
                mergedFiles.push(base);
            }
            return;
        }

        const meaningfulDrafts = drafts.filter(
            (draft) => !base || (draft.entry.content || '') !== (base.content || '')
        );

        if (meaningfulDrafts.length === 0) {
            if (base) {
                mergedFiles.push(base);
            } else {
                const latestDraft = [...drafts].sort(compareDraftUpdatedAt).pop();
                if (latestDraft) {
                    mergedFiles.push(latestDraft.entry);
                    mergedContributorIds.add(latestDraft.userId);
                }
            }
            return;
        }

        const draftsByContent = new Map();
        meaningfulDrafts.forEach((draft) => {
            const contentKey = draft.entry.content || '';
            const group = draftsByContent.get(contentKey) || [];
            group.push(draft);
            draftsByContent.set(contentKey, group);
        });

        if (draftsByContent.size === 1) {
            const selectedGroup = [...draftsByContent.values()][0].sort(compareDraftUpdatedAt);
            const selectedDraft = selectedGroup[selectedGroup.length - 1];

            if (selectedDraft) {
                mergedFiles.push(selectedDraft.entry);
                selectedGroup.forEach((draft) => mergedContributorIds.add(draft.userId));
            }
            return;
        }

        const contributorSeen = new Set();
        const conflictContributors = meaningfulDrafts
            .sort(compareDraftUpdatedAt)
            .filter((draft) => {
                if (contributorSeen.has(draft.userId)) {
                    return false;
                }

                contributorSeen.add(draft.userId);
                return true;
            })
            .map((draft) => ({
                userId: draft.userId,
                userName: draft.userName
            }));

        conflicts.push({
            path,
            contributors: conflictContributors,
            resolution: base ? 'kept_shared_output' : 'used_latest_draft'
        });

        if (base) {
            mergedFiles.push(base);
            return;
        }

        const latestDraft = [...meaningfulDrafts].sort(compareDraftUpdatedAt).pop();
        if (latestDraft) {
            mergedFiles.push(latestDraft.entry);
            mergedContributorIds.add(latestDraft.userId);
        }
    });

    return {
        codeFiles: ensureFolderEntries([
            ...folderMap.values(),
            ...mergedFiles
        ]),
        conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
        mergedContributorIds: [...mergedContributorIds]
    };
};

const buildDefaultWhiteboardData = () => ({
    kind: DEFAULT_WHITEBOARD_DATA.kind,
    elements: [...DEFAULT_WHITEBOARD_DATA.elements],
    appState: { ...DEFAULT_WHITEBOARD_DATA.appState },
    files: { ...DEFAULT_WHITEBOARD_DATA.files },
    libraryItems: [...DEFAULT_WHITEBOARD_DATA.libraryItems]
});

const isLegacyWhiteboardData = (whiteboardData) =>
    Array.isArray(whiteboardData?.nodes) || Array.isArray(whiteboardData?.links);

const buildPersistedWhiteboardAppState = (appState) => {
    const normalizedAppState = isPlainObject(appState)
        ? cloneSerializable(appState, {})
        : {};
    const persistedAppState = {
        viewBackgroundColor:
            typeof normalizedAppState.viewBackgroundColor === 'string' &&
            normalizedAppState.viewBackgroundColor.trim()
                ? normalizedAppState.viewBackgroundColor.trim()
                : DEFAULT_WHITEBOARD_DATA.appState.viewBackgroundColor
    };

    if (Number.isFinite(normalizedAppState.scrollX)) {
        persistedAppState.scrollX = normalizedAppState.scrollX;
    }

    if (Number.isFinite(normalizedAppState.scrollY)) {
        persistedAppState.scrollY = normalizedAppState.scrollY;
    }

    if (
        isPlainObject(normalizedAppState.zoom) &&
        Number.isFinite(normalizedAppState.zoom.value)
    ) {
        persistedAppState.zoom = { value: normalizedAppState.zoom.value };
    }

    if (Number.isFinite(normalizedAppState.gridSize)) {
        persistedAppState.gridSize = normalizedAppState.gridSize;
    }

    return persistedAppState;
};

const normalizeWhiteboardData = (whiteboardData) => {
    if (isLegacyWhiteboardData(whiteboardData)) {
        return cloneSerializable(whiteboardData, buildDefaultWhiteboardData());
    }

    if (!isPlainObject(whiteboardData)) {
        return buildDefaultWhiteboardData();
    }

    return {
        kind: 'excalidraw',
        elements: Array.isArray(whiteboardData.elements)
            ? cloneSerializable(whiteboardData.elements, [])
            : [],
        appState: buildPersistedWhiteboardAppState(whiteboardData.appState),
        files: isPlainObject(whiteboardData.files)
            ? cloneSerializable(whiteboardData.files, {})
            : {},
        libraryItems: Array.isArray(whiteboardData.libraryItems)
            ? cloneSerializable(whiteboardData.libraryItems, [])
            : []
    };
};

// @desc    Create a new workspace
// @route   POST /api/workspaces
// @access  Private
exports.createWorkspace = async (req, res) => {
    try {
        const { name, description } = req.body;

        const newWorkspace = await Workspace.create({
            name,
            description,
            owner: req.user._id,
            members: [req.user._id] // owner is also a member
        });

        res.status(201).json({
            status: 'success',
            data: {
                workspace: newWorkspace
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get all workspaces the user is a member of
// @route   GET /api/workspaces
// @access  Private
exports.getWorkspaces = async (req, res) => {
    try {
        const workspaces = await Workspace.find({ members: req.user._id })
            .sort({ createdAt: -1 })
            .populate('owner', 'name profilePicture')
            .populate('members', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            results: workspaces.length,
            data: {
                workspaces
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get a single workspace (including its members)
// @route   GET /api/workspaces/:id
// @access  Private
exports.getWorkspaceDetails = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name profilePicture')
            .populate('members', 'name profilePicture')
            .populate('combineDraftManagers', 'name profilePicture')
            .populate('developerDrafts.user', 'name profilePicture')
            .populate('lastCombinedBy', 'name profilePicture');

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'No workspace found with that ID'
            });
        }

        // Check if user is a member
        const isMember = workspace.members.some(
            member => member._id.toString() === req.user._id.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not a member of this workspace'
            });
        }
        const workspacePayload = workspace.toObject();
        const currentUserDraft = findDraftByUserId(workspace.developerDrafts, req.user._id);
        workspacePayload.codeFiles = normalizeCodeFiles(workspacePayload.codeFiles, workspacePayload.code);
        workspacePayload.code = getPrimaryCode(workspacePayload.codeFiles);
        workspacePayload.whiteboardData = normalizeWhiteboardData(workspacePayload.whiteboardData);
        workspacePayload.codeDraftSummary = buildDraftSummary(workspace.developerDrafts);
        workspacePayload.canCurrentUserCombineDrafts = canUserCombineDrafts(workspace, req.user._id);
        workspacePayload.currentUserDraft = currentUserDraft
            ? {
                codeFiles: normalizeCodeFiles(currentUserDraft.codeFiles, workspacePayload.code),
                updatedAt: currentUserDraft.updatedAt || null
            }
            : null;
        delete workspacePayload.developerDrafts;

        res.status(200).json({
            status: 'success',
            data: {
                workspace: workspacePayload
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Add a member to a workspace
// @route   POST /api/workspaces/:id/members
// @access  Private
exports.addMember = async (req, res) => {
    try {
        const { userId } = req.body;
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'No workspace found with that ID'
            });
        }

        // Only owner can add members
        if (workspace.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the workspace owner can add members'
            });
        }

        // Check if user exists
        const userToAdd = await User.findById(userId);
        if (!userToAdd) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        // Check if already a member or already pending
        if (workspace.members.includes(userId)) {
            return res.status(400).json({
                status: 'fail',
                message: 'User is already a member of this workspace'
            });
        }

        if (workspace.pendingMembers.includes(userId)) {
            return res.status(400).json({
                status: 'fail',
                message: 'User has already been invited to this workspace'
            });
        }

        workspace.pendingMembers.push(userId);
        await workspace.save();

        const updatedWorkspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name profilePicture')
            .populate('members', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            data: {
                workspace: updatedWorkspace
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Grant or revoke combine-drafts access for a workspace member
// @route   PATCH /api/workspaces/:id/combine-access
// @access  Private (owner only)
exports.updateWorkspaceCombineAccess = async (req, res) => {
    try {
        const { userId, allowed } = req.body;
        const workspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name profilePicture')
            .populate('members', 'name profilePicture')
            .populate('combineDraftManagers', 'name profilePicture');

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        if (workspace.owner._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the workspace owner can manage combine access'
            });
        }

        if (!userId) {
            return res.status(400).json({
                status: 'fail',
                message: 'Please provide a member userId'
            });
        }

        if (workspace.owner._id.toString() === userId.toString()) {
            return res.status(400).json({
                status: 'fail',
                message: 'The workspace owner already has combine access'
            });
        }

        const isMember = workspace.members.some((member) => member._id.toString() === userId.toString());
        if (!isMember) {
            return res.status(400).json({
                status: 'fail',
                message: 'Combine access can only be granted to workspace members'
            });
        }

        const existingManagerIds = new Set(
            (workspace.combineDraftManagers || []).map((member) => member._id.toString())
        );

        let nextManagerIds = [...existingManagerIds];
        if (allowed) {
            if (!existingManagerIds.has(userId.toString())) {
                nextManagerIds.push(userId.toString());
            }
        } else {
            nextManagerIds = nextManagerIds.filter((managerId) => managerId !== userId.toString());
        }

        workspace.combineDraftManagers = nextManagerIds;
        await workspace.save();

        const refreshedWorkspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name profilePicture')
            .populate('members', 'name profilePicture')
            .populate('combineDraftManagers', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            message: allowed
                ? 'Combine access granted successfully'
                : 'Combine access removed successfully',
            data: {
                combineDraftManagers: refreshedWorkspace.combineDraftManagers || []
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get all workspace invitations for the current user
// @route   GET /api/workspaces/invitations
// @access  Private
exports.getPendingInvitations = async (req, res) => {
    try {
        const invitations = await Workspace.find({ pendingMembers: req.user._id })
            .populate('owner', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            results: invitations.length,
            data: {
                invitations
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Accept a workspace invitation
// @route   POST /api/workspaces/:id/accept
// @access  Private
exports.acceptInvitation = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        // Check if in pending members
        if (!workspace.pendingMembers.includes(req.user._id)) {
            return res.status(400).json({
                status: 'fail',
                message: 'You do not have a pending invitation to this workspace'
            });
        }

        // Remove from pending and add to members
        workspace.pendingMembers = workspace.pendingMembers.filter(
            id => id.toString() !== req.user._id.toString()
        );
        workspace.members.push(req.user._id);

        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Invitation accepted successfully'
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Reject a workspace invitation
// @route   POST /api/workspaces/:id/reject
// @access  Private
exports.rejectInvitation = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        // Check if in pending members
        if (!workspace.pendingMembers.includes(req.user._id)) {
            return res.status(400).json({
                status: 'fail',
                message: 'You do not have a pending invitation to this workspace'
            });
        }

        // Remove from pending
        workspace.pendingMembers = workspace.pendingMembers.filter(
            id => id.toString() !== req.user._id.toString()
        );

        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Invitation rejected successfully'
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Delete a workspace and its associated tasks
// @route   DELETE /api/workspaces/:id
// @access  Private
exports.deleteWorkspace = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        // Only owner can delete the workspace
        if (workspace.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the workspace owner can delete the workspace'
            });
        }

        // Delete all tasks associated with this workspace
        await Task.deleteMany({ workspace: req.params.id });

        // Delete the workspace itself
        await Workspace.findByIdAndDelete(req.params.id);

        res.status(200).json({
            status: 'success',
            message: 'Workspace and associated tasks deleted successfully'
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Save workspace code
// @route   PUT /api/workspaces/:id/code
// @access  Private
exports.saveWorkspaceCode = async (req, res) => {
    try {
        const { code, codeFiles } = req.body;
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        // Check if user is a member or owner
        const isMember = isWorkspaceMember(workspace, req.user._id);
        const isOwner = workspace.owner.toString() === req.user._id.toString();

        if (!isMember && !isOwner) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a member or owner to save code'
            });
        }

        const existingCodeFiles = normalizeCodeFiles(workspace.codeFiles, workspace.code);
        const saveResult = resolveNextCodeFiles({ code, codeFiles }, existingCodeFiles, workspace.code);

        if (saveResult.error) {
            return res.status(400).json({
                status: 'fail',
                message: saveResult.error
            });
        }

        const nextCodeFiles = saveResult.codeFiles;

        workspace.codeFiles = nextCodeFiles;
        workspace.code = getPrimaryCode(nextCodeFiles);
        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Code saved successfully',
            data: {
                codeFiles: nextCodeFiles
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Run workspace code using the selected entry file
// @route   POST /api/workspaces/:id/code/run
// @access  Private
exports.runWorkspaceCode = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        const isMember = isWorkspaceMember(workspace, req.user._id);
        const isOwner = workspace.owner.toString() === req.user._id.toString();

        if (!isMember && !isOwner) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a member or owner to run code'
            });
        }

        const requestedCodeFiles =
            req.body?.codeFiles && typeof req.body.codeFiles === 'object'
                ? req.body.codeFiles
                : workspace.codeFiles;
        const normalizedCodeFiles = ensureFolderEntries(
            normalizeCodeFiles(requestedCodeFiles, workspace.code)
        );
        const entryPath = typeof req.body?.entryPath === 'string' ? req.body.entryPath : '';
        const runtimeScope = typeof req.body?.runtimeScope === 'string' ? req.body.runtimeScope : 'shared';

        const executionResult = await runWorkspaceCodeFiles({
            codeFiles: normalizedCodeFiles,
            entryPath,
            workspaceId: req.params.id,
            runtimeScope
        });

        res.status(200).json({
            status: 'success',
            data: executionResult
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Run a terminal command inside the workspace
// @route   POST /api/workspaces/:id/code/terminal
// @access  Private
exports.runWorkspaceTerminal = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        const isMember = isWorkspaceMember(workspace, req.user._id);
        const isOwner = workspace.owner.toString() === req.user._id.toString();

        if (!isMember && !isOwner) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a member or owner to use the workspace terminal'
            });
        }

        const requestedCodeFiles =
            req.body?.codeFiles && typeof req.body.codeFiles === 'object'
                ? req.body.codeFiles
                : workspace.codeFiles;
        const normalizedCodeFiles = ensureFolderEntries(
            normalizeCodeFiles(requestedCodeFiles, workspace.code)
        );
        const command = typeof req.body?.command === 'string' ? req.body.command : '';
        const cwd = typeof req.body?.cwd === 'string' ? req.body.cwd : '';
        const runtimeScope = typeof req.body?.runtimeScope === 'string' ? req.body.runtimeScope : 'shared';

        const executionResult = await runWorkspaceTerminalCommand({
            workspaceId: req.params.id,
            runtimeScope,
            codeFiles: normalizedCodeFiles,
            command,
            cwd
        });

        res.status(200).json({
            status: 'success',
            data: executionResult
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Save the current user's draft code for a workspace
// @route   PUT /api/workspaces/:id/code/draft
// @access  Private
exports.saveWorkspaceCodeDraft = async (req, res) => {
    try {
        const { code, codeFiles } = req.body;
        const workspace = await Workspace.findById(req.params.id)
            .populate('developerDrafts.user', 'name profilePicture');

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        if (!isWorkspaceMember(workspace, req.user._id)) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a workspace member to save a draft'
            });
        }

        const sharedCodeFiles = normalizeCodeFiles(workspace.codeFiles, workspace.code);
        const existingDraft = findDraftByUserId(workspace.developerDrafts, req.user._id);
        const draftBaseCodeFiles = existingDraft
            ? normalizeCodeFiles(existingDraft.codeFiles, getPrimaryCode(sharedCodeFiles))
            : sharedCodeFiles;
        const saveResult = resolveNextCodeFiles({ code, codeFiles }, draftBaseCodeFiles, workspace.code);

        if (saveResult.error) {
            return res.status(400).json({
                status: 'fail',
                message: saveResult.error
            });
        }

        const normalizedDraftCodeFiles = saveResult.codeFiles;
        const draftIndex = workspace.developerDrafts.findIndex(
            (draft) => getUserIdString(draft.user) === req.user._id.toString()
        );

        if (draftIndex >= 0) {
            workspace.developerDrafts[draftIndex].codeFiles = normalizedDraftCodeFiles;
            workspace.developerDrafts[draftIndex].updatedAt = new Date();
        } else {
            workspace.developerDrafts.push({
                user: req.user._id,
                codeFiles: normalizedDraftCodeFiles,
                updatedAt: new Date()
            });
        }

        workspace.markModified('developerDrafts');
        await workspace.save();

        const refreshedWorkspace = await Workspace.findById(req.params.id)
            .populate('developerDrafts.user', 'name profilePicture');
        const currentUserDraft = findDraftByUserId(refreshedWorkspace.developerDrafts, req.user._id);

        res.status(200).json({
            status: 'success',
            message: 'Draft saved successfully',
            data: {
                currentUserDraft: currentUserDraft
                    ? {
                        codeFiles: normalizeCodeFiles(currentUserDraft.codeFiles, workspace.code),
                        updatedAt: currentUserDraft.updatedAt || null
                    }
                    : null,
                codeDraftSummary: buildDraftSummary(refreshedWorkspace.developerDrafts)
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Discard the current user's saved draft for a workspace
// @route   DELETE /api/workspaces/:id/code/draft
// @access  Private
exports.discardWorkspaceCodeDraft = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id)
            .populate('developerDrafts.user', 'name profilePicture');

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        if (!isWorkspaceMember(workspace, req.user._id)) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a workspace member to discard a draft'
            });
        }

        const nextDrafts = workspace.developerDrafts.filter(
            (draft) => getUserIdString(draft.user) !== req.user._id.toString()
        );

        workspace.developerDrafts = nextDrafts;
        workspace.markModified('developerDrafts');
        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Draft discarded successfully',
            data: {
                codeDraftSummary: buildDraftSummary(nextDrafts),
                currentUserDraft: null
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Combine all saved developer drafts into the shared workspace output
// @route   POST /api/workspaces/:id/code/combine
// @access  Private
exports.combineWorkspaceDrafts = async (req, res) => {
    try {
        const workspace = await Workspace.findById(req.params.id)
            .populate('owner', 'name profilePicture')
            .populate('combineDraftManagers', 'name profilePicture')
            .populate('developerDrafts.user', 'name profilePicture')
            .populate('lastCombinedBy', 'name profilePicture');

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        if (!isWorkspaceMember(workspace, req.user._id)) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a workspace member to combine drafts'
            });
        }

        if (!canUserCombineDrafts(workspace, req.user._id)) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the workspace owner or granted merge leads can combine drafts'
            });
        }

        if (!workspace.developerDrafts.length) {
            return res.status(400).json({
                status: 'fail',
                message: 'There are no saved developer drafts to combine'
            });
        }

        const sharedCodeFiles = normalizeCodeFiles(workspace.codeFiles, workspace.code);
        const combineResult = combineWorkspaceDraftCodeFiles(sharedCodeFiles, workspace.developerDrafts);

        workspace.codeFiles = combineResult.codeFiles;
        workspace.code = getPrimaryCode(combineResult.codeFiles);
        workspace.lastCombinedAt = new Date();
        workspace.lastCombinedBy = req.user._id;
        workspace.developerDrafts = [];
        workspace.markModified('developerDrafts');

        await workspace.save();

        const refreshedWorkspace = await Workspace.findById(req.params.id)
            .populate('developerDrafts.user', 'name profilePicture')
            .populate('lastCombinedBy', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            message:
                combineResult.conflicts.length === 0
                    ? 'All developer drafts were combined into the shared output'
                    : 'Drafts were combined with some same-file conflicts kept for review',
            data: {
                codeFiles: normalizeCodeFiles(refreshedWorkspace.codeFiles, refreshedWorkspace.code),
                code: refreshedWorkspace.code,
                conflicts: combineResult.conflicts,
                codeDraftSummary: buildDraftSummary(refreshedWorkspace.developerDrafts),
                lastCombinedAt: refreshedWorkspace.lastCombinedAt,
                lastCombinedBy: refreshedWorkspace.lastCombinedBy || null
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Save workspace whiteboard data
// @route   PUT /api/workspaces/:id/whiteboard
// @access  Private
exports.saveWorkspaceWhiteboard = async (req, res) => {
    try {
        const { whiteboardData } = req.body;
        const workspace = await Workspace.findById(req.params.id);

        if (!workspace) {
            return res.status(404).json({
                status: 'fail',
                message: 'Workspace not found'
            });
        }

        const isMember = isWorkspaceMember(workspace, req.user._id);
        const isOwner = workspace.owner.toString() === req.user._id.toString();

        if (!isMember && !isOwner) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a member or owner to save whiteboard'
            });
        }

        if (!whiteboardData || typeof whiteboardData !== 'object') {
            return res.status(400).json({
                status: 'fail',
                message: 'Provide valid whiteboardData to save'
            });
        }

        const normalizedWhiteboardData = normalizeWhiteboardData(whiteboardData);
        workspace.whiteboardData = normalizedWhiteboardData;
        workspace.markModified('whiteboardData');
        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Whiteboard saved successfully',
            data: {
                whiteboardData: normalizedWhiteboardData
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};
