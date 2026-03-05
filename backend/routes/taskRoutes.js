const express = require('express');
const {
    createTask,
    getWorkspaceTasks,
    updateTask,
    deleteTask
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
    .post(createTask);

router.route('/workspace/:workspaceId')
    .get(getWorkspaceTasks);

router.route('/:id')
    .put(updateTask)
    .delete(deleteTask);

module.exports = router;
