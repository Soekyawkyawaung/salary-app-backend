// backend/models/fineModel.js
const mongoose = require('mongoose');

const fineSchema = mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: ['Pending', 'Deducted'], // 'Pending' means waiting for payroll deduction
        default: 'Pending'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Fine', fineSchema);