const express = require('express');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const workOrderRoutes = require('./routes/workOrderRoutes');
const usersRoutes = require('./routes/userRoutes');
const remarkRoutes = require('./routes/remarkRoutes');
const path = require("path")

dotenv.config();

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
console.log("✅ Registered workorder routes once");

app.use('/api/workorder', workOrderRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/remarks', remarkRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

