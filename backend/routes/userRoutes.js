const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  getAllUsers,
  getUserById,
  searchUsers
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);

const { upload } = require('../utils/cloudinary');

// Protected routes (authentication required)
router.use(protect); // Apply protection middleware to all routes below this line

router.get('/profile', getProfile);
router.put('/profile', upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'bannerUrl', maxCount: 1 },
  { name: 'projectImages', maxCount: 5 }
]), updateProfile);
router.get('/feed', getAllUsers);
router.get('/search', searchUsers);
router.get('/:id', getUserById);

module.exports = router;
