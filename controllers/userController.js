const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const allowedRoles = ['factory', 'inspector', 'warehouse', 'cp', 'farmer'];


const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendLoginOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query('UPDATE users SET otp = ?, otp_expiry = ? WHERE email = ?', [otp, expiry, email]);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP for Login',
      text: `Your login OTP is: ${otp}. It is valid for 10 minutes.`
    });

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.verifyLoginOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];

    if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ error: 'OTP expired' });

    await db.query('UPDATE users SET otp = NULL, otp_expiry = NULL WHERE email = ?', [email]);

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '3d',
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.sendForgotOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.query('UPDATE users SET otp = ?, otp_expiry = ? WHERE email = ?', [otp, expiry, email]);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP for Password Reset',
      text: `Your OTP is: ${otp}. It is valid for 10 minutes.`
    });

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    console.error('Forgot OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.verifyForgotOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ error: 'OTP expired' });

    res.json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Forgot OTP verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};



exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ error: 'OTP expired' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query('UPDATE users SET password = ?, otp = NULL, otp_expiry = NULL WHERE email = ?', [hashedPassword, email]);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getProfileByRole = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role; // e.g., 'admin', 'jsr', 'factory'

  try {
    const connection = await db.getConnection();

    // Common user info
    const [[user]] = await connection.query(
      `SELECT id, name, phone, email, company_name, role, photo FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Optional: Fetch additional data based on role
    let extraData = {};

    if (userRole === 'admin') {
      const [[adminStats]] = await connection.query(`
        SELECT COUNT(*) AS total_work_orders FROM work_orders
      `);
      extraData = { adminStats };
    }

    if (userRole === 'factory') {
      const [[factoryStats]] = await connection.query(`
        SELECT COUNT(*) AS assigned_orders FROM work_order_stakeholders
        WHERE factory_contact = ?
      `, [userId]);
      extraData = { factoryStats };
    }

    if (userRole === 'jsr') {
      const [[jsrStats]] = await connection.query(`
        SELECT COUNT(*) AS jsr_assigned_orders FROM work_order_stakeholders
        WHERE jsr_contact = ?
      `, [userId]);
      extraData = { jsrStats };
    }

    connection.release();

    return res.status(200).json({
      profile: user,
      extra: extraData
    });
  } catch (err) {
    console.error("❌ getProfile error:", err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
};





exports.registerUser = async (req, res) => {
  const { name, phone, email, password, confirmPassword, company_name, role } = req.body;
  const photo = req.file; // multer stores uploaded file here

  if (!name || !phone || !email || !password || !confirmPassword || !role) {
    return res.status(400).json({ error: 'All required fields must be filled' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (!allowedRoles.includes(role.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User with this email or phone already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Store image path or filename
    const photoPath = photo ? photo.path : null;

    await db.query(
      `INSERT INTO users (name, phone, email, password, company_name, role, photo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email, hashedPassword, company_name || null, role.toLowerCase(), photoPath]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

