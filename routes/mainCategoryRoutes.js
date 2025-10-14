const express = require('express');
const router = express.Router();
const MainCategory = require('../models/mainCategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// GET all main categories
router.get('/', protect, isAdmin, async (req, res) => {
    try {
        const categories = await MainCategory.find({});
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST a new main category
router.post('/', protect, isAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        const category = new MainCategory({ name });
        const createdCategory = await category.save();
        res.status(201).json(createdCategory);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;