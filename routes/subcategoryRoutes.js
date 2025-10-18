const express = require('express');
const router = express.Router();
const Subcategory = require('../models/subcategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// GET all subcategories
router.get('/', async (req, res) => {
    try {
        // Add .populate() to get the name from the linked MainCategory
        const subcategories = await Subcategory.find({}).populate('mainCategory', 'name');
        res.json(subcategories);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST a new subcategory
router.post('/', protect, isAdmin, async (req, res) => {
    try {
        const { name, mainCategory, paymentType, rate } = req.body;
        const subcategory = new Subcategory({ name, mainCategory, paymentType, rate });
        const createdSubcategory = await subcategory.save();
        res.status(201).json(createdSubcategory);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE a subcategory
router.delete('/:id', protect, isAdmin, async (req, res) => {
    try {
        const subcategory = await Subcategory.findById(req.params.id);
        if (subcategory) {
            await subcategory.deleteOne();
            res.json({ message: 'Subcategory removed' });
        } else {
            res.status(404).json({ message: 'Subcategory not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// UPDATE a subcategory - now supports both name and rate
router.put('/:id', protect, isAdmin, async (req, res) => {
    try {
        const { name, rate } = req.body;
        const subcategory = await Subcategory.findById(req.params.id);

        if (subcategory) {
            // Update both name and rate
            if (name !== undefined) subcategory.name = name;
            if (rate !== undefined) subcategory.rate = rate;
            
            const updatedSubcategory = await subcategory.save();
            
            // Populate the mainCategory field before sending response
            await updatedSubcategory.populate('mainCategory', 'name');
            
            res.json(updatedSubcategory);
        } else {
            res.status(404).json({ message: 'Subcategory not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

module.exports = router;