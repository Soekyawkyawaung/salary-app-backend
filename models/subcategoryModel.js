// backend/models/subcategoryModel.js
const mongoose = require('mongoose');

const subcategorySchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mainCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MainCategory',
        required: true
    },
    paymentType: {
        type: String,
        required: true,
        enum: ['perPiece', 'perDozen', 'perHour', 'perDay', 'ပိဿာ']
    },
    rate: {
        type: Number,
        required: true
    },
    order: {
        type: Number,
        default: 0 
    },
    // --- ADD THIS NEW FIELD ---
    groupType: {
        type: String,
        default: '' // Default to empty string if not provided
    }
    // --------------------------
}, {
    timestamps: true
});

module.exports = mongoose.model('Subcategory', subcategorySchema);