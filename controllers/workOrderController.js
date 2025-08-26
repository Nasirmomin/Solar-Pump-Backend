// const pool = require("../db");
const db = require('../config/db');
const pool = require("../config/db");
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Configure storage as needed


exports.saveJSRUnits = async (req, res) => {
  try {
    let { work_order_id, hp_3, hp_5, hp_7_5, total_quantity } = req.body;

    // If work_order_id is an order_number (e.g., 'WO02'), convert it to the actual id
    if (isNaN(work_order_id)) {
      const [order] = await db.query(
        `SELECT id FROM work_orders WHERE order_number = ?`,
        [work_order_id]
      );
      if (!order.length) {
        return res.status(404).json({ error: "Work order not found" });
      }
      work_order_id = order[0].id;
    }

    await db.query(
      `INSERT INTO jsr_verification (work_order_id, hp_3, hp_5, hp_7_5, total_quantity, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')
       ON DUPLICATE KEY UPDATE hp_3=?, hp_5=?, hp_7_5=?, total_quantity=?`,
      [work_order_id, hp_3, hp_5, hp_7_5, total_quantity, hp_3, hp_5, hp_7_5, total_quantity]
    );

    res.status(200).json({ message: "JSR Units saved successfully.", total_quantity });
  } catch (error) {
    console.error("saveJSRUnits error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



exports.updateJSRStage = [
  upload.fields([
    { name: 'installation_photo', maxCount: 1 },
    { name: 'site_photo', maxCount: 1 },
    { name: 'installation_site_photo', maxCount: 1 },
    { name: 'lineman_installation_set', maxCount: 1 },
    { name: 'setup_close_photo', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      let { work_order_id, status, lineman_name, farmername, state, district, taluka, village } = req.body;
      const installation_photo = req.files['installation_photo'] ? req.files['installation_photo'][0].path : null;
      const site_photo = req.files['site_photo'] ? req.files['site_photo'][0].path : null;
      const installation_site_photo = req.files['installation_site_photo'] ? req.files['installation_site_photo'][0].path : null;
      const lineman_installation_set = req.files['lineman_installation_set'] ? req.files['lineman_installation_set'][0].path : null;
      const setup_close_photo = req.files['setup_close_photo'] ? req.files['setup_close_photo'][0].path : null;

      // Convert title (e.g., 'WO02') to id if necessary
      if (isNaN(work_order_id)) {
        const [order] = await db.query(
          `SELECT id FROM work_orders WHERE title = ?`,
          [work_order_id]
        );
        if (!order.length) {
          return res.status(404).json({ error: "Work order not found" });
        }
        work_order_id = order[0].id;
      } else {
        work_order_id = parseInt(work_order_id);
      }

      if (!["InProgress", "Verified"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const verified_at = status === "Verified" ? new Date() : null;

      await db.query(
        `UPDATE jsr_verification
         SET status = ?, verified_at = ?, lineman_name = ?, installation_photo = ?, site_photo = ?, farmername = ?, state = ?, district = ?, taluka = ?, village = ?, installation_site_photo = ?, lineman_installation_set = ?, setup_close_photo = ?
         WHERE work_order_id = ?`,
        [status, verified_at, lineman_name, installation_photo, site_photo, farmername, state, district, taluka, village, installation_site_photo, lineman_installation_set, setup_close_photo, work_order_id]
      );

      res.status(200).json({ message: `JSR ${status} successfully.` });
    } catch (error) {
      console.error("updateJSRStage error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
];

exports.dispatchToWarehouse = async (req, res) => {
  const { work_order_id, warehouse_location, units_3hp = 0, units_5hp = 0, units_7_5hp = 0 } = req.body;
  if (!work_order_id || !warehouse_location) {
    return res.status(400).json({ success: false, message: "work_order_id and warehouse_location are required" });
  }
  try {
    // Convert title (e.g., 'WO02') to id if necessary
    let db_work_order_id;
    if (isNaN(work_order_id)) {
      const [order] = await db.query(
        `SELECT id FROM work_orders WHERE title = ?`,
        [work_order_id]
      );
      if (!order.length) {
        return res.status(404).json({ success: false, message: "Work order not found" });
      }
      db_work_order_id = order[0].id;
    } else {
      db_work_order_id = parseInt(work_order_id);
    }

    // Validate the work_order_id exists
    const [existingOrder] = await db.query(
      `SELECT id FROM work_orders WHERE id = ?`,
      [db_work_order_id]
    );
    if (!existingOrder.length) {
      return res.status(404).json({ success: false, message: "Invalid work_order_id" });
    }

    // Insert dispatch record
    await db.query(
      `INSERT INTO jsr_dispatch_to_warehouse (
         work_order_id, warehouse_location, units_3hp, units_5hp, units_7_5hp, dispatched, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         warehouse_location = VALUES(warehouse_location),
         units_3hp          = VALUES(units_3hp),
         units_5hp          = VALUES(units_5hp),
         units_7_5hp        = VALUES(units_7_5hp),
         dispatched         = 1,
         updated_at         = NOW()`,
      [db_work_order_id, warehouse_location, units_3hp, units_5hp, units_7_5hp]
    );

    // Assign units to respective JSRs (simplified assumption of one JSR per warehouse)
    const [warehouseJSRs] = await db.query(
      `SELECT jsr_id FROM warehouse_jsr_mapping WHERE warehouse_location = ?`,
      [warehouse_location]
    );

    if (warehouseJSRs.length === 0) {
      return res.status(404).json({ success: false, message: "No JSR found for the given warehouse location" });
    }

    const jsrId = warehouseJSRs[0].jsr_id;

    // Assign 3HP units to 3HP JSR
    if (units_3hp > 0) {
      await db.query(
        `INSERT INTO jsr_verification (work_order_id, jsr_id, hp_3, total_quantity, status)
         VALUES (?, ?, ?, ?, 'Assigned')
         ON DUPLICATE KEY UPDATE hp_3 = VALUES(hp_3), total_quantity = VALUES(total_quantity)`,
        [db_work_order_id, jsrId, units_3hp, units_3hp]
      );
    }

    // Assign 5HP units to 5HP JSR
    if (units_5hp > 0) {
      await db.query(
        `INSERT INTO jsr_verification (work_order_id, jsr_id, hp_5, total_quantity, status)
         VALUES (?, ?, ?, ?, 'Assigned')
         ON DUPLICATE KEY UPDATE hp_5 = VALUES(hp_5), total_quantity = VALUES(total_quantity)`,
        [db_work_order_id, jsrId, units_5hp, units_5hp]
      );
    }

    // Assign 7.5HP units to 7.5HP JSR
    if (units_7_5hp > 0) {
      await db.query(
        `INSERT INTO jsr_verification (work_order_id, jsr_id, hp_7_5, total_quantity, status)
         VALUES (?, ?, ?, ?, 'Assigned')
         ON DUPLICATE KEY UPDATE hp_7_5 = VALUES(hp_7_5), total_quantity = VALUES(total_quantity)`,
        [db_work_order_id, jsrId, units_7_5hp, units_7_5hp]
      );
    }

    res.json({ success: true, message: "Work order successfully dispatched to warehouse and assigned to JSRs" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};



exports.getFactoryDashboard = async (req, res) => {
     const connection = await db.getConnection();


  try {
    const [logs] = await connection.query(
      `
      SELECT 
        wsl.id AS log_id,
        wsl.work_order_id,
        wsl.status AS stage_status,
        wsl.started_at,
        w.title AS work_order_title,
        w.quantity_3hp,
        w.quantity_5hp,
        w.quantity_7_5hp,
        w.total_quantity,
        w.start_date,
        w.farmer_list_file,
        w.created_at,
        w.status AS work_order_status
      FROM workorder_stage_logs wsl
      INNER JOIN work_orders w ON w.id = wsl.work_order_id
      WHERE wsl.role = 'Factory' AND wsl.status = 'Pending'
      ORDER BY wsl.started_at DESC
      LIMIT 10
      `
    );

    const BASE_URL = "https://13.235.186.82:5000/uploads/";

    const data = logs.map((row) => ({
      work_order_id: row.work_order_id,
      title: row.work_order_title,
      quantity_3hp: row.quantity_3hp,
      quantity_5hp: row.quantity_5hp,
      quantity_7_5hp: row.quantity_7_5hp,
      total_quantity: row.total_quantity,
      start_date: row.start_date,
      created_at: row.created_at,
      stage_status: row.stage_status,
      work_order_status: row.work_order_status,
      farmer_list_file: row.farmer_list_file
        ? BASE_URL + row.farmer_list_file
        : null,
      timeline: row.started_at,
    }));

    return res.status(200).json({
      success: true,
      message: "Factory dashboard fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error in getFactoryDashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};








exports.getAssignedWorkOrdersForDropdown = async (req, res) => {
  try {
    const userId = req.user.id;

    const connection = await db.getConnection();

    const [orders] = await connection.query(`
      SELECT 
        w.id AS work_order_id,
        w.order_number
      FROM work_orders w
      JOIN work_order_stakeholders ws ON w.id = ws.work_order_id
      WHERE ws.factory_contact = ?
      ORDER BY w.created_at DESC
    `, [userId]);

    connection.release();

    res.status(200).json({ workOrders: orders });
  } catch (err) {
    console.error("❌ Error in getAssignedWorkOrdersForDropdown:", err);
    res.status(500).json({ error: "Failed to fetch assigned work orders" });
  }
};

exports.getAssignedWorkOrdersForWarehouse = async (req, res) => {
  const warehouseUserId = req.user.id;

  try {
    // Fetch all assigned work orders
    const [orders] = await db.query(`
      SELECT 
        w.id AS work_order_id, 
        w.order_number,
        w.total AS total_units,
        w.hp_3,
        w.hp_5,
        w.hp_7_5
      FROM work_orders w
      JOIN work_order_stakeholders ws ON ws.work_order_id = w.id
      WHERE ws.warehouse_contact = ?
      ORDER BY w.created_at DESC
    `, [warehouseUserId]);

    const totalWorkOrders = orders.length;
    const totalUnits = orders.reduce((sum, o) => sum + (o.total_units || 0), 0);
    const currentOrder = orders[0] || {};

    // Get warehouse received units
    const [warehouseCounts] = await db.query(`
      SELECT 
        work_order_id,
        SUM(hp_3) AS hp_3_received,
        SUM(hp_5) AS hp_5_received,
        SUM(hp_7_5) AS hp_7_5_received,
        SUM(hp_3 + hp_5 + hp_7_5) AS total_received
      FROM warehouse_units
      WHERE created_by = ?
      GROUP BY work_order_id
    `, [warehouseUserId]);

    // Map work_order_id => received data
    const receivedMap = {};
    warehouseCounts.forEach(row => {
      receivedMap[row.work_order_id] = row;
    });

    // Merge received counts into each order
    const enrichedOrders = orders.map(order => {
      const received = receivedMap[order.work_order_id] || {};
      return {
        ...order,
        hp_3_received: received.hp_3_received || 0,
        hp_5_received: received.hp_5_received || 0,
        hp_7_5_received: received.hp_7_5_received || 0,
        total_received: received.total_received || 0
      };
    });

    const currentReceived = receivedMap[currentOrder.work_order_id]?.total_received || 0;
    const currentTotal = currentOrder.total_units || 0;

    res.status(200).json({
      total_work_orders: totalWorkOrders,
      current_order_id: currentOrder.order_number,
      total_units: totalUnits,
      warehouse_units: {
        received: currentReceived,
        total: currentTotal
      },
      orders: enrichedOrders
    });

  } catch (err) {
    console.error("❌ getAssignedWorkOrdersForWarehouse error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};


exports.updateFactoryStatus = async (req, res) => {
  const {
    work_order_id,
    factory_manufactured,
    pdi_verified,
    taluka,
    village,
    district
  } = req.body;

  try {

    const user_id = req.user?.id;

    console.log('Logged in user ID:', user_id);


    if (!work_order_id || !factory_manufactured || !pdi_verified || !taluka || !village || !district) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const {
      quantity_3hp: f_hp_3 = 0,
      quantity_5hp: f_hp_5 = 0,
      quantity_7_5hp: f_hp_7_5 = 0,
      total_quantity: f_total_quantity = 0
    } = factory_manufactured || {};

    const {
      quantity_3hp: p_hp_3 = 0,
      quantity_5hp: p_hp_5 = 0,
      quantity_7_5hp: p_hp_7_5 = 0,
      total_quantity: p_total_quantity = 0
    } = pdi_verified || {};

    // Save factory manufacturing data
    await db.query(`
      INSERT INTO factory_manufacturing (work_order_id, hp_3, hp_5, hp_7_5, total_quantity)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        hp_3 = VALUES(hp_3),
        hp_5 = VALUES(hp_5),
        hp_7_5 = VALUES(hp_7_5),
        total_quantity = VALUES(total_quantity),
        updated_at = CURRENT_TIMESTAMP
    `, [work_order_id, f_hp_3, f_hp_5, f_hp_7_5, f_total_quantity]);

    // Save PDI data
    await db.query(`
  INSERT INTO pdi_verification (work_order_id, hp_3, hp_5, hp_7_5, verified_by)
  VALUES (?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    hp_3 = VALUES(hp_3),
    hp_5 = VALUES(hp_5),
    hp_7_5 = VALUES(hp_7_5),
    verified_by = VALUES(verified_by)
`, [
  work_order_id,
  pdi_verified.quantity_3hp || 0,
  pdi_verified.quantity_5hp || 0,
  pdi_verified.quantity_7_5hp || 0,
  user_id
  ]);

    await db.query(`
      UPDATE workorder_stage_logs
      SET status = 'Verified', completed_at = NOW()
      WHERE work_order_id = ? AND role = 'Factory'
    `, [work_order_id]);

    const [jsrs] = await db.query(`
      SELECT id FROM users
      WHERE role = 'JSR'
        AND district = ?
        AND taluka = ?
        AND village = ?
      LIMIT 1
    `, [district, taluka, village]);

    if (jsrs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No JSR found for given district, taluka, village"
      });
    }

    const jsrId = jsrs[0].id;

    // Insert into jsr_verification if not already assigned
    const [existing] = await db.query(
      `SELECT * FROM jsr_verification WHERE work_order_id = ?`,
      [work_order_id]
    );

    if (existing.length === 0) {
      await db.query(
        `INSERT INTO jsr_verification (
          work_order_id, hp_3, hp_5, hp_7_5, total_quantity,
          verified_quantity, status, assigned_at, jsr_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'Assigned', NOW(), ?)`,
        [
          work_order_id,
          p_hp_3, p_hp_5, p_hp_7_5,
          p_total_quantity,
          0, // Initially nothing verified
          jsrId
        ]
      );
    }

    return res.json({
      success: true,
      message: "Factory + PDI data saved and assigned to JSR",
      assigned_jsr_id: jsrId
    });

  } catch (error) {
    console.error('Update Factory Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};




// controllers/workOrderController.js

exports.getAllJSRDashboard = async (req, res) => {
  try {
    const [jsrData] = await db.query(`
      SELECT 
        work_order_id,
        hp_3,
        hp_5,
        hp_7_5,
        total_quantity,
        verified_quantity,
        (total_quantity - verified_quantity) AS remaining_quantity,
        status,
        assigned_at,
        verified_at
      FROM jsr_verification
      ORDER BY assigned_at DESC
    `);

    if (!jsrData || jsrData.length === 0) {
      return res.status(404).json({ success: false, message: "No JSR data found." });
    }

    res.json({
      success: true,
      count: jsrData.length,
      data: jsrData
    });

  } catch (error) {
    console.error("JSR Dashboard Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};




exports.getWorkOrderProgress = async (req, res) => {
  const { orderId } = req.params;

  try {
    const [order] = await db.query(`
SELECT id, title, region, total_quantity, status, created_at, start_date 
FROM work_orders 
WHERE id = ?

    `, [orderId]);

    if (!order.length) {
      return res.status(404).json({ success: false, message: "Work order not found" });
    }

    const [stageLogs] = await db.query(`
      SELECT role, status, started_at, completed_at
      FROM workorder_stage_logs
      WHERE work_order_id = ?
    `, [orderId]);

    const [pdiStats] = await db.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN is_pdi_done = 1 THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN is_pdi_done = 0 THEN 1 ELSE 0 END) AS remaining
      FROM pump_order_details
      WHERE work_order_id = ?
    `, [orderId]);

    const progress = [
      {
        stage: "Factory Assigned",
        date: getStageDate(stageLogs, 'Factory'),
        status: getStageStatus(stageLogs, 'Factory'),
        pdi: {
          total_quantity: pdiStats[0]?.total || 0,
          completed: pdiStats[0]?.completed || 0,
          remaining: pdiStats[0]?.remaining || 0
        }
      },
      {
        stage: "Dispatch to Warehouse",
        date: getStageDate(stageLogs, 'Warehouse'),
        status: getStageStatus(stageLogs, 'Warehouse')
      },
      {
        stage: "JSR Done",
        date: getStageDate(stageLogs, 'JSR'),
        status: getStageStatus(stageLogs, 'JSR')
      },
      {
        stage: "CP Assigned",
        date: getStageDate(stageLogs, 'CP'),
        status: getStageStatus(stageLogs, 'CP')
      },
      {
        stage: "Installed at Farm",
        date: getStageDate(stageLogs, 'Installation'),
        status: getStageStatus(stageLogs, 'Installation')
      },
      {
        stage: "Farm Inspection",
        date: getStageDate(stageLogs, 'Inspection'),
        status: getStageStatus(stageLogs, 'Inspection')
      }
    ];

    return res.json({
      success: true,
      work_order_id: order[0].id,
      created_at: order[0].created_at,
      due_date: order[0].due_date,
      status: stageLogs.length ? "InProgress" : "Pending",
      progress
    });

  } catch (err) {
    console.error("Progress API Error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};

// Helper functions
function getStageDate(logs, role) {
  const log = logs.find(l => l.role === role);
  return log?.completed_at || log?.started_at || "Pending";
}

function getStageStatus(logs, role) {
  const log = logs.find(l => l.role === role);
  return log?.status || "Pending";
}





exports.submitWarehouseUnits = async (req, res) => {
  const { work_order_id, hp_3, hp_5, hp_7_5, total } = req.body;
  const userId = req.user.id;

  if (!work_order_id || total == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const calculatedTotal = (hp_3 || 0) + (hp_5 || 0) + (hp_7_5 || 0);
  if (calculatedTotal !== total) {
    return res.status(400).json({ error: 'Total mismatch with HP units' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO warehouse_units (work_order_id, hp_3, hp_5, hp_7_5, total, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [work_order_id, hp_3 || 0, hp_5 || 0, hp_7_5 || 0, total, userId]);

    await connection.query(`
      UPDATE work_orders SET status = 'warehouse_units_received' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'Warehouse units submitted' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to submit units' });
  } finally {
    connection.release();
  }
};

exports.getAssignedWorkOrdersForCP = async (req, res) => {
  const cpUserId = req.user.id;

  try {
    // 1. Get all work orders assigned to this CP
const [orders] = await db.query(`
  SELECT 
    w.id AS work_order_id,
    w.order_number,
    w.title,
    w.status,
    w.quantity,
    w.total,
    w.hp_3,
    w.hp_5,
    w.hp_7_5,
    w.dispatch_due,
    w.delivery_due,
    w.created_at
  FROM work_orders w
  JOIN work_order_stakeholders ws ON ws.work_order_id = w.id
  WHERE ws.channel_partner = ?
    AND ws.channel_partner IS NOT NULL
  ORDER BY w.created_at DESC
`, [cpUserId]);


    // Total work orders
    const totalWorkOrders = orders.length;

    // Current Order ID (latest order number)
    const currentOrderId = totalWorkOrders > 0 ? `#${orders[0].order_number}` : null;

    // Total Units (sum of all 'total' or 'quantity')
const totalUnits = orders.reduce((sum, order) => 
  sum + ((order.hp_3 || 0) + (order.hp_5 || 0) + (order.hp_7_5 || 0)), 0);


    // 2. Get channel partner stats
    const [[cpStats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'channel_partner') AS total,
        (SELECT COUNT(DISTINCT channel_partner) 
         FROM work_order_stakeholders 
         WHERE channel_partner IS NOT NULL) AS assigned
    `);

    res.status(200).json({
      totalWorkOrders,
      currentOrderId,
      totalUnits,
      channelPartnerStats: {
        assigned: cpStats.assigned,
        total: cpStats.total
      },
      workOrders: orders
    });
  } catch (err) {
    console.error("❌ getAssignedWorkOrdersForCP error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};



exports.submitCPUnits = async (req, res) => {
  const { work_order_id, hp_3, hp_5, hp_7_5, total } = req.body;
  const userId = req.user.id;

  if (!work_order_id || total == null)
    return res.status(400).json({ error: 'Missing required fields' });

  const calculatedTotal = (hp_3 || 0) + (hp_5 || 0) + (hp_7_5 || 0);
  if (calculatedTotal !== total)
    return res.status(400).json({ error: 'Total mismatch with HP values' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO cp_units (work_order_id, hp_3, hp_5, hp_7_5, total, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [work_order_id, hp_3 || 0, hp_5 || 0, hp_7_5 || 0, total, userId]);

    await connection.query(`
      UPDATE work_orders SET status = 'cp_units_received' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'CP units submitted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to submit CP units' });
  } finally {
    connection.release();
  }
};

// const pool = require('../config/db'); // Your MySQL pool config

exports.getJSRDashboardStats = async (req, res) => {
  const { jsrId } = req.query;

  if (!jsrId) {
    return res.status(400).json({ success: false, message: "JSR ID is required" });
  }

  try {
    // Fetch assigned work orders with correct fields
    const [orders] = await db.query(
      `SELECT work_order_id, 
              SUM(hp_3) AS units_3hp, 
              SUM(hp_5) AS units_5hp, 
              SUM(hp_7_5) AS units_7_5hp, 
              (SUM(hp_3) + SUM(hp_5) + SUM(hp_7_5)) AS total_units
       FROM jsr_verification 
       WHERE id = ?
       GROUP BY work_order_id`,
      [jsrId]
    );

    if (!orders.length) {
      return res.status(404).json({ success: false, message: "No work orders found for this JSR" });
    }

    // Calculate summary
    let totalUnits = 0;
    let totalOrders = orders.length;

    orders.forEach(order => {
      totalUnits += order.total_units;
    });

    // Current Work Order (last one assigned)
    const currentOrder = orders[orders.length - 1];

    // Get total JSR done for this JSR user
    const [jsrDoneData] = await db.query(
      `SELECT COUNT(*) AS done, SUM(verified_quantity) AS units_done 
       FROM jsr_verification 
       WHERE id = ?`,
      [jsrId]
    );

    const unitsDone = jsrDoneData[0]?.units_done || 0;

    return res.status(200).json({
      success: true,
      message: "JSR Dashboard Data Fetched Successfully",
      data: {
        totalWorkOrders: totalOrders,
        currentWorkOrderId: currentOrder.work_order_id,
        totalUnits: totalUnits,
        jsrDone: unitsDone,
        orders: orders.map(order => ({
          workOrderId: order.work_order_id,
          units_3hp: order.units_3hp,
          units_5hp: order.units_5hp,
          units_7_5hp: order.units_7_5hp,
          totalUnits: order.total_units,
          timeline: "3 Days" 
        }))
      }
    });

  } catch (error) {
    console.error("Error in getJSRDashboardStats:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};





exports.assignUnitsToFarmer = async (req, res) => {
  const { work_order_id, farmer_name, hp_unit, notes } = req.body;
  const userId = req.user.id;

  if (!work_order_id || !farmer_name || !hp_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO cp_stage_assignments (
        work_order_id, farmer_name, hp_unit, notes, assigned_by
      ) VALUES (?, ?, ?, ?, ?)
    `, [work_order_id, farmer_name, hp_unit, notes || '', userId]);

    await connection.query(`
      UPDATE work_orders SET status = 'assigned_to_farmer' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'Units assigned to farmer successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to assign to farmer' });
  } finally {
    connection.release();
  }
};

exports.getMyPumps = async (req, res) => {
  const farmerId = req.user.id;

  try {
const [pumps] = await db.query(`
  SELECT id, work_order_id, hp_unit, status, created_at AS assigned_at
  FROM cp_stage_assignments
  WHERE assigned_by = ?
  ORDER BY created_at DESC
`, [farmerId]);


    res.status(200).json({ pumps });
  } catch (err) {
    console.error("❌ getMyPumps error:", err);
    res.status(500).json({ error: "Failed to fetch assigned pumps" });
  }
};

// controllers/workOrderController.js
exports.submitDefectReport = async (req, res) => {
  const { title, description } = req.body;
  const farmerId = req.user.id;

  if (!title || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const photo1 = req.files['photo_1']?.[0]?.filename || null;
  const photo2 = req.files['photo_2']?.[0]?.filename || null;
  const photo3 = req.files['photo_3']?.[0]?.filename || null;

  try {
    await db.query(`
      INSERT INTO pump_defects (
        farmer_id, title, description, photo_1, photo_2, photo_3
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [farmerId, title, description, photo1, photo2, photo3]);

    res.status(201).json({ message: 'Defect submitted successfully' });
  } catch (err) {
    console.error("❌ submitDefectReport error:", err);
    res.status(500).json({ error: "Failed to submit defect" });
  }
};


exports.getPumpProgress = async (req, res) => {
  const { work_order_id } = req.params;
  const farmerId = req.user.id;

  try {
    const [progress] = await db.query(`
      SELECT stage, remarks, DATE(created_at) as date
      FROM pump_progress
      WHERE work_order_id = ? AND farmer_id = ?
      ORDER BY created_at ASC
    `, [work_order_id, farmerId]);

    res.status(200).json({ progress });
  } catch (err) {
    console.error("❌ getPumpProgress error:", err);
    res.status(500).json({ error: "Failed to fetch pump progress" });
  }
};



exports.assignUnitsToCP = async (req, res) => {
  const { work_order_id, assignments } = req.body;
  const userId = req.user.id;

  if (!work_order_id || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'Missing required fields or assignments' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (const assignment of assignments) {
      const { region, quantity, notes } = assignment;
      if (!region || !quantity) {
        await connection.rollback();
        return res.status(400).json({ error: 'Each assignment must include region and quantity' });
      }

      await connection.query(`
        INSERT INTO warehouse_stage_assignments (
          work_order_id, region, quantity, notes, assigned_by
        ) VALUES (?, ?, ?, ?, ?)
      `, [work_order_id, region, quantity, notes || '', userId]);
    }

    await connection.query(`
      UPDATE work_orders SET status = 'assigned_to_cp' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'Units assigned to CP successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to assign units' });
  } finally {
    connection.release();
  }
};





exports.submitManufacturedUnits = async (req, res) => {
  const { work_order_id, hp_3, hp_5, hp_7_5 } = req.body;
  const userId = req.user.id; 

  if (!work_order_id || hp_3 == null || hp_5 == null || hp_7_5 == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const total = hp_3 + hp_5 + hp_7_5;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Step 1: Get current quantity of work order
    const [[workOrder]] = await connection.query(`
      SELECT quantity FROM work_orders WHERE id = ?
    `, [work_order_id]);

    if (!workOrder) {
      return res.status(404).json({ error: "Work order not found" });
    }

    console.log(workOrder.quantity)

    if (total > workOrder.quantity) {
      return res.status(400).json({ error: "Manufactured quantity exceeds work order quantity" });
    }

    // Step 2: Insert manufactured units
    await connection.query(`
      INSERT INTO units_manufactured (work_order_id, hp_3, hp_5, hp_7_5, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [work_order_id, hp_3, hp_5, hp_7_5, userId]);

    // Step 3: Log stage status
    await connection.query(`
      INSERT INTO workorder_stage_logs (work_order_id, stage, status, completed_quantity)
      VALUES (?, 'factory', 'in_progress', ?)
    `, [work_order_id, total]);

    // Step 4: Update work_order status
    await connection.query(`
      UPDATE work_orders
      SET status = 'manufacturing_in_progress'
      WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: "Units submitted successfully" });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    connection.release();
  }
};

exports.submitJsrStage = async (req, res) => {
  try {
    const { work_order_id, lineman_name, notes } = req.body;
    const userId = req.user?.id;

    // Validate fields
    if (!work_order_id || !lineman_name) {
      return res.status(400).json({ error: 'Missing required text fields' });
    }

    const installationPhoto = req.files?.['installation_photo']?.[0];
    const sitePhoto = req.files?.['site_photo']?.[0];

    if (!installationPhoto || !sitePhoto) {
      return res.status(400).json({ error: 'Missing photo uploads' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO jsr_stage (
        work_order_id,
        lineman_name,
        notes,
        installation_photo,
        site_photo,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      work_order_id,
      lineman_name,
      notes || '',
      installationPhoto.path,
      sitePhoto.path,
      userId
    ]);

    await connection.query(`
      UPDATE work_orders SET status = 'jsr_stage_completed' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    connection.release();

    return res.status(201).json({ message: 'JSR stage submitted successfully' });

  } catch (err) {
    console.error('JSR Stage Error:', err);
    return res.status(500).json({ error: 'Failed to submit JSR stage' });
  }
};






exports.submitJsrUnits = async (req, res) => {
  const { work_order_id, hp_3, hp_5, hp_7_5, total } = req.body;
  const userId = req.user.id;

  if (!work_order_id || hp_3 == null || hp_5 == null || hp_7_5 == null || total == null)
    return res.status(400).json({ error: 'Missing required fields' });

  const calculatedTotal = hp_3 + hp_5 + hp_7_5;
  if (calculatedTotal !== total)
    return res.status(400).json({ error: 'Total mismatch with HP values' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO jsr_units (work_order_id, hp_3, hp_5, hp_7_5, total, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [work_order_id, hp_3, hp_5, hp_7_5, total, userId]);

    await connection.query(`
      UPDATE work_orders SET status = 'jsr_units_submitted' WHERE id = ?
    `, [work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'JSR units submitted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};


// exports.dispatchToWarehouse = async (req, res) => {
//   const {
//     work_order_id,
//     qty_latur,
//     qty_pune,
//     qty_sonai,
//     qty_nagpur,
//     qty_mumbai,
//     total
//   } = req.body;

//   const userId = req.user.id;

//   if (!work_order_id || total == null) {
//     return res.status(400).json({ error: 'Missing required fields' });
//   }

//   const connection = await db.getConnection();
//   try {
//     await connection.beginTransaction();

// await connection.query(`
//   INSERT INTO jsr_dispatch (
//     work_order_id, qty_latur, qty_pune, qty_sonai,
//     qty_nagpur, qty_mumbai, dispatched_by
//   ) VALUES (?, ?, ?, ?, ?, ?, ?)
// `, [
//   work_order_id,
//   qty_latur || 0,
//   qty_pune || 0,
//   qty_sonai || 0,
//   qty_nagpur || 0,
//   qty_mumbai || 0,
//   userId
// ]);


//     await connection.query(`
//       UPDATE work_orders SET status = 'dispatched_to_warehouse' WHERE id = ?
//     `, [work_order_id]);

//     await connection.commit();
//     res.status(201).json({ message: 'Dispatched to warehouse successfully' });
//   } catch (err) {
//     await connection.rollback();
//     console.error(err);
//     res.status(500).json({ error: 'Internal server error' });
//   } finally {
//     connection.release();
//   }
// };




exports.submitPdiVerification = async (req, res) => {
  const { work_order_id, hp_3, hp_5, hp_7_5 } = req.body;
  const userId = req.user.id;

  if (!work_order_id || hp_3 == null || hp_5 == null || hp_7_5 == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const total = hp_3 + hp_5 + hp_7_5;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Insert PDI data
    await connection.query(`
      INSERT INTO pdi_verification (work_order_id, hp_3, hp_5, hp_7_5, verified_by)
      VALUES (?, ?, ?, ?, ?)
    `, [work_order_id, hp_3, hp_5, hp_7_5, userId]);

    // 2. Update work order status to JSR in progress
    await connection.query(`
      UPDATE work_orders
      SET status = 'jsr_in_progress'
      WHERE id = ?
    `, [work_order_id]);

    // 3. Log in stage logs
    await connection.query(`
      INSERT INTO workorder_stage_logs (work_order_id, stage, status, completed_quantity, remarks)
      VALUES (?, 'pdi', 'completed', ?, 'PDI Verified and Dispatched to JSR'),
             (?, 'jsr', 'in_progress', 0, 'Dispatched to JSR')
    `, [work_order_id, total, work_order_id]);

    await connection.commit();
    res.status(201).json({ message: 'PDI submitted and dispatched to JSR successfully' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to submit PDI and dispatch' });
  } finally {
    connection.release();
  }
};

exports.getInspectionDashboard = async (req, res) => {
  const inspectorId = req.user.id;

  try {
    // Step 1: Get all assigned work orders
    const [assignedOrders] = await db.query(`
      SELECT 
        w.id AS work_order_id,
        w.order_number,
        w.hp_3,
        w.hp_5,
        w.hp_7_5,
        w.total,
        w.created_at
      FROM work_order_stakeholders ws
      JOIN work_orders w ON ws.work_order_id = w.id
      WHERE ws.inspection_officer = ?
      ORDER BY w.created_at DESC
    `, [inspectorId]);

    const assignedOrderIds = assignedOrders.map(row => row.work_order_id);
    const totalWorkOrders = assignedOrderIds.length;

    if (totalWorkOrders === 0) {
      return res.status(200).json({
        total_work_orders: 0,
        inspections_completed: 0,
        inspections_pending: 0,
        total_units_assigned: 0,
        total_units_inspected: 0,
        inspection_progress: 0,
        recent_inspections: [],
        assigned_orders: []
      });
    }

    // Step 2: Units assigned (already fetched from above: total column is used)
    const totalUnitsAssigned = assignedOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    // Step 3: Units inspected
    const [inspectedUnits] = await db.query(`
      SELECT 
        COUNT(DISTINCT work_order_id) AS inspections_completed,
        SUM(total_inspected) AS total_units_inspected
      FROM inspection_units
      WHERE inspected_by = ?
    `, [inspectorId]);

    const inspectionsCompleted = inspectedUnits[0].inspections_completed || 0;
    const totalUnitsInspected = inspectedUnits[0].total_units_inspected || 0;

    const inspectionsPending = totalWorkOrders - inspectionsCompleted;
    const progress = totalUnitsAssigned > 0
      ? Math.round((totalUnitsInspected / totalUnitsAssigned) * 100)
      : 0;

    // Step 4: Recent inspections
    const [recent] = await db.query(`
      SELECT 
        iu.work_order_id,
        wo.order_number,
        iu.total_inspected,
        iu.created_at AS inspection_date
      FROM inspection_units iu
      JOIN work_orders wo ON wo.id = iu.work_order_id
      WHERE iu.inspected_by = ?
      ORDER BY iu.created_at DESC
      LIMIT 5
    `, [inspectorId]);

    // ✅ Final Response
    res.status(200).json({
      total_work_orders: totalWorkOrders,
      inspections_completed: inspectionsCompleted,
      inspections_pending: inspectionsPending,
      total_units_assigned: totalUnitsAssigned,
      total_units_inspected: totalUnitsInspected,
      inspection_progress: progress,
      recent_inspections: recent,
      assigned_orders: assignedOrders // ✅ include full details here
    });

  } catch (err) {
    console.error("❌ getInspectionDashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
};






// exports.getProgress = async (req, res) => {
//   const { id } = req.params;
//   const connection = await db.getConnection();

//   try {
//     // 1. Work order info
//     const [[order]] = await connection.query(`
//       SELECT id, order_number, quantity AS total_quantity, status, created_at 
//       FROM work_orders 
//       WHERE id = ?
//     `, [id]);

//     if (!order) {
//       return res.status(404).json({ error: 'Work order not found' });
//     }

//     const totalRequired = Number(order.total_quantity);

//     // 2. Stage logs
//     const [logs] = await connection.query(`
//       SELECT 
//         stage, 
//         status, 
//         DATE(created_at) AS date, 
//         completed_quantity,
//         remarks
//       FROM workorder_stage_logs
//       WHERE work_order_id = ?
//       ORDER BY created_at
//     `, [id]);

//     // 3. Manufactured Units
//     const [[manufactured]] = await connection.query(`
//       SELECT 
//         SUM(hp_3) AS hp_3,
//         SUM(hp_5) AS hp_5,
//         SUM(hp_7_5) AS hp_7_5
//       FROM units_manufactured
//       WHERE work_order_id = ?
//     `, [id]);

//     const manufacturedHp3 = Number(manufactured.hp_3 || 0);
//     const manufacturedHp5 = Number(manufactured.hp_5 || 0);
//     const manufacturedHp7 = Number(manufactured.hp_7_5 || 0);
//     const totalManufactured = manufacturedHp3 + manufacturedHp5 + manufacturedHp7;

//     // 4. PDI Verified
//     const [[pdi]] = await connection.query(`
//       SELECT 
//         SUM(hp_3) AS hp_3,
//         SUM(hp_5) AS hp_5,
//         SUM(hp_7_5) AS hp_7_5
//       FROM pdi_verification
//       WHERE work_order_id = ?
//     `, [id]);

//     const pdiHp3 = Number(pdi.hp_3 || 0);
//     const pdiHp5 = Number(pdi.hp_5 || 0);
//     const pdiHp7 = Number(pdi.hp_7_5 || 0);
//     const totalPdi = pdiHp3 + pdiHp5 + pdiHp7;

//     // 5. JSR Units
//     const [[jsrUnits]] = await connection.query(`
//       SELECT 
//         total, created_by, created_at
//       FROM jsr_units
//       WHERE work_order_id = ?
//     `, [id]);

//     // 6. JSR Stage
//     const [[jsrStage]] = await connection.query(`
//       SELECT lineman_name, installation_photo, site_photo, created_at
//       FROM jsr_stage
//       WHERE work_order_id = ?
//     `, [id]);

//     // 7. Dispatch data
//     const [[dispatch]] = await connection.query(`
//       SELECT qty_latur, qty_pune, qty_sonai, qty_nagpur, qty_mumbai
//       FROM jsr_dispatch
//       WHERE work_order_id = ?
//     `, [id]);

//     const totalDispatched = 
//       Number(dispatch?.qty_latur || 0) +
//       Number(dispatch?.qty_pune || 0) +
//       Number(dispatch?.qty_sonai || 0) +
//       Number(dispatch?.qty_nagpur || 0) +
//       Number(dispatch?.qty_mumbai || 0);

//     // 8. Progress %
//     const progressPercent = totalRequired > 0
//       ? Math.min(100, Math.floor((totalDispatched / totalRequired) * 100))
//       : 0;

//     res.status(200).json({
//       workOrder: order,
//       progressPercent,
//       stages: logs,
//       manufacturedUnits: {
//         hp_3: manufacturedHp3,
//         hp_5: manufacturedHp5,
//         hp_7_5: manufacturedHp7,
//         total: totalManufactured
//       },
//       pdiVerifiedUnits: {
//         hp_3: pdiHp3,
//         hp_5: pdiHp5,
//         hp_7_5: pdiHp7,
//         total: totalPdi
//       },
//       jsrUnits: jsrUnits || null,
//       jsrStage: jsrStage || null,
//       warehouseDispatch: {
//         ...(dispatch || {}),
//         total: totalDispatched
//       }
//     });

//   } catch (err) {
//     console.error("❌ getProgress error:", err);
//     res.status(500).json({ error: 'Failed to fetch progress' });
//   } finally {
//     connection.release();
//   }
// };




exports.createWorkOrder = async (req, res) => {
  try {
    const {
      title,
      region,
      quantity_3hp = 0,
      quantity_5hp = 0,
      quantity_7_5hp = 0,
      start_date,
      created_by,
      timelines,        
      stakeholders = []  
    } = req.body;

    const farmerListFile = req.file ? req.file.filename : null;

    if (!title || !start_date || !created_by || !timelines) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const total_quantity =
      parseInt(quantity_3hp) + parseInt(quantity_5hp) + parseInt(quantity_7_5hp);

    const [workOrderResult] = await db.query(
      `INSERT INTO work_orders (
        title, region, farmer_list_file,
        quantity_3hp, quantity_5hp, quantity_7_5hp,
        total_quantity, start_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        region,
        farmerListFile,
        quantity_3hp,
        quantity_5hp,
        quantity_7_5hp,
        total_quantity,
        start_date,
        created_by,
      ]
    );

    const workOrderId = workOrderResult.insertId;

    const timelineObj = JSON.parse(timelines);
    for (const role in timelineObj) {
      const days = timelineObj[role];
      await db.query(
        `INSERT INTO workorder_timelines (work_order_id, role, duration_days)
         VALUES (?, ?, ?)`,
        [workOrderId, role, days]
      );
    }

    if (stakeholders.length > 0) {
      for (const { role, user_id } of stakeholders) {
        await db.query(
          `INSERT INTO workorder_stakeholders (work_order_id, role, user_id)
           VALUES (?, ?, ?)`,
          [workOrderId, role, user_id]
        );
      }
    }

const userId = req.user?.id;

if (!userId) {
  return res.status(401).json({ error: 'Unauthorized: No user ID found' });
}

// Fetch the creator (logged-in user)
const [creator] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);

if (!creator.length) {
  return res.status(404).json({ error: 'User not found' });
}

console.log("User Role:", creator[0].role);

if (creator[0].role === 'admin') {
  await db.query(
    `INSERT INTO workorder_stage_logs (work_order_id, role, status, started_at)
     VALUES (?, 'Factory', 'Pending', NOW())`,
    [workOrderId]
  );
}

    res.status(201).json({
      message: 'Work order created successfully',
      work_order_id: workOrderId,
    });

  } catch (err) {
    console.error('Error in createWorkOrder:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


exports.listWorkOrders = async (req, res) => {
  try {
    const connection = await db.getConnection();

    const [rows] = await connection.query(`
      SELECT 
        w.id AS work_order_id,
        w.order_number,
        w.title,
        w.quantity,
        w.status,
        w.region,
        w.start_date,
        w.created_at,
        w.updated_at,
        u.name AS issued_by_name,
        u.id AS issued_by,

        wt.stage AS timeline_stage,
        wt.days AS timeline_days,

        wos.factory_contact,
        wos.pdi_officer,
        wos.warehouse_manager,
        wos.jsr_officer,
        wos.channel_partner,
        wos.inspection_officer

      FROM work_orders w
      LEFT JOIN users u ON u.id = w.issued_by
      LEFT JOIN workorder_timelines wt ON wt.work_order_id = w.id
      LEFT JOIN work_order_stakeholders wos ON wos.work_order_id = w.id
      ORDER BY w.created_at DESC
    `);

    // Structure work orders without duplicating them
    const workOrdersMap = {};

    for (const row of rows) {
      const id = row.work_order_id;

      if (!workOrdersMap[id]) {
        workOrdersMap[id] = {
          id: row.work_order_id,
          order_number: row.order_number,
          title: row.title,
          quantity: row.quantity,
          region: row.region,
          status: row.status,
          start_date: row.start_date,
          created_at: row.created_at,
          updated_at: row.updated_at,
          issued_by: row.issued_by,
          issued_by_name: row.issued_by_name,
          timeline: {},
          stakeholders: {
            factory_contact: row.factory_contact,
            pdi_officer: row.pdi_officer,
            warehouse_manager: row.warehouse_manager,
            jsr_officer: row.jsr_officer,
            channel_partner: row.channel_partner,
            inspection_officer: row.inspection_officer
          }
        };
      }

      // Group timeline by stage
      if (row.timeline_stage) {
        workOrdersMap[id].timeline[row.timeline_stage] = row.timeline_days;
      }
    }

    const workOrders = Object.values(workOrdersMap);

    connection.release();
    res.status(200).json({ workOrders });
  } catch (err) {
    console.error("❌ listWorkOrders error:", err);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
};


exports.getWorkOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const [[order]] = await db.query(`
      SELECT * FROM work_orders WHERE id = ?
    `, [id]);

    if (!order) return res.status(404).json({ error: 'Work order not found' });

    const [timeline] = await db.query(`
      SELECT stage, days FROM workorder_timelines WHERE work_order_id = ?
    `, [id]);

    const [stakeholders] = await db.query(`
      SELECT  * FROM work_order_stakeholders WHERE work_order_id = ?
    `, [id]);

    res.json({
      workOrder: order,
      timeline: Object.fromEntries(timeline.map(r => [r.stage, r.days])),
      stakeholders: stakeholders
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch work order' });
  }
};
exports.updateWorkOrder = async (req, res) => {
  const { id } = req.params;
 const { title, region, quantity, start_date, timeline, stakeholders, hp_1, hp_2, hp_3 } = req.body;



  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Update base info
   await connection.query(`
  UPDATE work_orders SET 
    title = ?, 
    quantity = ?, 
    region = ?, 
    start_date = ?,
    hp_1 = ?,
    hp_2 = ?,
    hp_3 = ?,
    updated_at = CURRENT_TIMESTAMP 
  WHERE id = ?
`, [title, quantity, region, start_date, hp_1, hp_2, hp_3, id]);

    // 2. Delete and re-insert timeline
    await connection.query(`DELETE FROM workorder_timelines WHERE work_order_id = ?`, [id]);
    const timelineValues = Object.entries(timeline).map(([stage, days]) => [id, stage, days]);
    await connection.query(`INSERT INTO workorder_timelines (work_order_id, stage, days) VALUES ?`, [timelineValues]);

    // 3. Delete and re-insert stakeholders
    await connection.query(`DELETE FROM work_order_stakeholders WHERE work_order_id = ?`, [id]);
    await connection.query( 'INSERT INTO work_order_stakeholders (work_order_id, factory_contact, pdi_officer, warehouse_manager, jsr_officer, channel_partner, inspection_officer) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                id,
                stakeholders.factory_contact,
                stakeholders.pdi_officer,
                stakeholders.warehouse_manager,
                stakeholders.jsr_officer,
                stakeholders.channel_partner,
                stakeholders.inspection_officer
            ]);
    

    await connection.commit();
    res.json({ message: 'Work order updated successfully' });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to update work order' });
  } finally {
    connection.release();
  }
};


exports.deleteWorkOrder = async (req, res) => {
  const connection = await db.getConnection();
  const workOrderId = req.params.id;

  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM remarks WHERE work_order_id = ?', [workOrderId]);
    await connection.query('DELETE FROM workorder_timelines WHERE work_order_id = ?', [workOrderId]);
    await connection.query('DELETE FROM work_order_stakeholders WHERE work_order_id = ?', [workOrderId]);
    await connection.query('DELETE FROM work_orders WHERE id = ?', [workOrderId]);

    await connection.commit();
    res.status(200).json({ message: 'Work order deleted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error("Delete error:", err);
    res.status(500).json({ error: 'Failed to delete work order' });
  } finally {
    connection.release();
  }
};



exports.submitInspectionUnits = async (req, res) => {
  const { work_order_id, total_inspected, hp_3, hp_5, hp_7_5 } = req.body;
  const inspectedBy = req.user.id;

  try {
    await db.query(`
      INSERT INTO inspection_units (
        work_order_id, total_inspected, hp_3, hp_5, hp_7_5, inspected_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      work_order_id,
      total_inspected,
      hp_3 || 0,
      hp_5 || 0,
      hp_7_5 || 0,
      inspectedBy
    ]);

    res.status(201).json({ message: "Inspection units submitted successfully" });
  } catch (err) {
    console.error("❌ submitInspectionUnits error:", err);
    res.status(500).json({ error: "Failed to submit inspection units" });
  }
};


exports.uploadInspectionPhotos = async (req, res) => {
  const { inspectionData } = req.body;
  let parsedData;

  try {
    parsedData = JSON.parse(inspectionData); // Array of objects
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON in inspectionData" });
  }

  const fileMap = {};
  for (const file of req.files) {
    fileMap[file.fieldname] = file.path;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (let i = 0; i < parsedData.length; i++) {
      const entry = parsedData[i];
      const work_order_id = entry.work_order_id;
      const notes = entry.notes || "";

      const site_photo = fileMap[`site_photo_${i}`] || null;
      const lineman_photo = fileMap[`lineman_photo_${i}`] || null;
      const close_up_photo = fileMap[`close_up_photo_${i}`] || null;

      await connection.query(
        `INSERT INTO inspection_photos (
            work_order_id, site_photo, lineman_photo, close_up_photo, notes
        ) VALUES (?, ?, ?, ?, ?)`,
        [work_order_id, site_photo, lineman_photo, close_up_photo, notes]
      );
    }

    await connection.commit();
    res.status(201).json({ message: "All inspection photos uploaded successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("❌ uploadInspectionPhotosMulti error:", err);
    res.status(500).json({ error: "Failed to upload multiple inspection photos" });
  } finally {
    connection.release();
  }
};


exports.completeInspection = async (req, res) => {
  const { work_order_id } = req.body;
  const userId = req.user.id;

  try {
    await db.query(`
      UPDATE work_orders SET status = 'inspected' WHERE id = ?
    `, [work_order_id]);

    await db.query(`
      INSERT INTO pump_progress (work_order_id, farmer_id, stage, created_at)
      VALUES (?, ?, ?, NOW())
    `, [work_order_id, userId, 'Farm Inspection']);

    res.status(200).json({ message: "Work order marked as inspected" });
  } catch (err) {
    console.error("❌ completeInspection error:", err);
    res.status(500).json({ error: "Failed to complete inspection" });
  }
};

exports.getInspectionProgress = async (req, res) => {
  const workOrderId = req.params.work_order_id;

  try {
    const [progressData] = await db.query(`
      SELECT stage, DATE_FORMAT(created_at, '%e %M') as date
      FROM pump_progress
      WHERE work_order_id = ?
      ORDER BY created_at ASC
    `, [workOrderId]);

    res.status(200).json({ progress: progressData });
  } catch (err) {
    console.error("❌ getInspectionProgress error:", err);
    res.status(500).json({ error: "Failed to fetch inspection progress" });
  }
};

exports.getWorkOrderSummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        w.id,
        w.title,
        w.region,
        w.total_quantity,
        MAX(CASE WHEN l.role = 'Factory' THEN l.status ELSE NULL END) AS Factory,
        MAX(CASE WHEN l.role = 'Dispatch' THEN l.status ELSE NULL END) AS Dispatch,
        MAX(CASE WHEN l.role = 'Field' THEN l.status ELSE NULL END) AS Field,
        MAX(CASE WHEN l.role = 'Completed' THEN l.status ELSE NULL END) AS Completed
      FROM
        work_orders w
      LEFT JOIN
        workorder_stage_logs l ON w.id = l.work_order_id
      GROUP BY
        w.id, w.title, w.region, w.total_quantity
      ORDER BY
        w.id DESC
    `);

    

    res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



exports.getWorkOrderList = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        region,
        start_date,
        total_quantity,
        farmer_list_file,
        quantity_3hp,
        quantity_5hp,
        quantity_7_5hp,
        t.timeline_factory,
        t.timeline_pdi,
        t.timeline_warehouse,
        t.timeline_jsr,
        t.timeline_cp,
        t.timeline_farmer
      FROM work_orders w
      LEFT JOIN work_order_assignments t ON t.work_order_id = w.id
      WHERE w.is_active = true
      ORDER BY w.start_date DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
