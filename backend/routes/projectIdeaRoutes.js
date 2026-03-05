const express = require('express');
const {
    createIdea,
    getIdeas,
    getIdeaDetails,
    deleteIdea,
    toggleInterest,
    getMyIdeas,
    convertToWorkspace,
    updateApplicantStatus
} = require('../controllers/projectIdeaController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getIdeas)
    .post(createIdea);

router.route('/my-ideas')
    .get(getMyIdeas);

router.route('/:id')
    .get(getIdeaDetails)
    .delete(deleteIdea);

router.route('/:id/interest')
    .put(toggleInterest);

router.route('/:id/convert')
    .post(convertToWorkspace);

router.route('/:id/applicants/:userId')
    .put(updateApplicantStatus);

module.exports = router;
