// models/messageModel.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        // Not required if imageUrl is present
        required: function() { return !this.imageUrl; } 
    },
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    // --- MODIFIED ---
    imageUrl: {
        type: String, // Will store the full https://res.cloudinary.com/... URL
        required: function() { return !this.content; } 
    },
    // --- ADD THIS FIELD ---
    imageCloudinaryId: {
        type: String // Will store the public_id from Cloudinary
    },
    // --- END ADD ---
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);