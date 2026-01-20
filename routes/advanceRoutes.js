// backend/routes/advanceRoutes.js
const express = require('express');
const router = express.Router();
const Advance = require('../models/advanceModel');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- GET SUMMARY (Grouped by Employee) ---
router.get('/summary', protect, isAdmin, async (req, res) => {
    try {
        const advances = await Advance.find({ status: 'Ongoing' }).populate('employee', 'fullName profilePictureUrl');
        
        const employeeMap = {};
        
        advances.forEach(adv => {
            const empId = adv.employee?._id.toString();
            if (!empId) return;
            
            if (!employeeMap[empId]) {
                employeeMap[empId] = {
                    employee: adv.employee,
                    totalBalance: 0,
                    lastDate: adv.date
                };
            }
            employeeMap[empId].totalBalance += (adv.amount - (adv.paidAmount || 0));
            if (new Date(adv.date) > new Date(employeeMap[empId].lastDate)) {
                employeeMap[empId].lastDate = adv.date;
            }
        });

        res.json(Object.values(employeeMap));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching summary' });
    }
});

// --- GET ALL ADVANCES FOR A SPECIFIC EMPLOYEE ---
router.get('/employee/:employeeId', protect, isAdmin, async (req, res) => {
    try {
        const advances = await Advance.find({ employee: req.params.employeeId }).sort({ date: -1 });
        res.json(advances);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching details' });
    }
});

// --- NEW ROUTE: GET SINGLE ADVANCE BY ID (Fixes 404) ---
router.get('/:id', protect, isAdmin, async (req, res) => {
    try {
        const advance = await Advance.findById(req.params.id).populate('employee', 'fullName profilePictureUrl');
        if (!advance) {
            return res.status(404).json({ message: 'Advance not found' });
        }
        res.json(advance);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching advance' });
    }
});

// --- CREATE ADVANCE ---
router.post('/', protect, isAdmin, async (req, res) => {
    const { employeeId, amount, date, description } = req.body;
    try {
        const newAdvance = new Advance({
            employee: employeeId,
            amount,
            paidAmount: 0,
            status: 'Ongoing',
            date: new Date(date),
            description
        });
        await newAdvance.save();
        res.status(201).json(newAdvance);
    } catch (error) {
        res.status(500).json({ message: 'Error creating advance' });
    }
});

// --- RECALCULATE HELPER ---
const recalculateAdvance = async (advance) => {
    const totalPaid = advance.settlements.reduce((sum, s) => sum + (s.amount || 0), 0);
    advance.paidAmount = totalPaid;
    
    if (advance.paidAmount >= advance.amount) {
        advance.status = 'Settled';
        // Optional: Cap paidAmount at amount if you don't want overpayment
        // advance.paidAmount = advance.amount; 
    } else {
        advance.status = 'Ongoing';
    }
    return advance.save();
};

// --- SETTLE ADVANCE (Add Settlement) ---
router.put('/:id/settle', protect, isAdmin, async (req, res) => {
    const { type, amount, date, description } = req.body; 
    try {
        const advance = await Advance.findById(req.params.id);
        if (!advance) return res.status(404).json({ message: 'Advance not found' });

        const settleAmount = type === 'Full' ? (advance.amount - advance.paidAmount) : Number(amount);
        
        advance.settlements.push({
            type,
            amount: settleAmount,
            date: new Date(date),
            description
        });

        // Use helper to update status/totals
        await recalculateAdvance(advance);
        
        res.json(advance);
    } catch (error) {
        res.status(500).json({ message: 'Error settling advance' });
    }
});

// --- UPDATE SETTLEMENT ---
router.put('/:id/settlements/:settlementId', protect, isAdmin, async (req, res) => {
    try {
        const advance = await Advance.findById(req.params.id);
        if (!advance) return res.status(404).json({ message: 'Advance not found' });

        const settlement = advance.settlements.id(req.params.settlementId);
        if (!settlement) return res.status(404).json({ message: 'Settlement not found' });

        const { amount, date, type, description } = req.body;
        if (amount) settlement.amount = Number(amount);
        if (date) settlement.date = new Date(date);
        if (type) settlement.type = type;
        if (description !== undefined) settlement.description = description;

        await recalculateAdvance(advance);
        res.json(advance);
    } catch (error) {
        res.status(500).json({ message: 'Error updating settlement' });
    }
});

// --- DELETE SETTLEMENT ---
router.delete('/:id/settlements/:settlementId', protect, isAdmin, async (req, res) => {
    try {
        const advance = await Advance.findById(req.params.id);
        if (!advance) return res.status(404).json({ message: 'Advance not found' });

        advance.settlements.pull(req.params.settlementId);

        await recalculateAdvance(advance);
        res.json(advance);
    } catch (error) {
        res.status(500).json({ message: 'Error deleting settlement' });
    }
});

// --- EDIT ADVANCE (Main Info) ---
router.put('/:id', protect, isAdmin, async (req, res) => {
    try {
        // Recalculate logic needed if amount changes? 
        // For simplicity, we just update. Ideally, check if new amount < paid.
        const updated = await Advance.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Error updating' });
    }
});

// --- DELETE ADVANCE ---
router.delete('/:id', protect, isAdmin, async (req, res) => {
    try {
        await Advance.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting' });
    }
});

module.exports = router;