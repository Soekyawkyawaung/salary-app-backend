const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subcategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mainCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MainCategory',
        required: true
    },
    paymentType: {
        type: String,
        required: true,
        enum: ['perPiece', 'perDozen', 'perHour', 'perDay'] // Make sure perDozen is included
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    timestamps: true
});

const Subcategory = mongoose.model('Subcategory', subcategorySchema);

module.exports = Subcategory;