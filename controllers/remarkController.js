const db = require('../config/db');



exports.addRemark = async (req, res) => {
  const { work_order_id, remark, roll_no, order_no } = req.body;
  const user_id = req.user.id;

  if (!work_order_id || !Number.isInteger(work_order_id)) {
    return res.status(400).json({ message: 'Invalid or missing work_order_id' });
  }

  if (!remark || remark.trim() === '') {
    return res.status(400).json({ message: 'Remark cannot be empty' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO remarks (work_order_id, user_id, remark, roll_no, order_no)
       VALUES (?, ?, ?, ?, ?)`,
      [work_order_id, user_id, remark, roll_no || null, order_no || null]
    );

    res.status(201).json({ message: 'Remark added', remark_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};



exports.editRemark = async (req, res) => {

  const { remark_id, remark } = req.body;

  const user_id = req.user.id;


  if (!remark_id || !Number.isInteger(remark_id)) {

    return res.status(400).json({ message: 'Invalid or missing remark_id' });

  }

  if (!remark || remark.trim() === '') {

    return res.status(400).json({ message: 'Remark cannot be empty' });

  }


  try {

    const [rows] = await db.query('SELECT user_id FROM remarks WHERE id = ?', [remark_id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Remark not found' });

    if (rows[0].user_id !== user_id)

      return res.status(403).json({ message: 'Not authorized to edit this remark' });


    await db.query('UPDATE remarks SET remark = ?, updated_at = NOW() WHERE id = ?', [remark, remark_id]);


    res.json({ message: 'Remark updated' });

  } catch (err) {

    console.error(err);

    res.status(500).json({ message: 'Server error' });

  }

};


exports.listRemarks = async (req, res) => {

  const { work_order_id, remark_id } = req.query;


  try {

    let query = `

      SELECT r.id, r.remark, r.created_at, r.updated_at, u.name as user_name, r.work_order_id,u.role as role

      FROM remarks r

      JOIN users u ON r.user_id = u.id

    `;

    let params = [];


    if (remark_id) {

      query += ' WHERE r.id = ?';

      params.push(remark_id);

    } else if (work_order_id) {

      query += ' WHERE r.work_order_id = ?';

      params.push(work_order_id);

    }


    query += ' ORDER BY r.created_at DESC';


    const [remarks] = await db.query(query, params);

    console.log(query);

    res.json(remarks);

  } catch (err) {

    console.error(err);

    res.status(500).json({ message: 'Server error' });

  }

};

