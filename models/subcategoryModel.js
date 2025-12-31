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
    // --- ADD THIS SECTION ---
    order: {
        type: Number,
        default: 0 // Default to 0 so existing items don't break
    }
    // ------------------------
}, {
    timestamps: true
});

module.exports = mongoose.model('Subcategory', subcategorySchema);