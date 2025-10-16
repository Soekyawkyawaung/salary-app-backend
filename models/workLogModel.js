const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const workLogSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory' }, // No longer strictly required
    workDate: { type: Date, required: true },
    quantity: { type: Number, default: 0 },
    hoursWorked: { type: Number, default: 0 },
    rateAtTime: { type: Number, required: true },
    paymentTypeAtTime: { type: String, required: true, enum: ['perPiece', 'perHour', 'perDay'] },
    // This new field will store a permanent copy of the name
    subcategoryNameAtTime: { type: String, required: true }
}, {
    timestamps: true
});

const WorkLog = mongoose.model('WorkLog', workLogSchema);
module.exports = WorkLog;