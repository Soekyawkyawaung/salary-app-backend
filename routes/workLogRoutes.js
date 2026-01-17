const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const Subcategory = require('../models/subcategoryModel'); // Needed for creating work logs
const { protect, isAdmin } = require('../middleware/authMiddleware');

// === CREATE a new work log ===
router.post('/', protect, async (req, res) => {
    try {
        const { subcategoryId, quantity, workDate, hoursWorked, location } = req.body;

        if (!subcategoryId || !workDate) {
            return res.status(400).json({ message: 'Subcategory ID and work date are required.' });
        }

        const subcat = await Subcategory.findById(subcategoryId).populate('mainCategory', 'name');
        if (!subcat) {
            return res.status(404).json({ message: 'Subcategory not found.' });
        }
        
        const mainCatName = subcat.mainCategory?.name;
        let locationValue = 'N/A'; 

        if (mainCatName === 'စာအုပ်ချုပ်') {
            const validLocations = ['Golden Falcon (၂၈လမ်း ဆိုင်)', 'ရွှေခေါင်းလောင်း စက်ရုံ'];
            if (!location || !validLocations.includes(location)) {
                return res.status(400).json({ 
                    message: 'Please select a valid location for "စာအုပ်ချုပ်".' 
                });
            }
            locationValue = location;
        }

        let quantityValue = 0;
        let hoursWorkedValue = 0;

        if (subcat.paymentType === 'perPiece' || subcat.paymentType === 'perDozen' || subcat.paymentType === 'ပိဿာ') {
            if (quantity === undefined || quantity === null || typeof quantity !== 'number' || quantity < 0) {
                return res.status(400).json({ message: `A valid, non-negative quantity is required.` });
            }
            quantityValue = quantity;
        } else if (subcat.paymentType === 'perHour') {
            if (hoursWorked === undefined || hoursWorked === null || typeof hoursWorked !== 'number' || hoursWorked < 0) {
                return res.status(400).json({ message: 'Valid, non-negative hours worked are required.' });
            }
            hoursWorkedValue = hoursWorked;
        } else if (subcat.paymentType === 'perDay') {
             quantityValue = 0;
             hoursWorkedValue = 0;
        }

        const workLog = new WorkLog({
            employeeId: req.user.id,
            subcategoryId,
            workDate: new Date(workDate),
            quantity: quantityValue,
            hoursWorked: hoursWorkedValue,
            rateAtTime: subcat.rate,
            paymentTypeAtTime: subcat.paymentType,
            subcategoryNameAtTime: subcat.name,
            paymentStatus: 'unpaid',
            location: locationValue 
        });

        await workLog.save();
        res.status(201).json(workLog);

    } catch (error) {
        console.error('Error creating work log:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server Error creating work log.', error: error.message });
    }
});

// === CREATE a new "Pann War" delivery log ===
router.post('/pannwar-delivery', protect, async (req, res) => {
    try {
        const { mainCategoryId, clothName, quantity, workDate } = req.body;

        if (!mainCategoryId || !clothName || !quantity || !workDate) {
            return res.status(400).json({ message: 'Main Category ID, Cloth Name, Quantity, and Work Date are required.' });
        }
        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            return res.status(400).json({ message: 'A valid, positive quantity is required.' });
        }
        const date = new Date(workDate);
         if (isNaN(date.getTime())) {
             return res.status(400).json({ message: 'Invalid Work Date provided.' });
         }

        const workLog = new WorkLog({
            employeeId: req.user.id,
            mainCategoryId: mainCategoryId,
            workDate: date,
            quantity: numQuantity,
            rateAtTime: 0, 
            paymentTypeAtTime: 'delivery',
            subcategoryNameAtTime: `Pann War Delivery: ${clothName.trim()}`, 
            paymentStatus: 'unpaid'
        });

        await workLog.save();
        res.status(201).json({ message: 'Pann War delivery logged successfully.', workLog });

    } catch (error) {
        console.error('Error creating Pann War delivery log:', error);
        res.status(500).json({ message: 'Server Error creating delivery log.', error: error.message });
    }
});

// === GET ALL work logs (for admin) ===
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear } = req.query;
      let query = { paymentTypeAtTime: { $ne: 'delivery' } };

        if (customDate) {
            const selectedDate = new Date(customDate);
            if (!isNaN(selectedDate)) {
                selectedDate.setUTCHours(0, 0, 0, 0); const nextDay = new Date(selectedDate); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                query.workDate = { $gte: selectedDate, $lt: nextDay };
            }
        } else if (customMonth) {
            const [yearStr, monthStr] = customMonth.split('-'); const year = parseInt(yearStr, 10); const month = parseInt(monthStr, 10);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                const monthStartDate = new Date(Date.UTC(year, month - 1, 1)); const monthEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
                query.workDate = { $gte: monthStartDate, $lte: monthEndDate };
            }
        } else if (selectedYear) {
             const year = parseInt(selectedYear, 10);
             if(!isNaN(year)) {
                const yearStartDate = new Date(Date.UTC(year, 0, 1)); const yearEndDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
                query.workDate = { $gte: yearStartDate, $lte: yearEndDate };
             }
        } else if (startDate && endDate) {
            const rangeStartDate = new Date(startDate); const rangeEndDate = new Date(endDate);
             if (!isNaN(rangeStartDate) && !isNaN(rangeEndDate)) {
                rangeStartDate.setUTCHours(0, 0, 0, 0); rangeEndDate.setUTCHours(23, 59, 59, 999);
                query.workDate = { $gte: rangeStartDate, $lte: rangeEndDate };
             }
        } else if (period && period !== 'all') {
            const today = new Date(); let periodStartDate, periodEndDate;
            const currentYearUTC = today.getUTCFullYear(); const currentMonthUTC = today.getUTCMonth(); const currentDayUTC = today.getUTCDate();
            switch (period) {
                case 'day': periodStartDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC)); periodEndDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC, 23, 59, 59, 999)); break;
                case 'month': periodStartDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, 1)); periodEndDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC + 1, 0, 23, 59, 59, 999)); break;
                case 'year': periodStartDate = new Date(Date.UTC(currentYearUTC, 0, 1)); periodEndDate = new Date(Date.UTC(currentYearUTC, 11, 31, 23, 59, 59, 999)); break;
                default: break;
            }
            if (periodStartDate && periodEndDate) {
                query.workDate = { $gte: periodStartDate, $lte: periodEndDate };
            }
        }

        const workLogs = await WorkLog.find(query)
            .populate('employeeId', 'fullName profilePictureUrl')
            .populate({
                path: 'subcategoryId',
                select: 'name mainCategory groupType',
                populate: { path: 'mainCategory', select: 'name' }
            })
             .populate('mainCategoryId', 'name')
            .sort({ workDate: -1, createdAt: -1 });

        res.json(workLogs);

    } catch (error) {
        console.error('Error in GET /all work logs:', error);
        res.status(500).json({ message: 'Server Error: Failed to fetch work logs.', error: error.message });
    }
});

// === GET LOGGED-IN USER'S work logs ===
router.get('/my-logs', protect, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear, paymentStatus } = req.query;
        const userId = req.user.id;

        let query = {
            employeeId: userId,
            paymentTypeAtTime: { $ne: 'delivery' }
        };

        if (paymentStatus && ['paid', 'unpaid'].includes(paymentStatus)) {
            query.paymentStatus = paymentStatus;
        }

        if (customDate) {
            const selectedDate = new Date(customDate);
            if (!isNaN(selectedDate)) {
                const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
                query.workDate = { $gte: startOfDay, $lte: endOfDay };
            }
        } else if (customMonth) {
            const [yearStr, monthStr] = customMonth.split('-');
            const year = parseInt(yearStr, 10); const month = parseInt(monthStr, 10);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                const monthStartDate = new Date(year, month - 1, 1);
                const monthEndDate = new Date(year, month, 0, 23, 59, 59, 999);
                query.workDate = { $gte: monthStartDate, $lte: monthEndDate };
            }
        } else if (selectedYear) {
            const year = parseInt(selectedYear, 10);
            if (!isNaN(year)) {
                const yearStartDate = new Date(year, 0, 1);
                const yearEndDate = new Date(year, 11, 31, 23, 59, 59, 999);
                query.workDate = { $gte: yearStartDate, $lte: yearEndDate };
            }
        } else if (startDate && endDate) {
            const rangeStartDate = new Date(startDate); const rangeEndDate = new Date(endDate);
            if (!isNaN(rangeStartDate) && !isNaN(rangeEndDate)) {
                rangeStartDate.setHours(0, 0, 0, 0); rangeEndDate.setHours(23, 59, 59, 999);
                query.workDate = { $gte: rangeStartDate, $lte: rangeEndDate };
            }
        } else if (period && period !== 'all') {
            const today = new Date();
            let periodStartDate, periodEndDate;
            const currentYear = today.getFullYear(); const currentMonth = today.getMonth(); const currentDay = today.getDate();

            switch (period) {
                case 'day': periodStartDate = new Date(currentYear, currentMonth, currentDay); periodEndDate = new Date(currentYear, currentMonth, currentDay, 23, 59, 59, 999); break;
                case 'month': periodStartDate = new Date(currentYear, currentMonth, 1); periodEndDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999); break;
                case 'year': periodStartDate = new Date(currentYear, 0, 1); periodEndDate = new Date(currentYear, 11, 31, 23, 59, 59, 999); break;
                default: break;
            }
            if (periodStartDate && periodEndDate) {
                query.workDate = { $gte: periodStartDate, $lte: periodEndDate };
            }
        }

        const workLogs = await WorkLog.find(query)
            .populate('employeeId', 'fullName')
            .populate({
                path: 'subcategoryId',
                select: 'name mainCategory groupType',
                populate: { path: 'mainCategory', select: 'name' }
            })
            .sort({ workDate: -1, createdAt: -1 });

        res.json(workLogs);

    } catch (error) {
        console.error("Error in /my-logs route:", error);
        res.status(500).json({ message: 'Server Error fetching user logs.', error: error.message });
    }
});

// === GET PANN WAR DELIVERIES ===
router.get('/pannwar-deliveries', protect, async (req, res) => {
    try {
        const deliveryLogs = await WorkLog.find({ employeeId: req.user.id, paymentTypeAtTime: 'delivery' })
        .populate('mainCategoryId', 'name')
        .sort({ workDate: -1, createdAt: -1 });
        res.json(deliveryLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error fetching logs.', error: error.message }); }
});

router.get('/pannwar-deliveries/all', protect, isAdmin, async (req, res) => {
    try {
        const allDeliveryLogs = await WorkLog.find({ paymentTypeAtTime: 'delivery' })
        .populate('employeeId', 'fullName')
        .populate('mainCategoryId', 'name')
        .sort({ workDate: -1, createdAt: -1 });
        res.json(allDeliveryLogs);
    } catch (error) { res.status(500).json({ message: 'Server Error fetching logs.', error: error.message }); }
});

// === GET CURRENT SALARY (EMPLOYEE) ===
router.get('/current-salary', protect, async (req, res) => {
    try {
        const { type } = req.query; // 'monthly' or 'semi-monthly'
        const today = new Date();
        const year = today.getUTCFullYear(); 
        const month = today.getUTCMonth(); 
        const currentDay = today.getUTCDate(); 
        
        let startDate, queryEndDate;

        if (type === 'semi-monthly') {
            if (currentDay <= 15) {
                // 1-15
                startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
                queryEndDate = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
            } else {
                // 16-End
                startDate = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
                queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)); 
            }
        } else {
            // Monthly
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            queryEndDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        }

        // --- Create Safe Display Date ---
        const displayEndDate = new Date(queryEndDate);
        displayEndDate.setUTCHours(0, 0, 0, 0);

        const workLogs = await WorkLog.find({
            employeeId: req.user.id,
            workDate: { $gte: startDate, $lte: queryEndDate }, // Use precise end date for query
            paymentTypeAtTime: { $ne: 'delivery' }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
            let salary = 0;
            const rate = log.rateAtTime || 0;
            
            if (log.isAdminEdited && log.editedTotalPayment != null) {
                totalSalary += log.editedTotalPayment;
                return;
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
            totalSalary += salary;
        });

        res.json({ 
            totalSalary, 
            startDate: startDate.toISOString(), 
            endDate: displayEndDate.toISOString() // Send safe date
        });

    } catch (error) {
        console.error("Error in /current-salary route:", error);
        res.status(500).json({ message: "Server Error calculating current salary.", error: error.message });
    }
});

// === MARK work log as paid (admin only) ===
router.put('/:id/mark-paid', protect, isAdmin, async (req, res) => {
    try {
        const workLog = await WorkLog.findById(req.params.id);
        if (!workLog) return res.status(404).json({ message: 'Work log not found.' });
        
        workLog.paymentStatus = 'paid';
        workLog.paymentDate = new Date();
        const updatedLog = await workLog.save();
        await updatedLog.populate('employeeId', 'fullName');

        res.json({
            message: 'Work log marked as paid successfully.',
            workLog: {
                _id: updatedLog._id,
                employeeName: updatedLog.employeeId?.fullName || 'N/A',
                workDate: updatedLog.workDate,
                paymentStatus: updatedLog.paymentStatus,
                paymentDate: updatedLog.paymentDate,
                subcategoryNameAtTime: updatedLog.subcategoryNameAtTime,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error marking log as paid.', error: error.message });
    }
});

router.put('/mark-all-paid', protect, isAdmin, async (req, res) => {
    try {
        const { logIds } = req.body;
        if (!Array.isArray(logIds) || logIds.length === 0) {
            return res.status(400).json({ message: 'An array of log IDs is required.' });
        }
        const updateResult = await WorkLog.updateMany(
            { _id: { $in: logIds }, paymentStatus: { $ne: 'paid' } }, 
            { $set: { paymentStatus: 'paid', paymentDate: new Date() } }
        );
        res.json({ message: `Successfully marked ${updateResult.nModified} logs as paid.` });
    } catch (error) {
        res.status(500).json({ message: 'Server Error marking all logs as paid.', error: error.message });
    }
});

// === GET ALL WORKLOGS FOR A SPECIFIC EMPLOYEE (Admin - for detail page) ===
router.get('/employee/:employeeId', protect, isAdmin, async (req, res) => {
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

        const query = {
            employeeId: employeeId,
            workDate: { $gte: startDate, $lte: queryEndDate },
            paymentTypeAtTime: { $ne: 'delivery' }
        };

        const workLogs = await WorkLog.find(query)
                                     .populate('subcategoryId', 'name') 
                                     .sort({ workDate: -1 });

        res.json(workLogs);

    } catch (error) {
        console.error("Error fetching employee work logs:", error);
        res.status(500).json({ message: 'Server error fetching employee work logs.' });
    }
});

router.put('/:id/edit-payment', protect, isAdmin, async (req, res) => {
    try {
        const { newAmount } = req.body;
        if (newAmount === undefined || newAmount === null || newAmount < 0) return res.status(400).json({ message: 'Invalid amount.' });
        const workLog = await WorkLog.findById(req.params.id);
        if (!workLog) return res.status(404).json({ message: 'Work log not found.' });
        workLog.editedTotalPayment = Number(newAmount);
        workLog.isAdminEdited = true;
        const updatedLog = await workLog.save();
        await updatedLog.populate('employeeId', 'fullName');
        await updatedLog.populate('subcategoryId', 'name');
        res.json({ message: 'Payment updated', workLog: updatedLog });
    } catch (error) { res.status(500).json({ message: 'Server Error editing payment.', error: error.message }); }
});

router.put('/:id/update-quantity', protect, isAdmin, async (req, res) => {
    try {
        const { newQuantity } = req.body;
        if (newQuantity === undefined || newQuantity === null || newQuantity < 0) return res.status(400).json({ message: 'Invalid quantity.' });
        const workLog = await WorkLog.findById(req.params.id);
        if (!workLog) return res.status(404).json({ message: 'Work log not found.' });
        if (workLog.paymentTypeAtTime === 'perHour') {
            workLog.hoursWorked = Number(newQuantity);
        } else {
            workLog.quantity = Number(newQuantity);
        }
        workLog.isAdminEdited = true;
        const updatedLog = await workLog.save();
        await updatedLog.populate('employeeId', 'fullName');
        await updatedLog.populate({ path: 'subcategoryId', select: 'name mainCategory groupType', populate: { path: 'mainCategory', select: 'name' } });
        res.json({ message: 'Work log updated', workLog: updatedLog });
    } catch (error) { res.status(500).json({ message: 'Server Error updating log.', error: error.message }); }
});

router.put('/group/:conversationId', protect, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { groupName, groupNotice } = req.body;
        const updatedChat = await Conversation.findByIdAndUpdate(conversationId, { $set: { groupName, groupNotice } }, { new: true }).populate("participants", "fullName profilePictureUrl").populate("groupAdmin", "fullName");
        if (!updatedChat) return res.status(404).json({ message: "Chat not found" });
        res.status(200).json(updatedChat);
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

module.exports = router;