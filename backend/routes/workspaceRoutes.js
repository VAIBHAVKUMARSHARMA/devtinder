const express = require('express');
const {
    createWorkspace,
    getWorkspaces,
    getWorkspaceDetails,
    addMember,
    updateWorkspaceCombineAccess,
    getPendingInvitations,
    acceptInvitation,
    rejectInvitation,
    deleteWorkspace,
    saveWorkspaceCode,
    saveWorkspaceCodeDraft,
    discardWorkspaceCodeDraft,
    combineWorkspaceDrafts,
    runWorkspaceCode,
    runWorkspaceTerminal,
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

router.route('/:id/combine-access')
    .patch(updateWorkspaceCombineAccess);

router.route('/:id/accept')
    .post(acceptInvitation);

router.route('/:id/reject')
    .post(rejectInvitation);

router.route('/:id/code/draft')
    .put(saveWorkspaceCodeDraft)
    .delete(discardWorkspaceCodeDraft);

router.route('/:id/code/combine')
    .post(combineWorkspaceDrafts);

router.route('/:id/code/run')
    .post(runWorkspaceCode);

router.route('/:id/code/terminal')
    .post(runWorkspaceTerminal);

router.route('/:id/code')
    .put(saveWorkspaceCode);

router.route('/:id/whiteboard')
    .put(saveWorkspaceWhiteboard);

module.exports = router;
