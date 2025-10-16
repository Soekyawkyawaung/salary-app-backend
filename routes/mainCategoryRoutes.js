const express = require('express');
const router = express.Router();
const MainCategory = require('../models/mainCategoryModel');
const Subcategory = require('../models/subcategoryModel'); // 1. Import the Subcategory model
const { protect, isAdmin } = require('../middleware/authMiddleware');

// GET all main categories
router.get('/', protect, async (req, res) => {
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

// --- THIS IS THE UPDATED DELETE LOGIC ---
// DELETE a main category and all its subcategories
router.delete('/:id', protect, isAdmin, async (req, res) => {
    try {
        const category = await MainCategory.findById(req.params.id);
        if (category) {
            // 2. Find and delete all subcategories that belong to this main category
            await Subcategory.deleteMany({ mainCategory: req.params.id });
            
            // 3. Then, delete the main category itself
            await category.deleteOne();
            
            res.json({ message: 'Main Category and its subcategories removed' });
        } else {
            res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;