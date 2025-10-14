const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subcategorySchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    // Link to the main category
    mainCategory: {
        type: Schema.Types.ObjectId,
        ref: 'MainCategory',
        required: true,
    },
    // Define the type of payment
    paymentType: {
        type: String,
        required: true,
        enum: ['perPiece', 'perHour', 'perDay'], // Only these values are allowed
    },
    // A general name for the payment rate
    rate: {
        type: Number,
        required: true,
    }
}, {
    timestamps: true
});

const Subcategory = mongoose.model('Subcategory', subcategorySchema);

module.exports = Subcategory;