const express = require('express');
const {
  register,
  login,
  loginWithGoogle,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getAdminProfile,
  editAdminProfile,
  getProfile,
  uploadProfileImage,
  changePassword,
  userSummary,
  getRoleWiseUSer,
  deleteUser
} = require('../controllers/authController');

const { verifyToken } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Photo upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/users');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage });

// Updated register route with photo upload
router.post('/register', upload.single('photo'), register);

router.post('/login', login);
router.post('/loginwithgoogle', loginWithGoogle);
router.post('/forgotpassword', forgotPassword);
router.post('/verifyOtp', verifyOtp);
router.post('/resetPassword', resetPassword);
router.get('/admin/profile', verifyToken, getAdminProfile);
router.put('/admin/profile/edit', verifyToken, upload.single('photo'), editAdminProfile);
router.get('/profile', verifyToken, getProfile);
router.post('/profile/upload', verifyToken, upload.single('image'), uploadProfileImage);
router.post('/profile/change-password', verifyToken, changePassword);
router.get('/userSummary',userSummary);
router.get('/getRolesUser',getRoleWiseUSer);
router.delete('/users/:id',deleteUser);



module.exports = router;
