const express = require('express');

const router = express.Router();

const { verifyToken } = require('../middleware/authMiddleware');

const { addRemark, editRemark, listRemarks } = require('../controllers/remarkController');


router.post('/add', verifyToken, addRemark);

router.put('/edit', verifyToken, editRemark);

router.get('/list', verifyToken, listRemarks);


module.exports = router;

