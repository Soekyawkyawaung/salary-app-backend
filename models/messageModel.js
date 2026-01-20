// backend/models/messageModel.js
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
    imageUrl: {
        type: String, 
        required: function() { return !this.content; } 
    },
    imageCloudinaryId: {
        type: String 
    },
    // --- NEW: THIS WAS MISSING ---
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    // --- NEW: Track Recall Status ---
    isRecalled: {
        type: Boolean,
        default: false
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);