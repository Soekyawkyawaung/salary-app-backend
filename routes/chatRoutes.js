// routes/chatRoutes.js
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
            select: 'content imageUrl sender createdAt readBy',
            populate: { 
                path: 'sender', 
                select: 'fullName profilePictureUrl' 
            }
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
            } catch (err) {
                convoObj.unreadCount = 0;
            }
            return convoObj;
        }));

        res.json(conversationsWithUnread);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// --- NEW ROUTE: JOIN/UPDATE GROUP NOTE (SOLITAIRE) ---
router.put('/note/join', protect, async (req, res) => {
    const { messageId, newEntry } = req.body;
    
    if (!messageId || !newEntry) {
        return res.status(400).json({ message: "Missing data" });
    }

    try {
        const message = await Message.findById(messageId)
            .populate('sender', 'fullName profilePictureUrl');
            
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        // Parse content
        if (!message.content.startsWith('@@GROUP_NOTE@@')) {
            return res.status(400).json({ message: "Not a group note" });
        }

        const jsonStr = message.content.replace('@@GROUP_NOTE@@', '');
        const noteData = JSON.parse(jsonStr);
        
        // Add entry
        noteData.entries.push(newEntry);
        
        // Save back
        message.content = '@@GROUP_NOTE@@' + JSON.stringify(noteData);
        const updatedMessage = await message.save();
        
        // Emit update to everyone in the conversation
        const io = req.app.get('socketio');
        if (io) {
            io.to(message.conversation.toString()).emit('messageUpdated', updatedMessage);
        }
        
        res.json(updatedMessage);
    } catch (error) {
        console.error("Error joining note:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// --- MARK Conversation as Read ---
router.post('/read/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    try {
        await Conversation.findByIdAndUpdate(conversationId, { $set: { [`unreadCounts.${userId}`]: 0 } });
        await Message.updateMany(
            { conversation: conversationId, sender: { $ne: userId }, readBy: { $ne: userId } },
            { $addToSet: { readBy: userId } }
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error." });
    }
});

// --- START or GET a DM Conversation ---
router.post('/', protect, async (req, res) => {
    const { recipientId } = req.body;
    const senderId = req.user.id;
    try {
        let conversation = await Conversation.findOne({ isGroupChat: false, participants: { $all: [senderId, recipientId], $size: 2 } }).populate('participants', 'fullName profilePictureUrl');
        if (conversation) {
            const convoObj = conversation.toObject ? conversation.toObject() : conversation;
            const realUnreadCount = await Message.countDocuments({
                conversation: conversation._id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            });
            convoObj.unreadCount = realUnreadCount;
            return res.status(200).json(convoObj);
        }
        const newConversation = new Conversation({ participants: [senderId, recipientId], isGroupChat: false });
        const savedConversation = await newConversation.save();
        await savedConversation.populate('participants', 'fullName profilePictureUrl');
        res.status(201).json(savedConversation);
    } catch (error) { res.status(500).json({ message: "Server error." }); }
});

// --- CREATE a Group Chat ---
router.post('/group', protect, async (req, res) => {
    const { groupName, participantIds } = req.body; 
    const adminId = req.user.id;
    try {
        const newGroupConversation = new Conversation({ participants: [...new Set([adminId, ...participantIds])], isGroupChat: true, groupName: groupName.trim(), groupAdmin: adminId });
        const savedGroup = await newGroupConversation.save();
        await savedGroup.populate('participants', 'fullName profilePictureUrl');
        res.status(201).json(savedGroup);
    } catch (error) { res.status(500).json({ message: "Server error." }); }
});

// --- UPDATE GROUP INFO ---
router.put('/group/:conversationId', protect, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { groupName, groupNotice, groupNote } = req.body;
        const updatedChat = await Conversation.findByIdAndUpdate(conversationId, { $set: { groupName, groupNotice, groupNote } }, { new: true }).populate("participants", "fullName profilePictureUrl");
        
        const convoObj = updatedChat.toObject ? updatedChat.toObject() : updatedChat;
        const realUnreadCount = await Message.countDocuments({
            conversation: conversationId,
            sender: { $ne: req.user._id },
            readBy: { $ne: req.user._id }
        });
        convoObj.unreadCount = realUnreadCount;
        
        res.status(200).json(convoObj);
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

// --- ADD MEMBERS TO GROUP ---
router.put('/groupadd', protect, async (req, res) => {
    const { conversationId, newParticipantIds } = req.body;
    try {
        const updatedConversation = await Conversation.findByIdAndUpdate(conversationId, { $addToSet: { participants: { $each: newParticipantIds } } }, { new: true }).populate('participants', 'fullName profilePictureUrl');
        res.json(updatedConversation);
    } catch (error) { res.status(500).json({ message: "Server error." }); }
});

// --- FETCH Messages ---
router.get('/messages/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    try {
        const messages = await Message.find({ conversation: conversationId }).populate('sender', 'fullName profilePictureUrl').sort({ createdAt: 1 }); 
        res.json(messages);
    } catch (error) { res.status(500).json({ message: "Server error." }); }
});

// --- FETCH CHAT USERS ---
router.get('/users/chat-list', protect, async (req, res) => {
     try {
         let query = req.user.role === 'admin' ? { role: 'employee', status: 'approved', _id: { $ne: req.user.id } } : { role: 'admin', _id: { $ne: req.user.id } };
         const users = await User.find(query).select('fullName profilePictureUrl email role').sort({ fullName: 1 });
         res.json(users);
     } catch (error) { res.status(500).json({ message: "Server error." }); }
});

// --- UPLOAD IMAGE ---
router.post('/upload-image', protect, upload.single('chatImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No image." });
    res.status(200).json({ imageUrl: req.file.path, imageCloudinaryId: req.file.filename });
});

// --- REMOVE MEMBER FROM GROUP ---
router.put('/groupremove', protect, async (req, res) => {
    const { conversationId, participantId } = req.body;
    try {
        await Conversation.findByIdAndUpdate(conversationId, { $pull: { participants: participantId } }, { new: true });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ message: "Error" }); }
});

// --- NEW: RECALL MESSAGE ---
router.put('/recall/:messageId', protect, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg) return res.status(404).json({ message: "Message not found" });

        // 1. Check Ownership
        if (msg.sender.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized" });
        }

        // 2. Check Content Type (No Photos)
        if (msg.imageUrl || (msg.content && msg.content.startsWith('@@GROUP_NOTE@@'))) {
            return res.status(400).json({ message: "Cannot recall this message type" });
        }

        // 3. Check 5-Second Time Limit
        const now = new Date();
        const msgDate = new Date(msg.createdAt);
        const diffSeconds = (now - msgDate) / 1000;
        
        if (diffSeconds > 5) { // 5 Seconds Strict Limit
            return res.status(400).json({ message: "Recall time expired (5s limit)" });
        }

        // 4. Perform Recall
        // We preserve the original content temporarily in a new field if you want to allow "Re-edit" from backend, 
        // but for safety, we usually rely on frontend state or just clear it. 
        // Here we keep the object but mark it recalled.
        const oldContent = msg.content; // Save for response if needed
        msg.isRecalled = true;
        // We DON'T delete content immediately so the user can "Edit" it back on frontend if needed,
        // OR we rely on the frontend having cached it. 
        // Secure approach: Hide content from others. 
        // For simplicity with your current setup:
        // We will keep content in DB but frontend will hide it if isRecalled=true.
        
        await msg.save();
        
        // Emit Socket Event
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

// --- NEW: DELETE MESSAGE ---
router.delete('/message/:messageId', protect, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.messageId);
        if (!msg) return res.status(404).json({ message: "Not found" });
        
        // Allow sender or admin to delete
        const isAdminUser = req.user.role === 'admin';
        if (msg.sender.toString() !== req.user.id && !isAdminUser) {
            return res.status(403).json({ message: "Not authorized" });
        }
        
        const conversationId = msg.conversation;
        await Message.deleteOne({ _id: req.params.messageId });
        
        // Emit Socket Event
        const io = req.app.get('socketio');
        if (io) {
            // We emit an event specifically for deletion
            io.to(conversationId.toString()).emit('messageDeleted', req.params.messageId);
        }
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;