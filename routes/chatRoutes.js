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

        // --- FIX: Reset unread counts for this user on initial fetch after login ---
        // This ensures when a user logs in, they don't see old unread counts
        const userId = req.user._id.toString();
        
        const updatedConversations = await Promise.all(conversations.map(async (convo) => {
            // Check if this user has unread counts
            const userUnreadCount = convo.unreadCounts?.get(userId) || 0;
            
            // If there are unread counts from previous session, reset them
            if (userUnreadCount > 0) {
                try {
                    const updateField = `unreadCounts.${userId}`;
                    await Conversation.findByIdAndUpdate(
                        convo._id,
                        { $set: { [updateField]: 0 } },
                        { new: false } // Don't wait for return, just update
                    );
                    
                    // Update the local copy
                    convo.unreadCounts.set(userId, 0);
                } catch (updateError) {
                    console.error("Error resetting unread count:", updateError);
                }
            }
            
            return convo;
        }));

        res.json(updatedConversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- START or GET a DM Conversation ---
router.post('/', protect, async (req, res) => {
    const { recipientId } = req.body;
    const senderId = req.user.id;

    if (!recipientId) return res.status(400).json({ message: "Recipient ID is required." });
    if (recipientId === senderId) return res.status(400).json({ message: "Cannot start a conversation with yourself." });

    try {
        let conversation = await Conversation.findOne({
            isGroupChat: false,
            participants: { $all: [senderId, recipientId], $size: 2 } 
        }).populate('participants', 'fullName profilePictureUrl'); 

        if (conversation) {
            res.status(200).json(conversation);
        } else {
            const newConversation = new Conversation({
                participants: [senderId, recipientId],
                isGroupChat: false
            });
            const savedConversation = await newConversation.save();
            await savedConversation.populate('participants', 'fullName profilePictureUrl');
            res.status(201).json(savedConversation);
        }
    } catch (error) {
        console.error("Error starting/getting DM conversation:", error);
        res.status(500).json({ message: "Server error." });
    }
});

// --- CREATE a Group Chat ---
router.post('/group', protect, async (req, res) => {
    const { groupName, participantIds } = req.body; 
    const adminId = req.user.id;

    if (!groupName || !participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
        return res.status(400).json({ message: "Group name and at least one participant are required." });
    }

    const allParticipants = [...new Set([adminId, ...participantIds])]; 

    try {
        const newGroupConversation = new Conversation({
            participants: allParticipants,
            isGroupChat: true,
            groupName: groupName.trim(),
            groupAdmin: adminId
        });
        const savedGroup = await newGroupConversation.save();
        await savedGroup.populate('participants', 'fullName profilePictureUrl');
        await savedGroup.populate('groupAdmin', 'fullName');

        res.status(201).json(savedGroup);
    } catch (error) {
        console.error("Error creating group chat:", error);
        res.status(500).json({ message: "Server error creating group chat." });
    }
});

// --- UPDATE GROUP INFO (Name & Notice) ---
router.put('/group/:conversationId', protect, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { groupName, groupNotice } = req.body;

        const updatedChat = await Conversation.findByIdAndUpdate(
            conversationId,
            {
                $set: {
                    groupName: groupName,
                    groupNotice: groupNotice
                }
            },
            { new: true } 
        )
        .populate("participants", "fullName profilePictureUrl")
        .populate("groupAdmin", "fullName");

        if (!updatedChat) return res.status(404).json({ message: "Chat not found" });

        res.status(200).json(updatedChat);
    } catch (error) {
        console.error("Error updating group info:", error);
        res.status(500).json({ message: "Server Error updating group info" });
    }
});

// --- ADD MEMBERS TO GROUP ---
router.put('/groupadd', protect, async (req, res) => {
    const { conversationId, newParticipantIds } = req.body;

    if (!conversationId || !newParticipantIds || !Array.isArray(newParticipantIds)) {
        return res.status(400).json({ message: "Invalid data." });
    }

    try {
        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { $addToSet: { participants: { $each: newParticipantIds } } },
            { new: true }
        )
        .populate('participants', 'fullName profilePictureUrl')
        .populate('groupAdmin', 'fullName');

        if (!updatedConversation) return res.status(404).json({ message: "Conversation not found." });

        res.json(updatedConversation);
    } catch (error) {
        console.error("Error adding members:", error);
        res.status(500).json({ message: "Server error adding members." });
    }
});

// --- FETCH Messages ---
router.get('/messages/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    try {
        const messages = await Message.find({ conversation: conversationId })
            .populate('sender', 'fullName profilePictureUrl')
            .sort({ createdAt: 1 }); 
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching messages." });
    }
});

// --- MARK Conversation as Read (FIXED: FORCE UPDATE) ---
router.post('/read/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    try {
        // 1. Construct the update key
        const updateField = `unreadCounts.${userId}`;

        // 2. FORCE UPDATE the database to 0. 
        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { $set: { [updateField]: 0 } },
            { new: true }
        );

        if (!updatedConversation) {
            return res.status(404).json({ message: "Conversation not found." });
        }

        // 3. Populate details for the frontend
        await updatedConversation.populate([
            { path: 'participants', select: 'fullName profilePictureUrl' },
            { path: 'groupAdmin', select: 'fullName' },
            { 
                path: 'lastMessage',
                select: 'content imageUrl sender createdAt',
                populate: { path: 'sender', select: 'fullName' }
            }
        ]);

        // 4. Emit socket event so other devices/tabs update instantly
        const io = req.app.get('socketio'); 
        if (io) {
            io.to(conversationId).emit('conversationUpdated', updatedConversation);
        }
        
        res.status(200).json(updatedConversation); 

    } catch (error) {
        console.error("Error marking chat as read:", error);
        res.status(500).json({ message: "Server error." });
    }
});

// --- FETCH CHAT USERS ---
router.get('/users/chat-list', protect, async (req, res) => {
     try {
         let query = {};
         if (req.user.role === 'admin') {
             query = { role: 'employee', status: 'approved', _id: { $ne: req.user.id } };
         } else {
             query = { role: 'admin', _id: { $ne: req.user.id } };
         }

         const users = await User.find(query)
             .select('fullName profilePictureUrl email role')
             .sort({ fullName: 1 });
         res.json(users);
     } catch (error) {
        res.status(500).json({ message: "Server error fetching users." });
     }
});

// --- UPLOAD IMAGE ---
router.post('/upload-image', protect, upload.single('chatImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No image file provided." });
    
    res.status(200).json({
        imageUrl: req.file.path,
        imageCloudinaryId: req.file.filename 
    });
});

module.exports = router;