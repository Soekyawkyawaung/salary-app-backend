// backend/routes/fineRoutes.js
const express = require('express');
const router = express.Router();
const Fine = require('../models/fineModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- GET SUMMARY (Grouped by Employee) ---
router.get('/summary', protect, isAdmin, async (req, res) => {
    try {
        // Find all fines that haven't been fully processed/archived if needed. 
        // For now, we show all "Pending" deduction fines or just all fines for the month.
        // Let's show all fines that are relevant.
        const fines = await Fine.find({}).populate('employee', 'fullName profilePictureUrl');
        
        const employeeMap = {};
        
        fines.forEach(fine => {
            const empId = fine.employee?._id.toString();
            if (!empId) return;
            
            if (!employeeMap[empId]) {
                employeeMap[empId] = {
                    employee: fine.employee,
                    totalFines: 0,
                    lastDate: fine.date
                };
            }
            employeeMap[empId].totalFines += fine.amount;
            if (new Date(fine.date) > new Date(employeeMap[empId].lastDate)) {
                employeeMap[empId].lastDate = fine.date;
            }
        });

        res.json(Object.values(employeeMap));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching fine summary' });
    }
});

// --- GET DETAILS FOR ONE EMPLOYEE ---
router.get('/employee/:employeeId', protect, isAdmin, async (req, res) => {
    try {
        const fines = await Fine.find({ employee: req.params.employeeId }).sort({ date: -1 });
        res.json(fines);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching fines' });
    }
});

// --- ADD FINE ---
router.post('/', protect, isAdmin, async (req, res) => {
    const { employeeId, amount, date, description } = req.body;
    try {
        const newFine = new Fine({
            employee: employeeId,
            amount: Number(amount),
            date: new Date(date),
            description
        });
        await newFine.save();
        res.status(201).json(newFine);
    } catch (error) {
        res.status(500).json({ message: 'Error creating fine' });
    }
});

// --- EDIT FINE ---
router.put('/:id', protect, isAdmin, async (req, res) => {
    try {
        const updated = await Fine.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Error updating fine' });
    }
});

// --- DELETE FINE ---
router.delete('/:id', protect, isAdmin, async (req, res) => {
    try {
        await Fine.findByIdAndDelete(req.params.id);
        res.json({ message: 'Fine deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting fine' });
    }
});

module.exports = router;