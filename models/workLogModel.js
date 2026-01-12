// models/workLogModel.js
const mongoose = require('mongoose');

const workLogSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    subcategoryId: {
        type: mongoose.Schema.Types.ObjectId,
        // required: true, // Not required for 'delivery' type
        ref: 'Subcategory',
        default: null // Allow null if it's a delivery
    },
    mainCategoryId: { // Added for Pann War logs
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MainCategory',
        default: null
    },
    workDate: {
        type: Date,
        required: true
    },
    quantity: {
        type: Number,
        required: function() { return ['perPiece', 'perDozen', 'delivery'].includes(this.paymentTypeAtTime); }, // Required for these types
        default: 0
    },
    hoursWorked: {
        type: Number,
        required: function() { return this.paymentTypeAtTime === 'perHour'; }, // Only required for perHour
        default: 0
    },
    rateAtTime: { // The rate at the time the log was created
        type: Number,
        required: true,
        default: 0
    },
    paymentTypeAtTime: { // The payment type at the time the log was created
        type: String,
        required: true,
        // --- THIS IS THE FIX ---
        enum: ['perPiece', 'perDozen', 'perHour', 'perDay', 'delivery'] // Added 'delivery'
        // --- END FIX ---
    },
    subcategoryNameAtTime: { // Store the name of the subcategory (or description like Pann War)
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid', 'na'], // 'na' might be useful for deliveries
        default: 'unpaid'
    },
    paymentDate: { // Date when marked as paid
        type: Date,
        default: null
    },
    
    location: {
        type: String,
        enum: ['Golden Falcon (၂၈လမ်း ဆိုင်)', 'ရွှေခေါင်းလောင်း စက်ရုံ', 'N/A'],
        default: 'N/A'
    },

    editedTotalPayment: {
        type: Number,
        default: null
    },
    isAdminEdited: {
        type: Boolean,
        default: false
    },

    isAdminEdited: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

const WorkLog = mongoose.model('WorkLog', workLogSchema);
module.exports = WorkLog;