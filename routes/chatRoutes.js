// backend/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel'); 
const { protect, isAdmin } = require('../middleware/authMiddleware'); 
const upload = require('../middleware/chatImageUpload');

// --- GET ALL CONVERSATIONS ---
router.get('/', protect, async (req, res) => {
    try {
        const conversations = await Conversation.find({ 
            participants: req.user._id 
        })
        .populate('participants', 'fullName profilePictureUrl')
        .populate('groupAdmin', 'fullName')
        .populate({
            path: 'lastMessage',
            select: 'content imageUrl sender createdAt readBy isRecalled',
            populate: { path: 'sender', select: 'fullName profilePictureUrl' }
        })
        .sort({ updatedAt: -1 });

        const conversationsWithUnread = await Promise.all(conversations.map(async (convo) => {
            const convoObj = convo.toObject ? convo.toObject() : convo;
            try {
                const realUnreadCount = await Message.countDocuments({
                    conversation: convo._id,
                    sender: { $ne: req.user._id },
                    readBy: { $ne: req.user._id }
                });
                convoObj.unreadCount = realUnreadCount;
            } catch (err) { convoObj.unreadCount = 0; }
            return convoObj;
        }));

        res.json(conversationsWithUnread);
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

// --- FETCH MESSAGES (NOW WITH QUOTES) ---
router.get('/messages/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    try {
        const messages = await Message.find({ conversation: conversationId })
            .populate('sender', 'fullName profilePictureUrl')
            // --- FIX: Populate the replyTo field so quotes show up in chat window ---
            .populate({
                path: 'replyTo',
                select: 'content sender imageUrl', 
                populate: { path: 'sender', select: 'fullName' }
            })
            .sort({ createdAt: 1 }); 
        res.json(messages);
    } catch (error) { 
        console.error("Fetch Messages Error:", error);
        res.status(500).json({ message: "Server error." }); 
    }
});

// --- RECALL MESSAGE (10s Limit & Name Fix) ---
router.put('/recall/:messageId', protect, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg) return res.status(404).json({ message: "Message not found" });

        if (msg.sender.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized" });
        }

        // 10 Seconds Limit
        const now = new Date();
        const msgDate = new Date(msg.createdAt);
        if ((now - msgDate) / 1000 > 10) { 
            return res.status(400).json({ message: "Recall time expired (10s limit)" });
        }

        msg.isRecalled = true;
        await msg.save();
        
        // --- IMPORTANT: Populate sender so frontend can show "Soe Thu Win recalled..." ---
        await msg.populate('sender', 'fullName profilePictureUrl');
        
        const io = req.app.get('socketio');
        if (io) {
            io.to(msg.conversation.toString()).emit('messageUpdated', msg);
        }

        res.json({ success: true, message: msg });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Server error" });
    }
});

// --- DELETE MESSAGE ---
router.delete('/message/:messageId', protect, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg) return res.status(404).json({ message: "Not found" });
        
        const isAdminUser = req.user.role === 'admin';
        if (msg.sender.toString() !== req.user.id && !isAdminUser) return res.status(403).json({ message: "Not authorized" });
        
        const conversationId = msg.conversation;
        await Message.deleteOne({ _id: req.params.messageId });
        
        const io = req.app.get('socketio');
        if (io) io.to(conversationId.toString()).emit('messageDeleted', req.params.messageId);
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// ... (Other routes: JOIN NOTE, READ, DM, GROUP, UPLOAD, REMOVE MEMBER ... KEEP SAME) ...
router.put('/note/join', protect, async (req, res) => {
    const { messageId, newEntry } = req.body;
    try {
        const message = await Message.findById(messageId).populate('sender', 'fullName profilePictureUrl');
        if (!message || !message.content.startsWith('@@GROUP_NOTE@@')) return res.status(400).json({ message: "Invalid note" });
        const jsonStr = message.content.replace('@@GROUP_NOTE@@', '');
        const noteData = JSON.parse(jsonStr);
        noteData.entries.push(newEntry);
        message.content = '@@GROUP_NOTE@@' + JSON.stringify(noteData);
        const updatedMessage = await message.save();
        const io = req.app.get('socketio');
        if (io) io.to(message.conversation.toString()).emit('messageUpdated', updatedMessage);
        res.json(updatedMessage);
    } catch (error) { res.status(500).json({ message: "Server error" }); }
});
router.post('/read/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params; const userId = req.user.id;
    try { await Conversation.findByIdAndUpdate(conversationId, { $set: { [`unreadCounts.${userId}`]: 0 } }); await Message.updateMany({ conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } }, { $addToSet: { readBy: userId } }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ message: "Server error." }); }
});
router.post('/', protect, async (req, res) => {
    const { recipientId } = req.body; const senderId = req.user.id;
    try { let conversation = await Conversation.findOne({ isGroupChat: false, participants: { $all: [senderId, recipientId], $size: 2 } }).populate('participants', 'fullName profilePictureUrl'); if (conversation) { return res.status(200).json(conversation); } const newConversation = new Conversation({ participants: [senderId, recipientId], isGroupChat: false }); const savedConversation = await newConversation.save(); await savedConversation.populate('participants', 'fullName profilePictureUrl'); res.status(201).json(savedConversation); } catch (error) { res.status(500).json({ message: "Server error." }); }
});
router.post('/group', protect, async (req, res) => {
    const { groupName, participantIds } = req.body; const adminId = req.user.id;
    try { const newGroupConversation = new Conversation({ participants: [...new Set([adminId, ...participantIds])], isGroupChat: true, groupName: groupName.trim(), groupAdmin: adminId }); const savedGroup = await newGroupConversation.save(); await savedGroup.populate('participants', 'fullName profilePictureUrl'); res.status(201).json(savedGroup); } catch (error) { res.status(500).json({ message: "Server error." }); }
});
router.put('/group/:conversationId', protect, async (req, res) => {
    try { const { conversationId } = req.params; const { groupName, groupNotice, groupNote } = req.body; const updatedChat = await Conversation.findByIdAndUpdate(conversationId, { $set: { groupName, groupNotice, groupNote } }, { new: true }).populate("participants", "fullName profilePictureUrl"); res.status(200).json(updatedChat); } catch (error) { res.status(500).json({ message: "Server Error" }); }
});
router.put('/groupadd', protect, async (req, res) => {
    const { conversationId, newParticipantIds } = req.body;
    try { const updatedConversation = await Conversation.findByIdAndUpdate(conversationId, { $addToSet: { participants: { $each: newParticipantIds } } }, { new: true }).populate('participants', 'fullName profilePictureUrl'); res.json(updatedConversation); } catch (error) { res.status(500).json({ message: "Server error." }); }
});
router.get('/users/chat-list', protect, async (req, res) => {
     try { let query = req.user.role === 'admin' ? { role: 'employee', status: 'approved', _id: { $ne: req.user.id } } : { role: 'admin', _id: { $ne: req.user.id } }; const users = await User.find(query).select('fullName profilePictureUrl email role').sort({ fullName: 1 }); res.json(users); } catch (error) { res.status(500).json({ message: "Server error." }); }
});
router.post('/upload-image', protect, upload.single('chatImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No image." }); res.status(200).json({ imageUrl: req.file.path, imageCloudinaryId: req.file.filename });
});
router.put('/groupremove', protect, async (req, res) => {
    const { conversationId, participantId } = req.body;
    try { await Conversation.findByIdAndUpdate(conversationId, { $pull: { participants: participantId } }, { new: true }); res.json({ success: true }); } catch (error) { res.status(500).json({ message: "Error" }); }
});

module.exports = router;