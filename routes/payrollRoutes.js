// routes/payrollRoutes.js
const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- Helper function to calculate salary for a single log ---
const calculateLogSalary = (log) => {
    let salary = 0;
    const rate = log.rateAtTime || 0;
    switch (log.paymentTypeAtTime) {
        case 'perPiece':
        case 'perDozen':
            salary = (log.quantity || 0) * rate;
            break;
        case 'perHour':
            salary = (log.hoursWorked || 0) * rate;
            break;
        case 'perDay':
            salary = rate; // Assuming 1 day
            break;
        default:
            break;
    }
    return salary;
};

// --- NEW ROUTE: Get TOTAL salary summary for Admin Dashboard ---
router.get('/current-period-summary', protect, isAdmin, async (req, res) => {
    const now = new Date();
    let startDate, endDate;
    
    if (now.getDate() <= 15) {
        // First half of the month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);
    } else {
        // Second half of the month
        startDate = new Date(now.getFullYear(), now.getMonth(), 16);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // 0th day of next month is last day of current
    }

    try {
        // Find all logs within the current period
        const workLogs = await WorkLog.find({
            workDate: { $gte: startDate, $lte: endDate }
        }).populate('employeeId', 'fullName'); // Populate employee info

        // Use a Map to aggregate salary by employee
        const payrollMap = new Map();

        workLogs.forEach(log => {
            const employeeId = log.employeeId?._id.toString();
            if (!employeeId) return; // Skip logs without a valid employee

            const employeeName = log.employeeId.fullName;
            const logSalary = calculateLogSalary(log);

            if (!payrollMap.has(employeeId)) {
                payrollMap.set(employeeId, {
                    employeeId: employeeId,
                    fullName: employeeName,
                    totalSalary: 0,
                    logCount: 0
                });
            }

            const employeeData = payrollMap.get(employeeId);
            employeeData.totalSalary += logSalary;
            employeeData.logCount += 1;
        });

        // Convert map values to an array for the response
        const payroll = Array.from(payrollMap.values());

        res.json({
            startDate,
            endDate,
            payroll // The detailed breakdown per employee
        });

    } catch (error) {
        console.error("Error fetching current period summary:", error);
        res.status(500).json({ message: 'Server error fetching salary summary.' });
    }
});


// --- GET SALARY SUMMARY FOR A SPECIFIC EMPLOYEE (for detail page) ---
// --- GET SALARY SUMMARY FOR A SPECIFIC EMPLOYEE (for detail page) ---
router.get('/employee-summary/:employeeId', protect, isAdmin, async (req, res) => {
    const { employeeId } = req.params;
    const { period } = req.query; // 'firstHalf' or 'secondHalf'

    const now = new Date();
    let startDate, endDate;

    if (period === 'secondHalf') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 16);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);
    }

    try {
        const workLogs = await WorkLog.find({
            employeeId: employeeId,
            workDate: { $gte: startDate, $lte: endDate }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
            totalSalary += calculateLogSalary(log); // Use the helper function
        });

        res.json({
            totalSalary,
            startDate,
            endDate,
            period,
            workLogCount: workLogs.length
        });

    } catch (error) {
        console.error("Error calculating employee salary:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;