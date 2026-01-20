// backend/models/advanceModel.js
const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
    amount: Number,
    date: Date,
    type: { type: String, enum: ['Partial', 'Full'] },
    description: String
}, { _id: true });

const advanceSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Ongoing', 'Settled'],
        default: 'Ongoing'
    },
    date: {
        type: Date,
        required: true
    },
    description: String,
    settlements: [settlementSchema]
}, { timestamps: true });

module.exports = mongoose.model('Advance', advanceSchema);