// backend/routes/remarkRoutes.js
const express = require('express');
const router = express.Router();
const Remark = require('../models/remarkModel');
const { protect } = require('../middleware/authMiddleware'); // Assuming you have this

// 1. Get Remarks for a User
router.get('/users/:userId/remarks', protect, async (req, res) => {
    try {
        const remarks = await Remark.find({ employee: req.params.userId }).sort({ date: -1 });
        res.json(remarks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2. Add Remark
router.post('/users/:userId/remarks', protect, async (req, res) => {
    try {
        const { text, date } = req.body;
        const remark = await Remark.create({
            employee: req.params.userId,
            text,
            date: date || new Date()
        });
        res.status(201).json(remark);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 3. Update Remark
router.put('/remarks/:id', protect, async (req, res) => {
    try {
        const { text, date } = req.body;
        const remark = await Remark.findByIdAndUpdate(
            req.params.id,
            { text, date },
            { new: true }
        );
        res.json(remark);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 4. Delete Remark
router.delete('/remarks/:id', protect, async (req, res) => {
    try {
        await Remark.findByIdAndDelete(req.params.id);
        res.json({ message: 'Remark deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;