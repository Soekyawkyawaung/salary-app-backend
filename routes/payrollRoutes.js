// backend/routes/payrollRoutes.js
const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- Helper function to calculate salary for a single log ---
const calculateLogSalary = (log) => {
    let salary = 0;
    const rate = log.rateAtTime || 0;
    
    if (log.isAdminEdited && log.editedTotalPayment != null) {
        return log.editedTotalPayment;
    }

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

// --- GET TOTAL SALARY SUMMARY (Admin Dashboard) ---
router.get('/current-period-summary', protect, isAdmin, async (req, res) => {
    try {
        const { type } = req.query; 
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const currentDay = now.getUTCDate();
        
        let startDate, queryEndDate;

        // --- 1. Determine Dates (UTC) ---
        if (type === 'semi-monthly') {
            if (currentDay <= 15) {
                // 1st - 15th
                startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
                queryEndDate = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
            } else {
                // 16th - End
                startDate = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
                queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
            }
        } else {
            // Monthly (1st - End)
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        }

        // --- 2. Create a "Display" End Date ---
        // We clone the queryEndDate but set time to 00:00 UTC.
        // This prevents Myanmar Time (+06:30) from rolling it over to the next day.
        const displayEndDate = new Date(queryEndDate);
        displayEndDate.setUTCHours(0, 0, 0, 0);

        // --- 3. Query Database (Use queryEndDate to catch all logs until 23:59) ---
        const workLogs = await WorkLog.find({
            workDate: { $gte: startDate, $lte: queryEndDate },
            paymentTypeAtTime: { $ne: 'delivery' } 
        }).populate('employeeId', 'fullName');

        const payrollMap = new Map();

        workLogs.forEach(log => {
            if (!log.employeeId) return;
            const employeeId = log.employeeId._id.toString();
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
            startDate: startDate.toISOString(),
            endDate: displayEndDate.toISOString(), // Send the Safe Display Date
            payroll 
        });

    } catch (error) {
        console.error("Error fetching current period summary:", error);
        res.status(500).json({ message: 'Server error fetching salary summary.' });
    }
});

// --- GET SALARY SUMMARY FOR A SPECIFIC EMPLOYEE (Detail View) ---
router.get('/employee-summary/:employeeId', protect, isAdmin, async (req, res) => {
    const { employeeId } = req.params;
    const { period } = req.query; 

    try {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        
        let startDate, queryEndDate;

        if (period === 'monthly') {
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        } else if (period === 'secondHalf') {
            startDate = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
            queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        } else {
            // Default firstHalf
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            queryEndDate = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
        }

        // Safe Display Date
        const displayEndDate = new Date(queryEndDate);
        displayEndDate.setUTCHours(0, 0, 0, 0);

        const workLogs = await WorkLog.find({
            employeeId: employeeId,
            workDate: { $gte: startDate, $lte: queryEndDate },
            paymentTypeAtTime: { $ne: 'delivery' }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
            totalSalary += calculateLogSalary(log);
        });

        res.json({
            totalSalary,
            startDate: startDate.toISOString(),
            endDate: displayEndDate.toISOString(), // Send Safe Date
            period,
            workLogCount: workLogs.length
        });

    } catch (error) {
        console.error("Error calculating employee salary:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;