// backend/routes/payrollRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); 
const { protect, isAdmin } = require('../middleware/authMiddleware');
const Payroll = require('../models/payrollModel');
const WorkLog = require('../models/workLogModel'); 
const Advance = require('../models/advanceModel'); 
const Fine = require('../models/fineModel');

// --- 1. GET PAYROLL SUMMARY (ROBUST FIX) ---
router.get('/current-period-summary', protect, isAdmin, async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0 = Jan, 1 = Feb...

        // 1. Define the Current Month Range (Local Time Logic)
        // We want any payroll where the 'endDate' is in this month.
        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

        // 2. Find Payrolls
        // Logic: Count any payroll that "belongs" to this month.
        // We check if the payroll's 'endDate' falls between Jan 1 and Jan 31.
        const payrolls = await Payroll.find({
            endDate: { 
                $gte: startOfMonth, 
                $lte: endOfMonth 
            },
            status: 'Paid'
        });

        // 3. Calculate Total
        const totalSalaryPaid = payrolls.reduce((sum, p) => sum + (p.totalSalary || 0), 0);

        // 4. Format Dates for Frontend (Correcting Timezone Shift)
        // We construct strings manually to avoid UTC shifts (e.g., "2026-01-01")
        const formatDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        res.json({
            startDate: formatDate(startOfMonth),
            endDate: formatDate(endOfMonth),
            totalSalary: totalSalaryPaid,
            count: payrolls.length
        });
    } catch (error) {
        console.error("Error fetching payroll summary:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- HELPER: Calculate Amount ---
const calculateLogAmount = (log) => {
    if (log.editedTotalPayment != null) return log.editedTotalPayment;
    const rate = log.rateAtTime || 0;
    const qty = log.quantity || 0;
    const hours = log.hoursWorked || 0;

    switch (log.paymentTypeAtTime) {
        case 'perPiece':
        case 'delivery':
        case 'perDay': return rate * qty;
        case 'perDozen': return qty * rate; 
        case 'perHour': return rate * hours;
        default: return 0;
    }
};

// --- 2. MARK SALARY AS PAID (With Duplicate Record Fix) ---
router.post('/mark-paid', protect, isAdmin, async (req, res) => {
    const { 
        employeeId, 
        periodStartDate, 
        periodEndDate,
        deductions 
    } = req.body;

    let debugMsg = [];

    try {
        console.log(`[Payroll] Processing Payment for Emp ID: ${employeeId}`);

        // --- DATE SETTINGS ---
        const start = new Date(periodStartDate);
        start.setDate(start.getDate() - 5); 
        const end = new Date(periodEndDate);
        end.setDate(end.getDate() + 5); 
        end.setHours(23, 59, 59, 999);

        // A. FETCH WORK LOGS (Find anything NOT paid)
        const workLogs = await WorkLog.find({
            $or: [
                { employeeId: employeeId },
                { employee: employeeId }
            ],
            workDate: { $gte: start, $lte: end },
            paymentStatus: { $ne: 'paid' }
        });

        // B. CALCULATE VALUES
        const grossWorkAmount = workLogs.reduce((sum, log) => sum + calculateLogAmount(log), 0);
        let advanceDed = Number(deductions.advance) || 0;
        const fineDed = Number(deductions.fine) || 0;
        const netSalary = grossWorkAmount - (advanceDed + fineDed);

        // D. CREATE PAYROLL RECORD
        const payroll = await Payroll.create({
            employee: employeeId,
            startDate: periodStartDate,
            endDate: periodEndDate,
            grossAmount: grossWorkAmount, 
            deductions: {
                advance: advanceDed,
                fine: fineDed
            },
            totalSalary: Math.max(0, netSalary), 
            status: 'Paid',
            workLogs: workLogs.map(log => log._id)
        });

        // E. UPDATE WORK LOGS
        if (workLogs.length > 0) {
            const updateData = { paymentStatus: 'paid', paymentDate: new Date(), payrollReference: payroll._id };
            await WorkLog.updateMany({ _id: { $in: workLogs.map(log => log._id) } }, { $set: updateData });
        }

        // =========================================================
        // F. HANDLE ADVANCE DEDUCTION (MULTI-RECORD FIX)
        // =========================================================
        if (advanceDed > 0) {
            console.log(`[Payroll] Attempting to deduct Advance: ${advanceDed}`);
            
            // 1. Fetch ALL records for this employee (String ID matching)
            const allAdvances = await Advance.find({});
            const employeeAdvances = allAdvances.filter(adv => {
                const advEmp = adv.employee || adv.employeeId || adv.user;
                if (!advEmp) return false;
                return (advEmp._id || advEmp).toString() === employeeId.toString();
            });

            console.log(`[Payroll] Found ${employeeAdvances.length} advance records for this user.`);

            let remainingDeduction = advanceDed;

            // 2. Iterate through ALL found records and deduct from ones with money
            for (let targetAdvance of employeeAdvances) {
                if (remainingDeduction <= 0) break;

                // Check all possible balance fields
                let currentBal = targetAdvance.totalBalance || targetAdvance.balance || targetAdvance.amount || 0;

                if (currentBal > 0) {
                    console.log(`[Payroll] Found positive balance record (ID: ${targetAdvance._id}): ${currentBal}`);
                    
                    let deductAmount = Math.min(currentBal, remainingDeduction);
                    let newBal = currentBal - deductAmount;
                    remainingDeduction -= deductAmount;

                    // Update ALL fields to be safe
                    targetAdvance.totalBalance = newBal;
                    targetAdvance.balance = newBal;
                    targetAdvance.amount = newBal;

                    if (!targetAdvance.history) targetAdvance.history = [];
                    targetAdvance.history.push({
                        type: 'settlement',
                        amount: deductAmount,
                        date: new Date(),
                        note: `Salary Deduction`,
                        remarks: `Salary Deduction`
                    });

                    await targetAdvance.save();
                    debugMsg.push(`Deducted ${deductAmount} from record ${targetAdvance._id}`);
                }
            }
        }

        // =========================================================
        // G. HANDLE FINE DEDUCTION (MULTI-RECORD FIX)
        // =========================================================
        if (fineDed > 0) {
            const allPendingFines = await Fine.find({ status: 'Pending' });
            
            const userFines = allPendingFines.filter(fine => {
                const fineEmp = fine.employee || fine.employeeId;
                if (!fineEmp) return false;
                return (fineEmp._id || fineEmp).toString() === employeeId.toString();
            });

            let finesCleared = 0;
            for (let fine of userFines) {
                fine.status = 'Paid';
                await fine.save();
                finesCleared++;
            }
            debugMsg.push(`Fines Cleared: ${finesCleared}`);
        }

        res.status(201).json({ 
            message: 'Success! ' + debugMsg.join(', '), 
            payroll 
        });

    } catch (error) {
        console.error("Mark Paid Error Detailed:", error);
        res.status(500).json({ message: `Payment Error: ${error.message}` });
    }
});

// --- 3. GET PAYROLL HISTORY ---
router.get('/history/:employeeId', protect, isAdmin, async (req, res) => {
    try {
        const history = await Payroll.find({ employee: req.params.employeeId })
            .sort({ createdAt: -1 })
            .populate('workLogs'); 
        
        res.json(history);
    } catch (error) {
        console.error("Error fetching payroll history:", error);
        res.status(500).json({ message: 'Server error fetching history' });
    }
});

module.exports = router;