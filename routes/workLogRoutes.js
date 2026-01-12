const express = require('express');
const router = express.Router();
const WorkLog = require('../models/workLogModel');
const Subcategory = require('../models/subcategoryModel'); // Needed for creating work logs
const { protect, isAdmin } = require('../middleware/authMiddleware');

// === CREATE a new work log ===
router.post('/', protect, async (req, res) => {
    try {
        // --- 1. Destructure new 'location' field ---
        const { subcategoryId, quantity, workDate, hoursWorked, location } = req.body;

        if (!subcategoryId || !workDate) {
            return res.status(400).json({ message: 'Subcategory ID and work date are required.' });
        }

        // --- 2. Populate mainCategory to check its name ---
        const subcat = await Subcategory.findById(subcategoryId).populate('mainCategory', 'name');
        if (!subcat) {
            return res.status(404).json({ message: 'Subcategory not found.' });
        }
        
        // --- 3. Add Location Validation ---
        const mainCatName = subcat.mainCategory?.name;
        let locationValue = 'N/A'; // Default location

        if (mainCatName === 'စာအုပ်ချုပ်') {
            const validLocations = ['Golden Falcon (၂၈လမ်း ဆိုင်)', 'ရွှေခေါင်းလောင်း စက်ရုံ'];
            if (!location || !validLocations.includes(location)) {
                return res.status(400).json({ 
                    message: 'Please select a valid location for "စာအုပ်ချုပ်".' 
                });
            }
            locationValue = location;
        }
        // --- End Location Validation ---

        // --- (Existing quantity/hours logic) ---
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
        // --- End quantity/hours logic ---

        // --- 4. Create and Save Work Log (add 'location') ---
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
            location: locationValue // --- Add this line ---
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

// === *** ADD THIS ROUTE BACK *** ===
// === CREATE a new "Pann War" delivery log ===
router.post('/pannwar-delivery', protect, async (req, res) => {
    try {
        // Get data from the frontend
        const { mainCategoryId, clothName, quantity, workDate } = req.body;

        // --- Input Validation ---
        if (!mainCategoryId || !clothName || !quantity || !workDate) {
            return res.status(400).json({ message: 'Main Category ID, Cloth Name, Quantity, and Work Date are required.' });
        }
        // Ensure quantity is a positive number
        const numQuantity = Number(quantity);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            return res.status(400).json({ message: 'A valid, positive quantity is required.' });
        }
        // Ensure workDate is valid
        const date = new Date(workDate);
         if (isNaN(date.getTime())) {
             return res.status(400).json({ message: 'Invalid Work Date provided.' });
         }


        // --- Create and Save the Special Work Log ---
        const workLog = new WorkLog({
            employeeId: req.user.id,
            // subcategoryId: null, // No specific subcategory
            mainCategoryId: mainCategoryId, // Store the main category ID
            workDate: date, // Use validated date object
            quantity: numQuantity, // Use validated quantity
            // hoursWorked: 0, // Not applicable
            rateAtTime: 0, // Or null, as there's no rate for this action
            paymentTypeAtTime: 'delivery', // Use a distinct payment type
            subcategoryNameAtTime: `Pann War Delivery: ${clothName.trim()}`, // Store cloth name here
            paymentStatus: 'unpaid' // Or 'na' if it doesn't affect payment
        });

        await workLog.save();
        res.status(201).json({ message: 'Pann War delivery logged successfully.', workLog });

    } catch (error) {
        console.error('Error creating Pann War delivery log:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Server Error creating delivery log.', error: error.message });
    }
});
// === *** END OF ADDED ROUTE *** ===


// === GET ALL work logs (for admin) WITH FILTERING & POPULATION ===
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear } = req.query;
        console.log('Admin /all filters received:', { period, startDate, endDate, customDate, customMonth, selectedYear });
      let query = { paymentTypeAtTime: { $ne: 'delivery' } };

        // --- Date Filtering Logic ---
        if (customDate) {
            const selectedDate = new Date(customDate);
            if (!isNaN(selectedDate)) {
                selectedDate.setUTCHours(0, 0, 0, 0); const nextDay = new Date(selectedDate); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                query.workDate = { $gte: selectedDate, $lt: nextDay };
                console.log(`Using custom date filter (UTC): ${selectedDate.toISOString()} to ${nextDay.toISOString()}`);
            }
        } else if (customMonth) {
            const [yearStr, monthStr] = customMonth.split('-'); const year = parseInt(yearStr, 10); const month = parseInt(monthStr, 10);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                const monthStartDate = new Date(Date.UTC(year, month - 1, 1)); const monthEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
                query.workDate = { $gte: monthStartDate, $lte: monthEndDate };
                console.log(`Using custom month filter (UTC): ${monthStartDate.toISOString()} to ${monthEndDate.toISOString()}`);
            }
        } else if (selectedYear) {
             const year = parseInt(selectedYear, 10);
             if(!isNaN(year)) {
                const yearStartDate = new Date(Date.UTC(year, 0, 1)); const yearEndDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
                query.workDate = { $gte: yearStartDate, $lte: yearEndDate };
                console.log(`Using selected year filter (UTC): ${yearStartDate.toISOString()} to ${yearEndDate.toISOString()}`);
             }
        } else if (startDate && endDate) {
            const rangeStartDate = new Date(startDate); const rangeEndDate = new Date(endDate);
             if (!isNaN(rangeStartDate) && !isNaN(rangeEndDate)) {
                rangeStartDate.setUTCHours(0, 0, 0, 0); rangeEndDate.setUTCHours(23, 59, 59, 999);
                query.workDate = { $gte: rangeStartDate, $lte: rangeEndDate };
                console.log(`Using custom date range (UTC): ${rangeStartDate.toISOString()} to ${rangeEndDate.toISOString()}`);
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
                console.log(`Using period date range (${period}) (UTC): ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`);
            }
        }
        // --- End Date Filtering ---

        console.log('Final query for /all:', JSON.stringify(query));

        // --- Find Logs, Populate Both, and Sort ---
        const workLogs = await WorkLog.find(query)
            .populate('employeeId', 'fullName profilePictureUrl')
            .populate({
                path: 'subcategoryId',
                select: 'name mainCategory groupType',
                populate: {
                    path: 'mainCategory',
                    select: 'name'
                }
            })
             // Also populate mainCategoryId if it exists (for Pann War logs)
             .populate('mainCategoryId', 'name')
            .sort({ workDate: -1, createdAt: -1 });

        console.log(`Successfully fetched ${workLogs.length} work logs for admin.`);
        res.json(workLogs);

    } catch (error) {
        console.error('Error in GET /all work logs:', error);
        res.status(500).json({
             message: 'Server Error: Failed to fetch work logs.',
             error: error.message,
             ...(error.name === 'StrictPopulateError' && { path: error.path })
        });
    }
});


// === GET LOGGED-IN USER'S work logs (excluding Pann War deliveries) ===
router.get('/my-logs', protect, async (req, res) => {
    try {
        const { period, startDate, endDate, customDate, customMonth, selectedYear, paymentStatus } = req.query;
        const userId = req.user.id;
        console.log(`Fetching STANDARD logs for user: ${userId}`, { period, startDate, endDate, customDate, customMonth, selectedYear, paymentStatus });

        let query = {
            employeeId: userId,
            // Exclude delivery logs
            paymentTypeAtTime: { $ne: 'delivery' }
        };

        // Add payment status filter
        if (paymentStatus && ['paid', 'unpaid'].includes(paymentStatus)) {
            query.paymentStatus = paymentStatus;
        }

        // --- CORRECTED Date Filtering Logic ---
        if (customDate) {
            const selectedDate = new Date(customDate);
            if (!isNaN(selectedDate)) {
                const startOfDay = new Date(selectedDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(selectedDate);
                endOfDay.setHours(23, 59, 59, 999);
                query.workDate = { $gte: startOfDay, $lte: endOfDay };
                console.log(`Using custom date filter: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
            }
        } else if (customMonth) {
            const [yearStr, monthStr] = customMonth.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                const monthStartDate = new Date(year, month - 1, 1);
                const monthEndDate = new Date(year, month, 0, 23, 59, 59, 999);
                query.workDate = { $gte: monthStartDate, $lte: monthEndDate };
                console.log(`Using custom month filter: ${monthStartDate.toISOString()} to ${monthEndDate.toISOString()}`);
            }
        } else if (selectedYear) {
            const year = parseInt(selectedYear, 10);
            if (!isNaN(year)) {
                const yearStartDate = new Date(year, 0, 1);
                const yearEndDate = new Date(year, 11, 31, 23, 59, 59, 999);
                query.workDate = { $gte: yearStartDate, $lte: yearEndDate };
                console.log(`Using selected year filter: ${yearStartDate.toISOString()} to ${yearEndDate.toISOString()}`);
            }
        } else if (startDate && endDate) {
            const rangeStartDate = new Date(startDate);
            const rangeEndDate = new Date(endDate);
            if (!isNaN(rangeStartDate) && !isNaN(rangeEndDate)) {
                rangeStartDate.setHours(0, 0, 0, 0);
                rangeEndDate.setHours(23, 59, 59, 999);
                query.workDate = { $gte: rangeStartDate, $lte: rangeEndDate };
                console.log(`Using custom date range: ${rangeStartDate.toISOString()} to ${rangeEndDate.toISOString()}`);
            }
        } else if (period && period !== 'all') {
            const today = new Date();
            let periodStartDate, periodEndDate;

            // Use LOCAL dates instead of UTC
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const currentDay = today.getDate();

            switch (period) {
                case 'day':
                    periodStartDate = new Date(currentYear, currentMonth, currentDay);
                    periodEndDate = new Date(currentYear, currentMonth, currentDay, 23, 59, 59, 999);
                    break;
                case 'month':
                    periodStartDate = new Date(currentYear, currentMonth, 1);
                    periodEndDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
                    break;
                case 'year':
                    periodStartDate = new Date(currentYear, 0, 1);
                    periodEndDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
                    break;
                default:
                    break;
            }

            if (periodStartDate && periodEndDate) {
                query.workDate = { $gte: periodStartDate, $lte: periodEndDate };
                console.log(`Using period date range (${period}): ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`);
            }
        }
        // --- End Date Filtering ---

        console.log('Final query for /my-logs (excluding deliveries):', JSON.stringify(query));

        // --- Find Logs, Populate Both, and Sort ---
        const workLogs = await WorkLog.find(query)
            .populate('employeeId', 'fullName')
            .populate({
                path: 'subcategoryId',
                select: 'name mainCategory groupType',
                populate: {
                    path: 'mainCategory',
                    select: 'name'
                }
            })
            .sort({ workDate: -1, createdAt: -1 });

        console.log(`Found ${workLogs.length} standard logs for user ${userId}.`);
        res.json(workLogs);

    } catch (error) {
        console.error("Error in /my-logs route:", error);
        res.status(500).json({
            message: 'Server Error fetching user logs.',
            error: error.message,
            ...(error.name === 'StrictPopulateError' && { path: error.path })
        });
    }
});

// === GET PANN WAR DELIVERIES FOR LOGGED-IN USER ===
router.get('/pannwar-deliveries', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`Fetching Pann War delivery logs for user: ${userId}`);

        const deliveryLogs = await WorkLog.find({
            employeeId: userId,
            paymentTypeAtTime: 'delivery' // Only fetch delivery logs
        })
        .populate('mainCategoryId', 'name') // Populate the main category name
        .sort({ workDate: -1, createdAt: -1 }); // Sort by newest first

        console.log(`Found ${deliveryLogs.length} Pann War delivery logs for user ${userId}.`);
        res.json(deliveryLogs);

    } catch (error) {
        console.error("Error fetching Pann War delivery logs:", error);
        res.status(500).json({
            message: 'Server Error fetching Pann War delivery logs.',
            error: error.message
        });
    }
});

router.get('/pannwar-deliveries/all', protect, isAdmin, async (req, res) => {
    try {
        console.log(`Fetching ALL Pann War delivery logs for Admin: ${req.user.id}`);

        const allDeliveryLogs = await WorkLog.find({
            paymentTypeAtTime: 'delivery' // Only fetch delivery logs
        })
        .populate('employeeId', 'fullName') // Populate employee name
        .populate('mainCategoryId', 'name') // Populate main category name (optional)
        .sort({ workDate: -1, createdAt: -1 }); // Sort by newest first

        console.log(`Found ${allDeliveryLogs.length} total Pann War delivery logs.`);
        res.json(allDeliveryLogs);

    } catch (error) {
        console.error("Error fetching ALL Pann War delivery logs:", error);
        res.status(500).json({
            message: 'Server Error fetching all Pann War delivery logs.',
            error: error.message
        });
    }
});

router.get('/current-salary', protect, async (req, res) => {
    try {
        const today = new Date();
        const year = today.getUTCFullYear(); // Use UTC
        const month = today.getUTCMonth(); // Use UTC
        const currentDay = today.getUTCDate(); // Use UTC
        
        let startDate, endDate;

        if (currentDay <= 15) {
            // First half: 1st to 15th of current month (UTC)
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
            endDate = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
        } else {
            // Second half: 16th to last day of current month (UTC)
            startDate = new Date(Date.UTC(year, month, 16, 0, 0, 0, 0));
            endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)); // Last day of month
        }

        console.log('📅 Current salary period dates (UTC):', {
            currentDay,
            startUTC: startDate.toISOString(),
            endUTC: endDate.toISOString(),
            startLocal: startDate.toLocaleDateString(),
            endLocal: endDate.toLocaleDateString()
        });

        const workLogs = await WorkLog.find({
            employeeId: req.user.id,
            workDate: { $gte: startDate, $lte: endDate },
            paymentTypeAtTime: { $ne: 'delivery' }
        });

        let totalSalary = 0;
        workLogs.forEach(log => {
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
            totalSalary += salary;
        });

        res.json({ 
            totalSalary, 
            startDate: startDate.toISOString(), // Send as ISO string
            endDate: endDate.toISOString() // Send as ISO string
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
        
        // Prevent marking 'delivery' logs as paid if they don't affect salary
        // if (workLog.paymentTypeAtTime === 'delivery') {
        //     return res.status(400).json({ message: 'Delivery logs cannot be marked as paid.'});
        // }

        workLog.paymentStatus = 'paid';
        workLog.paymentDate = new Date();
        const updatedLog = await workLog.save();
        // Populate necessary fields for response
        await updatedLog.populate('employeeId', 'fullName');

        res.json({
            message: 'Work log marked as paid successfully.',
            workLog: { // Send back relevant info
                _id: updatedLog._id,
                employeeName: updatedLog.employeeId?.fullName || 'N/A',
                workDate: updatedLog.workDate,
                paymentStatus: updatedLog.paymentStatus,
                paymentDate: updatedLog.paymentDate,
                subcategoryNameAtTime: updatedLog.subcategoryNameAtTime,
                // Add salary if needed
                // salary: calculateLogSalary(updatedLog) // You'd need a helper function
            }
        });
    } catch (error) {
        console.error("Error marking work log as paid:", error);
        res.status(500).json({ message: 'Server Error marking log as paid.', error: error.message });
    }
});

// --- NEW ROUTE: MARK ALL AS PAID ---
router.put('/mark-all-paid', protect, isAdmin, async (req, res) => {
    try {
        const { logIds } = req.body; // Expect an array of work log IDs

        if (!Array.isArray(logIds) || logIds.length === 0) {
            return res.status(400).json({ message: 'An array of log IDs is required.' });
        }

        const updateResult = await WorkLog.updateMany(
            { 
                _id: { $in: logIds }, // Find all logs whose ID is in the array
                paymentStatus: { $ne: 'paid' } // Only update those that are not already paid
            }, 
            { 
                $set: { 
                    paymentStatus: 'paid', 
                    paymentDate: new Date() 
                } 
            }
        );

        if (updateResult.nModified === 0) {
             return res.json({ message: 'No unpaid logs were found to update.' });
        }

        res.json({ message: `Successfully marked ${updateResult.nModified} logs as paid.` });

    } catch (error) {
        console.error("Error marking all logs as paid:", error);
        res.status(500).json({ message: 'Server Error marking all logs as paid.', error: error.message });
    }
});
// --- END NEW ROUTE ---

// === GET ALL WORKLOGS FOR A SPECIFIC EMPLOYEE (Admin - for detail page) ===
router.get('/employee/:employeeId', protect, isAdmin, async (req, res) => {
    const { employeeId } = req.params;
    const { period } = req.query; // 'firstHalf' or 'secondHalf'

    try {
        const now = new Date();
        let startDate, endDate;

        // Consistent period logic
        if (period === 'secondHalf') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 16);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else { // Default to firstHalf
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);
        }

        const query = {
            employeeId: employeeId,
            workDate: { $gte: startDate, $lte: endDate },
            // Exclude deliveries from this specific employee's standard log history
            paymentTypeAtTime: { $ne: 'delivery' }
        };

        const workLogs = await WorkLog.find(query)
                                     .populate('subcategoryId', 'name') // Only need subcategory name
                                     .sort({ workDate: -1 }); // Newest logs first

        res.json(workLogs);

    } catch (error) {
        console.error("Error fetching employee work logs:", error);
        res.status(500).json({ message: 'Server error fetching employee work logs.' });
    }
});

router.put('/:id/edit-payment', protect, isAdmin, async (req, res) => {
    try {
        const { newAmount } = req.body;
        
        // Validation
        if (newAmount === undefined || newAmount === null || newAmount < 0) {
            return res.status(400).json({ message: 'Invalid amount provided.' });
        }

        const workLog = await WorkLog.findById(req.params.id);
        
        if (!workLog) {
            return res.status(404).json({ message: 'Work log not found.' });
        }

        // Update fields
        workLog.editedTotalPayment = Number(newAmount);
        workLog.isAdminEdited = true;

        const updatedLog = await workLog.save();
        
        // Populate for immediate UI update
        await updatedLog.populate('employeeId', 'fullName');
        await updatedLog.populate('subcategoryId', 'name');

        res.json({ 
            message: 'Payment amount updated successfully', 
            workLog: updatedLog 
        });

    } catch (error) {
        console.error("Error editing payment:", error);
        res.status(500).json({ message: 'Server Error editing payment.', error: error.message });
    }
});

router.put('/:id/update-quantity', protect, isAdmin, async (req, res) => {
    try {
        const { newQuantity } = req.body;
        
        if (newQuantity === undefined || newQuantity === null || newQuantity < 0) {
            return res.status(400).json({ message: 'Invalid quantity provided.' });
        }

        const workLog = await WorkLog.findById(req.params.id);
        
        if (!workLog) {
            return res.status(404).json({ message: 'Work log not found.' });
        }

        // Update the correct field based on payment type
        if (workLog.paymentTypeAtTime === 'perHour') {
            workLog.hoursWorked = Number(newQuantity);
        } else {
            // perPiece, perDozen, viss
            workLog.quantity = Number(newQuantity);
        }

        // Mark as edited by admin
        workLog.isAdminEdited = true;

        const updatedLog = await workLog.save();
        
        // Populate for immediate UI update
        await updatedLog.populate('employeeId', 'fullName');
        await updatedLog.populate({
            path: 'subcategoryId',
            select: 'name mainCategory groupType',
            populate: { path: 'mainCategory', select: 'name' }
        });

        res.json({ 
            message: 'Work log updated successfully', 
            workLog: updatedLog 
        });

    } catch (error) {
        console.error("Error updating work log:", error);
        res.status(500).json({ message: 'Server Error updating log.', error: error.message });
    }
});

// --- UPDATE GROUP INFO (Name & Notice) ---
router.put('/group/:conversationId', protect, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { groupName, groupNotice } = req.body;

        // Find and update the conversation
        const updatedChat = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                $set: {
                    groupName: groupName,
                    groupNotice: groupNotice
                }
            },
            { new: true } // Return the updated object
        )
        .populate("participants", "fullName profilePictureUrl")
        .populate("groupAdmin", "fullName");

        if (!updatedChat) {
            return res.status(404).json({ message: "Chat not found" });
        }

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error("Error updating group info:", error);
        res.status(500).json({ message: "Server Error updating group info" });
    }
});

module.exports = router;