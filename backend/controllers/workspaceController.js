const Workspace = require('../models/Workspace');
const User = require('../models/User');
const Task = require('../models/Task');

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

        res.status(200).json({
            status: 'success',
            data: {
                workspace
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

        // Import Task model here to avoid circular dependencies if needed, or at the top
        const Task = require('../models/Task');

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
        const { code } = req.body;
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

        workspace.code = code;
        await workspace.save();

        res.status(200).json({
            status: 'success',
            message: 'Code saved successfully'
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};
