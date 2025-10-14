const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const https = require('https');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection ---
const uri = process.env.MONGO_URI;
mongoose.connect(uri)
    .then(() => console.log("MongoDB connection established successfully"))
    .catch(err => console.error("MongoDB connection error:", err));

// --- API Routes ---
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);
const mainCategoryRoutes = require('./routes/mainCategoryRoutes');
app.use('/api/main-categories', mainCategoryRoutes);
const subcategoryRoutes = require('./routes/subcategoryRoutes');
app.use('/api/subcategories', subcategoryRoutes);
const workLogRoutes = require('./routes/workLogRoutes');
app.use('/api/worklogs', workLogRoutes);
const payrollRoutes = require('./routes/payrollRoutes');
app.use('/api/payroll', payrollRoutes);

console.log("✅ --- FINAL SERVER CODE IS RUNNING --- ✅");

// --- SSL Options with the NEW filenames ---
const options = {
  key: fs.readFileSync('localhost+1-key.pem'), // Use the new key file
  cert: fs.readFileSync('localhost+1.pem')   // Use the new cert file
};

// --- Start the Secure Server ---
const PORT = process.env.PORT || 5001;
https.createServer(options, app).listen(PORT, () => {
    console.log(`Server is running securely on port: ${PORT}`);
});