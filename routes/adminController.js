const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.getAdminUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, phone, created_at FROM users WHERE role = 'admin'"
    );
    res.json({ admins: rows });
  } catch (err) {
    console.error("Error fetching admin users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
  
exports.getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id; // Retrieved from verifyToken middleware

    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, created_at FROM users WHERE id = ? AND role = 'admin'`,
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Admin profile not found' });
    }

    res.json({ admin: rows[0] });
  } catch (err) {
    console.error('Error fetching admin profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUsersGroupedByRole = async (req, res) => {

  try {

    // Roles to fetch from DB

    const rolesToFetch = ['factory', 'inspector', 'warehouse', 'cp', 'farmer'];

    const placeholders = rolesToFetch.map(() => '?').join(',');


    const [users] = await db.query(

      `SELECT id, name, role FROM users WHERE role IN (${placeholders})`,

      rolesToFetch

    );


    // Group into final stakeholder keys

    const grouped = {

      factory: [],

      pdi: [],

      jsr: [],

      warehouse: [],

      cp: [],

      inspection: [],

      farmer: []

    };


    users.forEach(user => {

      switch (user.role) {

        case 'factory':

          grouped.factory.push(user);

          break;

        case 'inspector':

          grouped.pdi.push(user);

          grouped.jsr.push(user);

          grouped.inspection.push(user);

          break;

        case 'warehouse':

          grouped.warehouse.push(user);

          break;

        case 'cp':

          grouped.cp.push(user);

          break;

        case 'farmer':

          grouped.farmer.push(user);

          break;

      }

    });


    res.json({ grouped });


  } catch (err) {

    console.error('Error fetching grouped users:', err);

    res.status(500).json({ error: 'Internal server error' });

  }

};

exports.getUsersByRole = async (req, res) => {

  const { role } = req.params;


  try {

    const allowedRoles = ['admin', 'factory', 'inspector', 'cp', 'warehouse', 'farmer'];

    if (!allowedRoles.includes(role)) {

      return res.status(400).json({ error: 'Invalid role' });

    }


    const [users] = await db.query(

      `SELECT id, name, email, phone, role FROM users WHERE role = ?`,

      [role]

    );


    res.json({ users });


  } catch (err) {

    console.error('Error fetching users by role:', err);

    res.status(500).json({ error: 'Internal server error' });

  }

};
