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
            salary = rate;
            break;
        default:
            break;
    }
    return salary;
};

// --- Helper function to get period dates (FIXED with UTC) ---
const getPeriodDates = () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const currentDay = now.getUTCDate();
    
    let startDate, endDate;
    
    if (currentDay <= 15) {
        // First half: 1st to 15th (UTC)
        startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
    } else {
        // Second half: 16th to last day of month (UTC)
        startDate = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    }
    
    return { startDate, endDate };
};

// --- NEW ROUTE: Get TOTAL salary summary for Admin Dashboard ---
router.get('/current-period-summary', protect, isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = getPeriodDates();

        console.log('📅 Period dates (UTC):', {
            startUTC: startDate.toISOString(),
            endUTC: endDate.toISOString(),
            startLocal: startDate.toLocaleDateString(),
            endLocal: endDate.toLocaleDateString()
        });

        const workLogs = await WorkLog.find({
            workDate: { $gte: startDate, $lte: endDate }
        }).populate('employeeId', 'fullName');

        const payrollMap = new Map();

        workLogs.forEach(log => {
            const employeeId = log.employeeId?._id.toString();
            if (!employeeId) return;

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

        const payroll = Array.from(payrollMap.values());

        res.json({
            startDate: startDate.toISOString(), // Send as ISO string
            endDate: endDate.toISOString(), // Send as ISO string
            payroll
        });

    } catch (error) {
        console.error("Error fetching current period summary:", error);
        res.status(500).json({ message: 'Server error fetching salary summary.' });
    }
});

// --- GET SALARY SUMMARY FOR A SPECIFIC EMPLOYEE ---
router.get('/employee-summary/:employeeId', protect, isAdmin, async (req, res) => {
    const { employeeId } = req.params;
    const { period } = req.query; // 'firstHalf' or 'secondHalf'

    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        let startDate, endDate;

        if (period === 'secondHalf') {
            startDate = new Date(year, month, 16);
            endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        } else {
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month, 15, 23, 59, 59, 999);
        }

        console.log('📅 Employee period dates:', {
            period,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            startLocal: startDate.toLocaleDateString(),
            endLocal: endDate.toLocaleDateString()
        });

        const workLogs = await WorkLog.find({
            employeeId: employeeId,
            workDate: { $gte: startDate, $lte: endDate }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
            totalSalary += calculateLogSalary(log);
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