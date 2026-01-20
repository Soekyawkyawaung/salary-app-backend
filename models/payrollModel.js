// backend/models/payrollModel.js
const mongoose = require('mongoose');

const payrollSchema = mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    grossAmount: { // Total value of work logs
        type: Number,
        required: true,
        default: 0
    },
    deductions: {
        advance: { type: Number, default: 0 },
        fine: { type: Number, default: 0 }
    },
    totalSalary: { // Net Payable (Gross - Deductions)
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Paid'],
        default: 'Paid'
    },
    workLogs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WorkLog'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Payroll', payrollSchema);