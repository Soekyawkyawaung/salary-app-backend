const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const workLogSchema = new Schema({
    employeeId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // This now refers to a Subcategory
    subcategoryId: {
        type: Schema.Types.ObjectId,
        ref: 'Subcategory',
        required: true
    },
    workDate: {
        type: Date,
        required: true
    },
    // For 'perPiece' work
    quantity: {
        type: Number,
        default: 0
    },
    // For 'perHour' work
    hoursWorked: {
        type: Number,
        default: 0
    },
    // This now stores the rate at the time of work
    rateAtTime: {
        type: Number,
        required: true
    },
    // This stores the payment type to make calculations easier
    paymentTypeAtTime: {
        type: String,
        required: true,
        enum: ['perPiece', 'perHour', 'perDay'],
    }
}, {
    timestamps: true
});

const WorkLog = mongoose.model('WorkLog', workLogSchema);

module.exports = WorkLog;