const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- THIS IS THE CORRECTED CALCULATION ---
const calculateSalary = {
    $sum: {
        $switch: {
            branches: [
                {
                    case: { $eq: ['$paymentTypeAtTime', 'perPiece'] },
                    then: { $multiply: ['$quantity', '$rateAtTime'] }
                },
                {
                    case: { $eq: ['$paymentTypeAtTime', 'perHour'] },
                    then: { $multiply: ['$hoursWorked', '$rateAtTime'] }
                },
                {
                    case: { $eq: ['$paymentTypeAtTime', 'perDay'] },
                    then: '$rateAtTime'
                }
            ],
            default: 0
        }
    }
};

router.post('/calculate', protect, isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        const payroll = await WorkLog.aggregate([
            { $match: { workDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
            { $group: { _id: '$employeeId', totalSalary: calculateSalary } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
            { $unwind: '$employee' },
            { $project: { _id: 0, employeeName: '$employee.fullName', totalSalary: '$totalSalary' } }
        ]);
        res.json(payroll);
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});

router.get('/current-period-summary', protect, isAdmin, async (req, res) => {
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
        
        const payroll = await WorkLog.aggregate([
            { $match: { workDate: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: '$employeeId', totalSalary: calculateSalary } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
            { $unwind: '$employee' },
            { $project: { _id: 0, employeeName: '$employee.fullName', totalSalary: '$totalSalary' } }
        ]);
        
        res.json({ payroll, startDate, endDate });
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

module.exports = router;