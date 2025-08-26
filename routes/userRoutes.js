const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/users/' }); // or configure diskStorage



router.get('/admins',verifyToken, adminController.getAdminUsers);
router.get('/group-by-role',verifyToken, adminController.getUsersGroupedByRole);
router.get('/getuser/:role', adminController.getUsersByRole);
// router.post('/register',userController.registerUser);
router.post('/register', upload.single('photo'), userController.registerUser);

router.post('/login',userController.sendLoginOtp);
router.post('/login/verify-otp',userController.verifyLoginOtp);
router.post('/forgotPassword',userController.sendForgotOtp);
router.post('/forgotPassword/verify-otp',userController.verifyForgotOtp);
router.post('/forgotPassword/set-password',userController.resetPassword);
router.get('/getProfileByRole',verifyToken,userController.getProfileByRole)


module.exports = router;