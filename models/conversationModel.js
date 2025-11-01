// models/conversationModel.js
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    isGroupChat: {
        type: Boolean,
        default: false
    },
    groupName: {
        type: String,
        trim: true // Remove whitespace
        // required: function() { return this.isGroupChat; } // Optional: Required only if it's a group
    },
    groupAdmin: { // The user who created the group
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
        // required: function() { return this.isGroupChat; } // Optional: Required only if it's a group
    },
    lastMessage: { // Reference to the latest message for quick display/sorting
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: {}
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;