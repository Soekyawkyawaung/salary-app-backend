// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel'); 
const { protect, isAdmin } = require('../middleware/authMiddleware'); 
const upload = require('../middleware/chatImageUpload');

// --- GET ALL CONVERSATIONS (FIXED: Calculates Real Unread Count) ---
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

        // --- REAL-TIME FIX: Calculate accurate unread count from Messages ---
        // We use Promise.all to run these counts in parallel for performance
        const conversationsWithUnread = await Promise.all(conversations.map(async (convo) => {
            const convoObj = convo.toObject ? convo.toObject() : convo;
            
            try {
                // Count messages where:
                // 1. Belong to this conversation
                // 2. Sender is NOT the current user
                // 3. Current user is NOT in the 'readBy' array
                const realUnreadCount = await Message.countDocuments({
                    conversation: convo._id,
                    sender: { $ne: req.user._id },
                    readBy: { $ne: req.user._id }
                });

                convoObj.unreadCount = realUnreadCount;
            } catch (err) {
                console.error(`Error counting unread for convo ${convo._id}:`, err);
                convoObj.unreadCount = 0;
            }
            
            return convoObj;
        }));

        res.json(conversationsWithUnread);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- MARK Conversation as Read (FIXED: Updates Messages too) ---
router.post('/read/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    try {
        // 1. Update the 'unreadCounts' cache (Legacy support)
        const updateField = `unreadCounts.${userId}`;
        
        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { $set: { [updateField]: 0 } },
            { new: true }
        )
        .populate('participants', 'fullName profilePictureUrl')
        .populate('groupAdmin', 'fullName')
        .populate({
            path: 'lastMessage',
            select: 'content imageUrl sender createdAt',
            populate: { path: 'sender', select: 'fullName' }
        });

        if (!updatedConversation) {
            return res.status(404).json({ message: "Conversation not found." });
        }

        // 2. CRITICAL FIX: Mark all actual messages as read in the Message collection
        // This ensures the count logic in GET / remains accurate
        await Message.updateMany(
            { 
                conversation: conversationId, 
                sender: { $ne: userId },   // Messages not sent by me
                readBy: { $ne: userId }    // Messages I haven't read yet
            },
            { 
                $addToSet: { readBy: userId } 
            }
        );

        // 3. Return response
        const convoObj = updatedConversation.toObject ? updatedConversation.toObject() : updatedConversation;
        convoObj.unreadCount = 0; 
        
        // 4. Emit socket event
        const io = req.app.get('socketio'); 
        if (io) {
            io.to(conversationId).emit('conversationUpdated', convoObj);
        }
        
        res.status(200).json(convoObj);

    } catch (error) {
        console.error("Error marking chat as read:", error);
        res.status(500).json({ message: "Server error." });
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
            const convoObj = conversation.toObject ? conversation.toObject() : conversation;
            
            // Get accurate count
            const realUnreadCount = await Message.countDocuments({
                conversation: conversation._id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            });
            
            convoObj.unreadCount = realUnreadCount;
            res.status(200).json(convoObj);
        } else {
            const newConversation = new Conversation({
                participants: [senderId, recipientId],
                isGroupChat: false
            });
            const savedConversation = await newConversation.save();
            await savedConversation.populate('participants', 'fullName profilePictureUrl');
            
            const convoObj = savedConversation.toObject ? savedConversation.toObject() : savedConversation;
            convoObj.unreadCount = 0;
            res.status(201).json(convoObj);
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
        
        const convoObj = savedGroup.toObject ? savedGroup.toObject() : savedGroup;
        convoObj.unreadCount = 0;
        
        res.status(201).json(convoObj);
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

        const convoObj = updatedChat.toObject ? updatedChat.toObject() : updatedChat;
        
        // Get accurate count for return
        const realUnreadCount = await Message.countDocuments({
            conversation: conversationId,
            sender: { $ne: req.user._id },
            readBy: { $ne: req.user._id }
        });
        convoObj.unreadCount = realUnreadCount;
        
        res.status(200).json(convoObj);
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

        const convoObj = updatedConversation.toObject ? updatedConversation.toObject() : updatedConversation;
        
        // Get accurate count
        const realUnreadCount = await Message.countDocuments({
            conversation: conversationId,
            sender: { $ne: req.user._id },
            readBy: { $ne: req.user._id }
        });
        convoObj.unreadCount = realUnreadCount;
        
        res.json(convoObj);
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

// --- REMOVE MEMBER FROM GROUP ---
router.put('/groupremove', protect, async (req, res) => {
    const { conversationId, participantId } = req.body;

    if (!conversationId || !participantId) {
        return res.status(400).json({ message: "Invalid data." });
    }

    try {
        // Prevent removing the admin (optional safety check)
        const conversation = await Conversation.findById(conversationId);
        if (conversation.groupAdmin.toString() === participantId) {
            return res.status(400).json({ message: "Cannot remove the group admin." });
        }

        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { 
                $pull: { participants: participantId } 
            },
            { new: true }
        )
        .populate('participants', 'fullName profilePictureUrl')
        .populate('groupAdmin', 'fullName');

        if (!updatedConversation) {
            return res.status(404).json({ message: "Conversation not found." });
        }

        const convoObj = updatedConversation.toObject ? updatedConversation.toObject() : updatedConversation;
        
        // Get accurate count
        const realUnreadCount = await Message.countDocuments({
            conversation: conversationId,
            sender: { $ne: req.user._id },
            readBy: { $ne: req.user._id }
        });
        convoObj.unreadCount = realUnreadCount;
        
        res.json(convoObj);
    } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).json({ message: "Server error removing member." });
    }
});

module.exports = router;