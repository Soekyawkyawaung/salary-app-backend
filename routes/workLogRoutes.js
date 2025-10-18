const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const Subcategory = require('../models/subcategoryModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Create a new work log
router.post('/', protect, async (req, res) => {
    try {
        const { subcategoryId, quantity, workDate, hoursWorked } = req.body;
        
        // Input validation
        if (!subcategoryId || !workDate) {
            return res.status(400).json({ message: 'Subcategory ID and work date are required' });
        }

        const subcat = await Subcategory.findById(subcategoryId);
        if (!subcat) { 
            return res.status(404).json({ message: 'Subcategory not found' }); 
        }

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
    } catch (error) { 
        res.status(500).json({ message: 'Server Error', error: error.message }); 
    }
});

// Get all work logs (for admin) WITH PROPER FILTERING
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear } = req.query;
        
        console.log('Filter parameters received:', { period, startDate, endDate, customDate, customMonth, selectedYear });

        let query = {};

        // Handle custom date (single day)
        if (customDate) {
            const selectedDate = new Date(customDate);
            const nextDay = new Date(selectedDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            query.workDate = { 
                $gte: selectedDate, 
                $lt: nextDay
            };
            console.log(`Using custom date filter: ${customDate}`);
        }
        // Handle custom month
        else if (customMonth) {
            const [year, month] = customMonth.split('-');
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999);
            
            query.workDate = { 
                $gte: startDate, 
                $lte: endDate 
            };
            console.log(`Using custom month filter: ${customMonth}`);
        }
        // Handle selected year
        else if (selectedYear) {
            const startDate = new Date(selectedYear, 0, 1);
            const endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
            
            query.workDate = { 
                $gte: startDate, 
                $lte: endDate 
            };
            console.log(`Using selected year filter: ${selectedYear}`);
        }
        // Handle custom date range (priority over period)
        else if (startDate && endDate) {
            query.workDate = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
            console.log(`Using custom date range: ${startDate} to ${endDate}`);
        }
        // Handle period filtering if no custom dates
        else if (period && period !== 'all') {
            const today = new Date();
            let periodStartDate, periodEndDate;

            switch (period) {
                case 'day':
                    periodStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    periodEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
                    break;
                case 'month':
                    periodStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    periodEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'year':
                    periodStartDate = new Date(today.getFullYear(), 0, 1);
                    periodEndDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
                    break;
                default:
                    // No date filtering for unknown periods
                    break;
            }

            if (periodStartDate && periodEndDate) {
                query.workDate = { 
                    $gte: periodStartDate, 
                    $lte: periodEndDate 
                };
                console.log(`Using period date range: ${periodStartDate} to ${periodEndDate}`);
            }
        }

        console.log('Final query:', JSON.stringify(query));

        const workLogs = await WorkLog.find(query)
            .populate('employeeId', 'fullName')
            .sort({ workDate: -1, createdAt: -1 });

        console.log(`Found ${workLogs.length} logs with server-side filtering`);
        
        res.json(workLogs);
    } catch (error) { 
        console.error("Error in /all route:", error);
        res.status(500).json({ message: 'Server Error', error: error.message }); 
    }
});

// Get logged-in user's work logs WITH PERIOD FILTERING AND CUSTOM DATE RANGES
router.get('/my-logs', protect, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear } = req.query;
        const userId = req.user.id;
        
        console.log(`Fetching logs for user: ${userId}`, { period, startDate, endDate, customDate, customMonth, selectedYear });

        let query = { employeeId: userId };
        
        // Handle custom date (single day)
        if (customDate) {
            const selectedDate = new Date(customDate);
            const nextDay = new Date(selectedDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            query.workDate = { 
                $gte: selectedDate, 
                $lt: nextDay
            };
            console.log(`Using custom date filter: ${customDate}`);
        }
        // Handle custom month
        else if (customMonth) {
            const [year, month] = customMonth.split('-');
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999);
            
            query.workDate = { 
                $gte: startDate, 
                $lte: endDate 
            };
            console.log(`Using custom month filter: ${customMonth}`);
        }
        // Handle selected year
        else if (selectedYear) {
            const startDate = new Date(selectedYear, 0, 1);
            const endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
            
            query.workDate = { 
                $gte: startDate, 
                $lte: endDate 
            };
            console.log(`Using selected year filter: ${selectedYear}`);
        }
        // Handle custom date range (priority over period)
        else if (startDate && endDate) {
            query.workDate = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
            console.log(`Using custom date range: ${startDate} to ${endDate}`);
        }
        // Handle period filtering if no custom dates
        else if (period && period !== 'all') {
            const today = new Date();
            let periodStartDate, periodEndDate;

            switch (period) {
                case 'day':
                    periodStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    periodEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
                    break;
                case 'month':
                    periodStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    periodEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'year':
                    periodStartDate = new Date(today.getFullYear(), 0, 1);
                    periodEndDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
                    break;
                default:
                    // No date filtering for unknown periods
                    break;
            }

            if (periodStartDate && periodEndDate) {
                query.workDate = { 
                    $gte: periodStartDate, 
                    $lte: periodEndDate 
                };
                console.log(`Using period date range: ${periodStartDate} to ${periodEndDate}`);
            }
        }

        console.log('Final query for my-logs:', JSON.stringify(query));

        const workLogs = await WorkLog.find(query).sort({ workDate: -1, createdAt: -1 });
        
        console.log(`Found ${workLogs.length} logs with server-side filtering`);
        res.json(workLogs);
        
    } catch (error) { 
        console.error("Error in /my-logs route:", error);
        res.status(500).json({ message: 'Server Error', error: error.message }); 
    }
});

// Current salary calculation
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