const Task = require('../models/Task');
const Workspace = require('../models/Workspace');

// Middleware helper to check workspace membership
const checkWorkspaceMembership = async (workspaceId, userId) => {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return false;
    return workspace.members.some(id => id.toString() === userId.toString());
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res) => {
    try {
        const { title, description, workspaceId, assigneeId, status } = req.body;

        // Check if user is member of workspace
        const isMember = await checkWorkspaceMembership(workspaceId, req.user._id);
        if (!isMember) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not a member of this workspace'
            });
        }

        const newTask = await Task.create({
            title,
            description,
            status: status || 'Todo',
            workspace: workspaceId,
            assignee: assigneeId || null,
            createdBy: req.user._id
        });

        const populatedTask = await Task.findById(newTask._id)
            .populate('assignee', 'name profilePicture')
            .populate('createdBy', 'name profilePicture');

        res.status(201).json({
            status: 'success',
            data: {
                task: populatedTask
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get all tasks for a workspace
// @route   GET /api/workspaces/:workspaceId/tasks
// @access  Private
exports.getWorkspaceTasks = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Check if user is member of workspace
        const isMember = await checkWorkspaceMembership(workspaceId, req.user._id);
        if (!isMember) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not a member of this workspace'
            });
        }

        const tasks = await Task.find({ workspace: workspaceId })
            .sort({ createdAt: -1 })
            .populate('assignee', 'name profilePicture')
            .populate('createdBy', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            results: tasks.length,
            data: {
                tasks
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res) => {
    try {
        const { title, description, status, assigneeId } = req.body;
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({
                status: 'fail',
                message: 'No task found with that ID'
            });
        }

        // Check if user is member of workspace
        const isMember = await checkWorkspaceMembership(task.workspace, req.user._id);
        if (!isMember) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not authorized to edit tasks in this workspace'
            });
        }

        if (title) task.title = title;
        if (description !== undefined) task.description = description;
        if (status) task.status = status;
        if (assigneeId !== undefined) task.assignee = assigneeId;

        await task.save();

        const updatedTask = await Task.findById(req.params.id)
            .populate('assignee', 'name profilePicture')
            .populate('createdBy', 'name profilePicture');

        res.status(200).json({
            status: 'success',
            data: {
                task: updatedTask
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);

        if (!task) {
            return res.status(404).json({
                status: 'fail',
                message: 'No task found with that ID'
            });
        }

        // Check if user is member of workspace
        const isMember = await checkWorkspaceMembership(task.workspace, req.user._id);
        if (!isMember) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not authorized to delete tasks in this workspace'
            });
        }

        await Task.findByIdAndDelete(req.params.id);

        res.status(204).json({
            status: 'success',
            data: null
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};
