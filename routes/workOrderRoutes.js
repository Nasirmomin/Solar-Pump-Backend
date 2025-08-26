const express = require('express');
const router = express.Router();
const { createWorkOrder, listWorkOrders, getWorkOrder, updateWorkOrder, deleteWorkOrder,getFactoryDashboard,submitManufacturedUnits,submitPdiVerification,submitJsrUnits, submitJsrStage,getAssignedWorkOrdersForDropdown,getAssignedWorkOrdersForWarehouse,submitWarehouseUnits,assignUnitsToCP,getAssignedWorkOrdersForCP,submitCPUnits ,assignUnitsToFarmer,getJSRDashboardStats,getMyPumps,submitDefectReport,getPumpProgress 
,completeInspection,
uploadInspectionPhotos,
submitInspectionUnits,
getInspectionProgress,
getInspectionDashboard,
getWorkOrderSummary,
getWorkOrderList,
updateFactoryStatus,
getWorkOrderProgress,
getAllJSRDashboard,
saveJSRUnits,
updateJSRStage,
dispatchToWarehouse

  } = require('../controllers/workOrderController');
const { verifyToken } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // make sure this folder exists
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});



// Upload instance
// const upload = multer({ storage });

router.post('/create', verifyToken, upload.single('file'), createWorkOrder);
router.post('/list', verifyToken, listWorkOrders);
router.get('/getworkorder/:id', verifyToken, getWorkOrder);
router.post('/updateworkorder/:id', verifyToken, updateWorkOrder);
router.delete('/deleteworkorder/:id', verifyToken, deleteWorkOrder);
// router.post('/getDashboardStats')
router.get('/factory/dashboard', verifyToken, getFactoryDashboard);
router.post('/factory/units',verifyToken,submitManufacturedUnits);
router.post('/factory/pdi', verifyToken, submitPdiVerification);
// router.get('/progress/:id', verifyToken, getProgress);
router.post('/jsr/submit-units',verifyToken,submitJsrUnits);
router.post(
  '/jsr/submit-stage',
  verifyToken,
  upload.fields([
    { name: 'installation_photo', maxCount: 1 },
    { name: 'site_photo', maxCount: 1 }
  ]),
  submitJsrStage
);
router.get('/jsr/Dashboard',verifyToken,getJSRDashboardStats);
// router.post('/jsr/dispatch',verifyToken,dispatchToWarehouse);
router.get('/getAssignedWorkOrdersForDropdown',verifyToken,getAssignedWorkOrdersForDropdown);
// router.post('/cp/getAssignedWorkOrdersForWarehouse ',verifyToken,getAssignedWorkOrdersForWarehouse);
// router.post('/cp/submitWarehouseUnits ',verifyToken,submitWarehouseUnits);
// router.post('/cp/assignUnitsToCP',verifyToken,assignUnitsToCP);
router.get('/warehouse/assigned-orders', verifyToken, getAssignedWorkOrdersForWarehouse);
router.post('/warehouse/units',verifyToken,submitWarehouseUnits);
router.post('/warehouse/assign-to-cp',verifyToken,assignUnitsToCP);
router.get('/cp/work-orders',verifyToken,getAssignedWorkOrdersForCP);
router.post('/cp/submit-units',verifyToken,submitCPUnits);
router.post('/cp/assignUnitsToFarmer',verifyToken,assignUnitsToFarmer);
router.get('/farmer/my-pumps', verifyToken, getMyPumps);
router.post('/farmer/report-defect', verifyToken, upload.fields([
    { name: 'photo_1', maxCount: 1 },
    { name: 'photo_2', maxCount: 1 },
    { name: 'photo_3', maxCount: 1 },
  ]), submitDefectReport);
router.get('/farmer/pump-progress/:work_order_id', verifyToken, getPumpProgress);
router.post(
  "/inspection/start",
  verifyToken,
  submitInspectionUnits
);

router.post(
  "/inspection/details",
  verifyToken,
  upload.any(),
  uploadInspectionPhotos
);

router.post(
  "/inspection/complete",
  verifyToken,
 completeInspection
);


router.get('/inspection-progress/:work_order_id', verifyToken, getInspectionProgress);

router.get('/inspection/dashboard', verifyToken, getInspectionDashboard);

router.get('/summary', getWorkOrderSummary);

router.get('/admin/getWorkOrders',getWorkOrderList);

router.post('/factory/update-manufacturing-status',verifyToken,updateFactoryStatus);

router.get('/progress/:orderId',getWorkOrderProgress);
router.get('/dashboard/jsr', getAllJSRDashboard);

router.post("/jsr/units",       saveJSRUnits);
router.post("/updateJSRStage",       updateJSRStage);
router.post("/jsr/dispatch",    dispatchToWarehouse);




// router.post




module.exports = router;