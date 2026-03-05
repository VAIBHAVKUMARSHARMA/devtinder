const ProjectIdea = require('../models/ProjectIdea');
const User = require('../models/User');

const getInterestedUserId = (entry) => {
    if (!entry) return null;

    if (entry.user) {
        if (typeof entry.user === 'object' && entry.user._id) {
            return entry.user._id.toString();
        }
        if (entry.user.toString) {
            return entry.user.toString();
        }
    }

    // Handle legacy records where interestedUsers was stored directly as ObjectId
    if (entry._id && !entry.status) {
        return entry._id.toString();
    }

    if (entry.toString) {
        return entry.toString();
    }

    return null;
};

const normalizeInterestedUsersForResponse = (ideaDoc) => {
    const idea = ideaDoc.toObject ? ideaDoc.toObject() : ideaDoc;
    const interestedUsers = Array.isArray(idea.interestedUsers) ? idea.interestedUsers : [];

    idea.interestedUsers = interestedUsers
        .map((entry) => {
            if (!entry) return null;

            // Expected populated shape: { user: { _id, ... }, status }
            if (entry.user && typeof entry.user === 'object' && entry.user._id) {
                return {
                    ...entry,
                    status: entry.status || 'pending'
                };
            }

            // Legacy shape: ObjectId (not populated) or malformed entry
            return null;
        })
        .filter(Boolean);

    return idea;
};

// @desc    Create a new project idea
// @route   POST /api/ideas
// @access  Private
exports.createIdea = async (req, res) => {
    try {
        const { title, description, skills } = req.body;

        const newIdea = await ProjectIdea.create({
            title,
            description,
            skills,
            author: req.user._id
        });

        const populatedIdea = await ProjectIdea.findById(newIdea._id).populate('author', 'name profilePicture bio');

        res.status(201).json({
            status: 'success',
            data: {
                idea: populatedIdea
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get all project ideas
// @route   GET /api/ideas
// @access  Private
exports.getIdeas = async (req, res) => {
    try {
        const ideas = await ProjectIdea.find({ status: 'open' })
            .sort({ createdAt: -1 })
            .populate('author', 'name profilePicture bio headline')
            .populate('interestedUsers.user', 'name profilePicture bio headline githubUrl');
        const normalizedIdeas = ideas.map(normalizeInterestedUsersForResponse);

        res.status(200).json({
            status: 'success',
            results: normalizedIdeas.length,
            data: {
                ideas: normalizedIdeas
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get single project idea
// @route   GET /api/ideas/:id
// @access  Private
exports.getIdeaDetails = async (req, res) => {
    try {
        const idea = await ProjectIdea.findById(req.params.id)
            .populate('author', 'name profilePicture bio headline')
            .populate('interestedUsers.user', 'name profilePicture bio headline githubUrl');

        if (!idea) {
            return res.status(404).json({
                status: 'fail',
                message: 'No idea found with that ID'
            });
        }
        const normalizedIdea = normalizeInterestedUsersForResponse(idea);

        res.status(200).json({
            status: 'success',
            data: {
                idea: normalizedIdea
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Delete a project idea
// @route   DELETE /api/ideas/:id
// @access  Private
exports.deleteIdea = async (req, res) => {
    try {
        const idea = await ProjectIdea.findById(req.params.id);

        if (!idea) {
            return res.status(404).json({
                status: 'fail',
                message: 'No idea found with that ID'
            });
        }

        // Check if user is author
        if (idea.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'You are not authorized to delete this idea'
            });
        }

        await ProjectIdea.findByIdAndDelete(req.params.id);

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

// @desc    Toggle interest in a project idea
// @route   PUT /api/ideas/:id/interest
// @access  Private
exports.toggleInterest = async (req, res) => {
    try {
        const idea = await ProjectIdea.findById(req.params.id);

        if (!idea) {
            return res.status(404).json({
                status: 'fail',
                message: 'No idea found with that ID'
            });
        }

        // Check if user is author
        if (idea.author.toString() === req.user._id.toString()) {
            return res.status(400).json({
                status: 'fail',
                message: 'You cannot be interested in your own idea'
            });
        }

        // Check if user is already interested
        const isInterestedIndex = idea.interestedUsers.findIndex(
            (u) => getInterestedUserId(u) === req.user._id.toString()
        );

        if (isInterestedIndex !== -1) {
            // Remove user if they are already in the array
            idea.interestedUsers.splice(isInterestedIndex, 1);
        } else {
            // Add user with pending status
            idea.interestedUsers.push({ user: req.user._id, status: 'pending' });
        }

        await idea.save();

        res.status(200).json({
            status: 'success',
            data: {
                idea
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Get user's ideas
// @route   GET /api/ideas/my-ideas
// @access  Private
exports.getMyIdeas = async (req, res) => {
    try {
        const ideas = await ProjectIdea.find({ author: req.user._id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            results: ideas.length,
            data: {
                ideas
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};

// @desc    Convert an open project idea to a workspace
// @route   POST /api/ideas/:id/convert
// @access  Private
exports.convertToWorkspace = async (req, res) => {
    try {
        const idea = await ProjectIdea.findById(req.params.id);

        if (!idea) {
            return res.status(404).json({
                status: 'fail',
                message: 'No project idea found with this ID'
            });
        }

        // Only the author can convert the idea
        if (idea.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the author can convert this idea to a workspace'
            });
        }

        // Check if already closed
        if (idea.status === 'closed') {
            return res.status(400).json({
                status: 'fail',
                message: 'This idea has already been closed/converted'
            });
        }

        const Workspace = require('../models/Workspace');

        // Extract only the accepted users to invite to the workspace
        const acceptedUsers = idea.interestedUsers
            .filter(u => u.status === 'accepted')
            .map(u => u.user);

        // Create the new workspace based on the project idea
        const newWorkspace = await Workspace.create({
            name: idea.title,
            description: idea.description,
            owner: idea.author,
            members: [idea.author],
            pendingMembers: acceptedUsers
        });

        // Close the project idea
        idea.status = 'closed';
        await idea.save();

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

// @desc    Update applicant status (accept/reject)
// @route   PUT /api/ideas/:id/applicants/:userId
// @access  Private
exports.updateApplicantStatus = async (req, res) => {
    try {
        const { status } = req.body; // 'accepted', 'rejected', or 'pending'

        if (!['accepted', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({
                status: 'fail',
                message: 'Invalid status'
            });
        }

        const idea = await ProjectIdea.findById(req.params.id);

        if (!idea) {
            return res.status(404).json({
                status: 'fail',
                message: 'No project idea found'
            });
        }

        // Ensure user is the author
        if (idea.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: 'fail',
                message: 'Only the author can accept/reject applicants'
            });
        }

        // Find the applicant
        const applicantIndex = idea.interestedUsers.findIndex(
            (u) => getInterestedUserId(u) === req.params.userId
        );

        if (applicantIndex === -1) {
            return res.status(404).json({
                status: 'fail',
                message: 'Applicant not found in interested list'
            });
        }

        // Update the status
        idea.interestedUsers[applicantIndex].status = status;
        await idea.save();

        res.status(200).json({
            status: 'success',
            data: {
                idea
            }
        });
    } catch (err) {
        res.status(400).json({
            status: 'fail',
            message: err.message
        });
    }
};
