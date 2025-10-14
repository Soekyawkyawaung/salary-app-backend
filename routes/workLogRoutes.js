const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const Subcategory = require('../models/subcategoryModel'); // Use the new model name
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Route to create a new work log
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
        });
        await workLog.save();
        res.status(201).json(workLog);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

// Get logged-in user's work logs
router.get('/my-logs', protect, async (req, res) => {
    try {
        // Corrected populate path
        const workLogs = await WorkLog.find({ employeeId: req.user.id }).populate('subcategoryId', 'name').sort({ workDate: -1 });
        res.json(workLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

// Get all work logs (for admin)
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        
        const workLogs = await WorkLog.find({}).populate('employeeId', 'fullName').populate('subcategoryId', 'name').sort({ workDate: -1 });
        res.json(workLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});




// UPDATED LOGIC: Calculate current salary
router.get('/current-salary', protect, async (req, res) => {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        let startDate, endDate;
        if (today.getDate() <= 15) {
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month, 15);
        } else {
            startDate = new Date(year, month, 16);
            endDate = new Date(year, month + 1, 0);
        }

        const workLogs = await WorkLog.find({
            employeeId: req.user.id,
            workDate: { $gte: startDate, $lte: endDate }
        });

       
let totalSalary = 0;
workLogs.forEach(log => {
    
    console.log(`Employee Log: Quantity=${log.quantity}, paymentAtTime=${log.paymentAtTime}`);
    totalSalary += log.quantity * log.paymentAtTime;
});
res.json({ totalSalary, startDate, endDate });

    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});



module.exports = router;