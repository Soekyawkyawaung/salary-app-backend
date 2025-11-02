const express = require('express');
const router = express.Router();
const Subcategory = require('../models/subcategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- THIS IS THE FIX ---
// GET all subcategories (Added 'protect' middleware)
router.get('/', protect, async (req, res) => {
// --- END FIX ---
    try {
        // Add .populate() to get the name from the linked MainCategory
        const subcategories = await Subcategory.find({}).populate('mainCategory', 'name');
        res.json(subcategories);
    } catch (error) {
        console.error('Error fetching subcategories:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});
// POST a new subcategory
router.post('/', protect, isAdmin, async (req, res) => {
    try {
        const { name, mainCategory, paymentType, rate } = req.body;
        
        if (!name || !mainCategory || !paymentType || !rate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // --- ADDED "ပိဿာ" TO THIS LIST ---
        const validPaymentTypes = ['perPiece', 'perDozen', 'perHour', 'perDay', 'ပိဿာ'];
        if (!validPaymentTypes.includes(paymentType)) {
            return res.status(400).json({ 
                message: `Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}` 
            });
        }

        const subcategory = new Subcategory({ name, mainCategory, paymentType, rate });
        const createdSubcategory = await subcategory.save();
        res.status(201).json(createdSubcategory);
    } catch (error) {
        console.error('Error creating subcategory:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
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
        console.error('Error deleting subcategory:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// UPDATE a subcategory
router.put('/:id', protect, isAdmin, async (req, res) => {
    try {
        const { name, rate, paymentType } = req.body;
        const subcategory = await Subcategory.findById(req.params.id);

        if (!subcategory) {
            return res.status(4404).json({ message: 'Subcategory not found' });
        }

        if (name !== undefined) subcategory.name = name;
        if (rate !== undefined) subcategory.rate = rate;
        if (paymentType !== undefined) {
            // --- ADDED "ပိဿာ" TO THIS LIST ---
            const validPaymentTypes = ['perPiece', 'perDozen', 'perHour', 'perDay', 'ပိဿာ'];
            if (!validPaymentTypes.includes(paymentType)) {
                return res.status(400).json({ 
                    message: `Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}` 
                });
            }
            subcategory.paymentType = paymentType;
        }
        
        const updatedSubcategory = await subcategory.save();
        
        await updatedSubcategory.populate('mainCategory', 'name');
        
        res.json(updatedSubcategory);
    } catch (error) {
        console.error('Error updating subcategory:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
module.exports = router;