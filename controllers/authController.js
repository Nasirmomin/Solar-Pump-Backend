const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

exports.forgotPassword = async (req, res) => {
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
      subject: 'Your OTP for password reset',
      text: `Your OTP is: ${otp}. It is valid for 10 minutes.`
    });

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id; // Retrieved from verifyToken middleware

    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, created_at, photo FROM users WHERE id = ? AND role = 'admin'`,
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Admin profile not found' });
    }

    const admin = rows[0];

    // Add full photo URL if photo exists
    if (admin.photo) {
      admin.photo_url = `${req.protocol}://${req.get('host')}/uploads/users/${admin.photo}`;
    } else {
      admin.photo_url = null; // Or a default image URL if preferred
    }

    res.json({ admin });
  } catch (err) {
    console.error('Error fetching admin profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // from token

    const [[user]] = await db.query(`
      SELECT id, name, email, role, profile_image FROM users WHERE id = ?
    `, [userId]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ profile: user });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};


exports.changePassword = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const [[user]] = await db.query(`SELECT password FROM users WHERE id = ?`, [userId]);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

    const hashed = await bcrypt.hash(newPassword, 10);

    await db.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId]);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
};


exports.uploadProfileImage = async (req, res) => {
  const userId = req.user.id;
  const imageUrl = `/uploads/${req.file.filename}`; // or from S3 / Cloudinary

  try {
    await db.query(`
      UPDATE users SET profile_image = ? WHERE id = ?
    `, [imageUrl, userId]);

    res.status(200).json({ message: 'Profile image updated', image: imageUrl });
  } catch (err) {
    console.error('Upload profile image error:', err);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
};



exports.editAdminProfile = async (req, res) => {
  const adminId = req.user.id;
  const photo = req.file ? req.file.filename : null;

  if (!photo) {
    return res.status(400).json({ error: 'Photo is required' });
  }

  try {
    // Fetch current admin record
    const [existing] = await db.query(
      `SELECT photo FROM users WHERE id = ? AND role = 'admin'`,
      [adminId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Delete old photo if a new one is uploaded
    const fs = require('fs');
    const oldPhoto = existing[0].photo;
    if (oldPhoto) {
      const oldPath = `uploads/users/${oldPhoto}`;
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update only the photo
    await db.query(
      `UPDATE users SET photo = ? WHERE id = ? AND role = 'admin'`,
      [photo, adminId]
    );

    res.json({ message: 'Profile photo updated successfully' });
  } catch (err) {
    console.error('Error updating photo:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};








exports.verifyOtp = async (req, res) => {
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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


exports.register = async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    role,
    companyName,
    warehouseLocation,
    multipleLocations,
    state,
    district,
    taluka,
    village,
  } = req.body;

  const photo = req.file ? req.file.filename : null;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All required fields must be filled' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

const [userResult] = await db.query(
  'INSERT INTO users (name, email, password, phone, role, photo, district, taluka, village) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [name, email, hashedPassword, phone, role, photo, district || null, taluka || null, village || null]
);


    const userId = userResult.insertId;

    switch (role.toLowerCase()) {
      case 'admin':
        await db.query(
          'INSERT INTO role_data (user_id, company_name) VALUES (?, ?)',
          [userId, companyName || null]
        );
        break;

      case 'factory':
        await db.query(
          'INSERT INTO role_data (user_id, company_name) VALUES (?, ?)',
          [userId, companyName || null]
        );
        break;

case 'jsr':
  await db.query(
    'INSERT INTO role_data (user_id, district, taluka, village) VALUES (?, ?, ?, ?)',
    [userId, district || null, taluka || null, village || null]
  );
  break;


      case 'warehouse':
        await db.query(
          'INSERT INTO role_data (user_id, company_name, warehouse_location) VALUES (?, ?, ?)',
          [userId, companyName || null, warehouseLocation || null]
        );
        break;

      case 'cp':
        await db.query(
          'INSERT INTO role_data (user_id, company_name, multiple_locations) VALUES (?, ?, ?)',
          [userId, companyName || null, multipleLocations || null]
        );
        break;

      case 'contractor':
        await db.query(
          'INSERT INTO role_data (user_id, company_name, state, district, village) VALUES (?, ?, ?, ?, ?)',
          [userId, companyName || null, state || null, district || null, village || null]
        );
        break;

      case 'farmer':
        await db.query(
          'INSERT INTO role_data (user_id, state, district, taluka, village) VALUES (?, ?, ?, ?, ?)',
          [userId, state || null, district || null, taluka || null, village || null]
        );
        break;

      case 'inspection':
        await db.query(
          'INSERT INTO role_data (user_id, state, district, taluka, village) VALUES (?, ?, ?, ?, ?)',
          [userId, state || null, district || null, taluka || null, village || null]
        );
        break;
    }


    res.status(201).json({ message: `${capitalize(role)} registered successfully` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


exports.loginWithGoogle = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json({ error: 'Google token is required' });

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    let user;
    if (existingUsers.length === 0) {
      const defaultPassword = await bcrypt.hash(email + process.env.JWT_SECRET, 10);
      const [insertResult] = await db.query(
        'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, defaultPassword, '', 'user']
      );
      const [newUserRows] = await db.query('SELECT * FROM users WHERE id = ?', [insertResult.insertId]);
      user = newUserRows[0];
    } else {
      user = existingUsers[0];
    }

    const jwtToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '3d',
    });

    res.json({
      message: 'Login successful',
      token: jwtToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        picture: picture || null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid or expired Google token' });
  }
};


exports.login = async (req, res) => {
  console.log(req.body);
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    console.log(rows);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate token
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '3d',
    });

    // Return token and role
    res.json({
      message: 'Login successful',
      token,
      user,
      role: user.role, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// GET /user-summary
exports.userSummary = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT role, COUNT(*) AS count FROM users WHERE is_active = true GROUP BY role`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};


// GET /users?role=Factory
exports.getRoleWiseUSer= async (req, res) => {
  const role = req.query.role;
  try {
    const [users] = await db.query(
      `SELECT id, name, email, role FROM users WHERE role = ? AND is_active = true`,
      [role]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};


exports.deleteUser = async (req, res) => {
  const userId = req.params.id;
  const role = req.query.role;

  try {
    const [userRows] = await db.query(
      `SELECT id, name, email, role FROM users WHERE id = ? AND is_active = true`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found or already deleted' });
    }

    const user = userRows[0];

    await db.query(
      `UPDATE users SET is_active = false WHERE id = ?`,
      [userId]
    );

    res.json({
      message: 'User deleted successfully',
      deletedUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        deletedByRole: role 
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};