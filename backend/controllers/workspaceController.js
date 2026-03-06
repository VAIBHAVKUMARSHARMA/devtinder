const Workspace = require('../models/Workspace');
const User = require('../models/User');
const Task = require('../models/Task');

const DEFAULT_JS_CODE = '// Write your code here...\n\nconsole.log("Welcome to your Collaborative Workspace!");\n';
const DEFAULT_HTML_CODE = `<main class="app">
  <h1>DevTinder Workspace</h1>
  <p>Edit HTML, CSS, and JS, then click Run to preview.</p>
  <button id="demoButton">Click me</button>
</main>`;
const DEFAULT_CSS_CODE = `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 2rem;
  background: #f4f7fb;
}

.app {
  max-width: 560px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);
}

h1 {
  margin-top: 0;
  color: #0f172a;
}

button {
  margin-top: 1rem;
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}`;
const DEFAULT_WHITEBOARD_DATA = {
    nodes: [
        {
            id: 'node_idea',
            title: 'Idea',
            description: 'Define problem and scope',
            color: '#2563eb',
            x: 140,
            y: 130
        },
        {
            id: 'node_build',
            title: 'Build',
            description: 'Implement core features',
            color: '#16a34a',
            x: 460,
            y: 130
        },
        {
            id: 'node_review',
            title: 'Review',
            description: 'Test, QA and feedback loop',
            color: '#ea580c',
            x: 780,
            y: 130
        }
    ],
    links: [
        {
            id: 'link_idea_build',
            from: 'node_idea',
            to: 'node_build'
        },
        {
            id: 'link_build_review',
            from: 'node_build',
            to: 'node_review'
        }
    ]
};

const createNodeId = () => `node_${Math.random().toString(36).slice(2, 10)}`;
const createWhiteboardId = (prefix = 'wb') => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

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

const buildDefaultCodeFiles = (fallbackJs = DEFAULT_JS_CODE) => ([
    {
        id: 'file_index_html',
        type: 'file',
        path: 'index.html',
        name: 'index.html',
        content: DEFAULT_HTML_CODE
    },
    {
        id: 'file_styles_css',
        type: 'file',
        path: 'styles.css',
        name: 'styles.css',
        content: DEFAULT_CSS_CODE
    },
    {
        id: 'file_script_js',
        type: 'file',
        path: 'script.js',
        name: 'script.js',
        content:
            typeof fallbackJs === 'string' && fallbackJs.length > 0
                ? fallbackJs
                : DEFAULT_JS_CODE
    }
]);

const normalizeArrayCodeFiles = (codeFiles = []) => {
    const normalized = codeFiles
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const type = entry.type === 'folder' ? 'folder' : 'file';
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
        return sortCodeFiles(
            buildDefaultCodeFiles(
                typeof codeFiles?.js === 'string' ? codeFiles.js : fallbackJs
            ).map((entry) => {
                if (entry.path === 'index.html' && typeof codeFiles?.html === 'string') {
                    return { ...entry, content: codeFiles.html };
                }
                if (entry.path === 'styles.css' && typeof codeFiles?.css === 'string') {
                    return { ...entry, content: codeFiles.css };
                }
                return entry;
            })
        );
    }

    const objectValues = Object.values(codeFiles).filter(
        (value) => value && typeof value === 'object' && typeof value.path === 'string'
    );

    if (objectValues.length > 0) {
        return normalizeArrayCodeFiles(objectValues);
    }

    return sortCodeFiles(buildDefaultCodeFiles(fallbackJs));
};

const normalizeCodeFiles = (codeFiles, fallbackJs = DEFAULT_JS_CODE) => {
    if (Array.isArray(codeFiles)) {
        const normalized = normalizeArrayCodeFiles(codeFiles);
        return normalized.length > 0 ? normalized : sortCodeFiles(buildDefaultCodeFiles(fallbackJs));
    }

    if (codeFiles && typeof codeFiles === 'object') {
        return normalizeLegacyObjectCodeFiles(codeFiles, fallbackJs);
    }

    return sortCodeFiles(buildDefaultCodeFiles(fallbackJs));
};

const getPrimaryCode = (codeFiles = []) => {
    const jsFile = codeFiles.find(
        (entry) =>
            entry.type === 'file' &&
            typeof entry.path === 'string' &&
            entry.path.toLowerCase().endsWith('.js')
    );

    if (jsFile) {
        return jsFile.content || DEFAULT_JS_CODE;
    }

    const firstFile = codeFiles.find((entry) => entry.type === 'file');
    return firstFile?.content || DEFAULT_JS_CODE;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeNodeColor = (color) => {
    if (typeof color !== 'string') {
        return '#2563eb';
    }

    const trimmed = color.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : '#2563eb';
};

const buildDefaultWhiteboardData = () => ({
    nodes: DEFAULT_WHITEBOARD_DATA.nodes.map((node) => ({ ...node })),
    links: DEFAULT_WHITEBOARD_DATA.links.map((link) => ({ ...link }))
});

const normalizeWhiteboardData = (whiteboardData) => {
    const candidateNodes = Array.isArray(whiteboardData?.nodes) ? whiteboardData.nodes : [];
    const normalizedNodes = candidateNodes
        .map((node) => {
            if (!node || typeof node !== 'object') {
                return null;
            }

            const id = typeof node.id === 'string' && node.id.trim()
                ? node.id
                : createWhiteboardId('node');
            const title = typeof node.title === 'string' && node.title.trim()
                ? node.title.trim().slice(0, 120)
                : 'Untitled Step';
            const description = typeof node.description === 'string'
                ? node.description.slice(0, 400)
                : '';
            const x = Number.isFinite(Number(node.x)) ? clamp(Number(node.x), 0, 5000) : 120;
            const y = Number.isFinite(Number(node.y)) ? clamp(Number(node.y), 0, 5000) : 120;

            return {
                id,
                title,
                description,
                color: normalizeNodeColor(node.color),
                x,
                y
            };
        })
        .filter(Boolean);

    const nodes = normalizedNodes.length > 0
        ? normalizedNodes
        : buildDefaultWhiteboardData().nodes;
    const nodeIds = new Set(nodes.map((node) => node.id));

    const candidateLinks = Array.isArray(whiteboardData?.links) ? whiteboardData.links : [];
    const linkSeen = new Set();
    const links = candidateLinks
        .map((link) => {
            if (!link || typeof link !== 'object') {
                return null;
            }

            const from = typeof link.from === 'string' ? link.from : '';
            const to = typeof link.to === 'string' ? link.to : '';

            if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) {
                return null;
            }

            const dedupeKey = `${from}->${to}`;
            if (linkSeen.has(dedupeKey)) {
                return null;
            }
            linkSeen.add(dedupeKey);

            return {
                id: typeof link.id === 'string' && link.id.trim()
                    ? link.id
                    : createWhiteboardId('link'),
                from,
                to
            };
        })
        .filter(Boolean);

    return {
        nodes,
        links
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
            .populate('members', 'name profilePicture');

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
        workspacePayload.codeFiles = normalizeCodeFiles(workspacePayload.codeFiles, workspacePayload.code);
        workspacePayload.code = getPrimaryCode(workspacePayload.codeFiles);
        workspacePayload.whiteboardData = normalizeWhiteboardData(workspacePayload.whiteboardData);

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
        await Task.deleteMany({ workspaceId: req.params.id });

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
        const isMember = workspace.members.includes(req.user._id);
        const isOwner = workspace.owner.toString() === req.user._id.toString();

        if (!isMember && !isOwner) {
            return res.status(403).json({
                status: 'fail',
                message: 'You must be a member or owner to save code'
            });
        }

        const existingCodeFiles = normalizeCodeFiles(workspace.codeFiles, workspace.code);
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
            return res.status(400).json({
                status: 'fail',
                message: 'Provide codeFiles or code to save'
            });
        }

        if (!nextCodeFiles.some((entry) => entry.type === 'file')) {
            nextCodeFiles = sortCodeFiles(buildDefaultCodeFiles(workspace.code));
        }

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

        const isMember = workspace.members.includes(req.user._id);
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
