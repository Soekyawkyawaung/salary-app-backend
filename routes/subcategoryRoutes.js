// routes/subcategoryRoutes.js
const express = require('express');
const router = express.Router();
const Subcategory = require('../models/subcategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// GET all subcategories
router.get('/', protect, async (req, res) => {
    try {
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
        // Added groupType to destructuring
        const { name, mainCategory, paymentType, rate, groupType } = req.body;
        
        if (!name || !mainCategory || !paymentType || !rate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const validPaymentTypes = ['perPiece', 'perDozen', 'perHour', 'perDay', 'ပိဿာ'];
        if (!validPaymentTypes.includes(paymentType)) {
            return res.status(400).json({ 
                message: `Invalid payment type. Must be one of: ${validPaymentTypes.join(', ')}` 
            });
        }

        // Added groupType to creation
        const subcategory = new Subcategory({ name, mainCategory, paymentType, rate, groupType });
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

// UPDATE (PUT) Route
router.put('/:id', protect, isAdmin, async (req, res) => {
    try {
        // Added groupType to destructuring
        const { name, rate, paymentType, mainCategory, groupType } = req.body;
        
        const subcategory = await Subcategory.findById(req.params.id);

        if (!subcategory) {
            return res.status(404).json({ message: 'Subcategory not found' });
        }

        if (name !== undefined) subcategory.name = name;
        if (rate !== undefined) subcategory.rate = rate;
        if (mainCategory !== undefined) subcategory.mainCategory = mainCategory;
        
        // Update groupType if provided
        if (groupType !== undefined) {
            subcategory.groupType = groupType;
        }

        if (paymentType !== undefined) {
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

// Reorder Route
router.post('/reorder', protect, isAdmin, async (req, res) => {
    try {
        const { newOrder } = req.body; 

        if (!Array.isArray(newOrder)) {
            return res.status(400).json({ message: 'Invalid data' });
        }

        const bulkOps = newOrder.map(item => ({
            updateOne: {
                filter: { _id: item.id },
                update: { $set: { order: item.order } } 
            }
        }));

        if (bulkOps.length > 0) {
            await Subcategory.bulkWrite(bulkOps);
        }

        res.json({ message: 'Order updated' });
    } catch (error) {
        console.error('Error reordering:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;