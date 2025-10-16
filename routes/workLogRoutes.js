const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const Subcategory = require('../models/subcategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Create a new work log
router.post('/', protect, async (req, res) => {
    try {
        const { subcategoryId, quantity, workDate, hoursWorked } = req.body;
        const subcat = await Subcategory.findById(subcategoryId);
        if (!subcat) { return res.status(404).json({ message: 'Subcategory not found' }); }

        const workLog = new WorkLog({
            employeeId: req.user.id,
            subcategoryId,
            quantity: subcat.paymentType === 'perPiece' ? quantity : 0,
            hoursWorked: subcat.paymentType === 'perHour' ? hoursWorked : 0,
            workDate,
            rateAtTime: subcat.rate,
            paymentTypeAtTime: subcat.paymentType,
            subcategoryNameAtTime: subcat.name
        });
        await workLog.save();
        res.status(201).json(workLog);
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// Get logged-in user's work logs
router.get('/my-logs', protect, async (req, res) => {
    try {
        const workLogs = await WorkLog.find({ employeeId: req.user.id }).sort({ workDate: -1, createdAt: -1 });
        res.json(workLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

// Get all work logs (for admin)
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        const workLogs = await WorkLog.find({}).populate('employeeId', 'fullName').sort({ workDate: -1, createdAt: -1 });
        res.json(workLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

// --- THIS IS THE CORRECTED CALCULATION ---
router.get('/current-salary', protect, async (req, res) => {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        let startDate, endDate;
        if (today.getDate() <= 15) {
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month, 15, 23, 59, 59);
        } else {
            startDate = new Date(year, month, 16);
            endDate = new Date(year, month + 1, 0, 23, 59, 59);
        }

        const workLogs = await WorkLog.find({
            employeeId: req.user.id,
            workDate: { $gte: startDate, $lte: endDate }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
            if (log.paymentTypeAtTime === 'perPiece') {
                totalSalary += (log.quantity || 0) * (log.rateAtTime || 0);
            } else if (log.paymentTypeAtTime === 'perHour') {
                totalSalary += (log.hoursWorked || 0) * (log.rateAtTime || 0);
            } else if (log.paymentTypeAtTime === 'perDay') {
                totalSalary += (log.rateAtTime || 0);
            }
        });
        
        res.json({ totalSalary, startDate, endDate });
    } catch (error) {
        console.error("Error in /current-salary route:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

module.exports = router;