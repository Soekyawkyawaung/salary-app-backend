const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- Configure CORS to allow your Netlify site ---
// IMPORTANT: Make sure this URL exactly matches your current Netlify site URL
const corsOptions = {
    origin: 'https://sunny-tartufo-ea81f7.netlify.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// --- End of CORS configuration ---

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

// --- Start the Simple HTTP Server ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});