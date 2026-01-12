const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isGroupChat: {
        type: Boolean,
        default: false
    },
    groupName: {
        type: String,
        trim: true
    },
    // --- ADD THIS LINE ---
    groupNotice: {
        type: String,
        default: ""
    },
    // ---------------------
    groupAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);