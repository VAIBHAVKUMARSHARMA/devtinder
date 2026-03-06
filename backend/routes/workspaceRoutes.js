const express = require('express');
const {
    createWorkspace,
    getWorkspaces,
    getWorkspaceDetails,
    addMember,
    getPendingInvitations,
    acceptInvitation,
    rejectInvitation,
    deleteWorkspace,
    saveWorkspaceCode,
    saveWorkspaceWhiteboard
} = require('../controllers/workspaceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // All workspace routes require authentication

router.route('/')
    .get(getWorkspaces)
    .post(createWorkspace);

router.route('/invitations')
    .get(getPendingInvitations);

router.route('/:id')
    .get(getWorkspaceDetails)
    .delete(deleteWorkspace);

router.route('/:id/members')
    .post(addMember);

router.route('/:id/accept')
    .post(acceptInvitation);

router.route('/:id/reject')
    .post(rejectInvitation);

router.route('/:id/code')
    .put(saveWorkspaceCode);

router.route('/:id/whiteboard')
    .put(saveWorkspaceWhiteboard);

module.exports = router;
