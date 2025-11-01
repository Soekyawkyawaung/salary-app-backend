// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversationModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel'); // Needed for fetching users
const { protect, isAdmin } = require('../middleware/authMiddleware'); // Your auth middleware
const upload = require('../middleware/chatImageUpload');

// --- FETCH Conversations for Logged-in User ---
router.get('/', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        let conversations = await Conversation.find({ participants: userId })
            .populate('participants', 'fullName profilePictureUrl') // Populate participant details
            .populate('groupAdmin', 'fullName') // Populate admin if group
            .populate({
                path: 'lastMessage',
                select: 'content imageUrl sender createdAt', // Select all needed fields
                populate: { path: 'sender', select: 'fullName' }
            })
            // --- END FIX ---
            .sort({ updatedAt: -1 }); // Sort by most recently updated

        // Optional: Filter out conversations where lastMessage is null if desired
        // conversations = conversations.filter(c => c.lastMessage);

        res.json(conversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: "Server error fetching conversations." });
    }
});

// --- START or GET a DM Conversation ---
router.post('/', protect, async (req, res) => {
    const { recipientId } = req.body;
    const senderId = req.user.id;

    if (!recipientId) {
        return res.status(400).json({ message: "Recipient ID is required." });
    }
    if (recipientId === senderId) {
         return res.status(400).json({ message: "Cannot start a conversation with yourself." });
    }

    try {
        // Check if a DM conversation already exists between these two users
        let conversation = await Conversation.findOne({
            isGroupChat: false,
            participants: { $all: [senderId, recipientId], $size: 2 } // Exactly these two participants
        }).populate('participants', 'fullName profilePictureUrl'); // Populate details for frontend

        if (conversation) {
            // Conversation already exists, return it
            res.status(200).json(conversation);
        } else {
            // Create a new DM conversation
            const newConversation = new Conversation({
                participants: [senderId, recipientId],
                isGroupChat: false
            });
            const savedConversation = await newConversation.save();
            // Populate participant details before sending back
            await savedConversation.populate('participants', 'fullName profilePictureUrl');
            res.status(201).json(savedConversation);
        }
    } catch (error) {
        console.error("Error starting/getting DM conversation:", error);
        res.status(500).json({ message: "Server error handling conversation." });
    }
});

// --- CREATE a Group Chat ---
router.post('/group', protect, async (req, res) => {
    const { groupName, participantIds } = req.body; // Expecting an array of user IDs
    const adminId = req.user.id;

    if (!groupName || !participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
        return res.status(400).json({ message: "Group name and at least one participant (besides yourself) are required." });
    }

    // Add the admin to the participants list if not already included
    const allParticipants = [...new Set([adminId, ...participantIds])]; // Use Set to avoid duplicates

    if (allParticipants.length < 2) {
         return res.status(400).json({ message: "A group chat needs at least 2 participants (including admin)." });
    }

    try {
        const newGroupConversation = new Conversation({
            participants: allParticipants,
            isGroupChat: true,
            groupName: groupName.trim(),
            groupAdmin: adminId
        });
        const savedGroup = await newGroupConversation.save();
        // Populate details before sending back
        await savedGroup.populate('participants', 'fullName profilePictureUrl');
        await savedGroup.populate('groupAdmin', 'fullName');

        res.status(201).json(savedGroup);
    } catch (error) {
        console.error("Error creating group chat:", error);
        res.status(500).json({ message: "Server error creating group chat." });
    }
});


// --- FETCH Messages for a Conversation (Add Pagination Later) ---
router.get('/messages/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    try {
        // Optional but recommended: Check if the user is part of this conversation
        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
        if (!conversation) {
            return res.status(403).json({ message: "Not authorized to view these messages." });
        }

        const messages = await Message.find({ conversation: conversationId })
            .populate('sender', 'fullName profilePictureUrl') // Populate sender details
            .sort({ createdAt: 1 }); // Oldest messages first

        res.json(messages);
    } catch (error) {
        console.error(`Error fetching messages for conversation ${conversationId}:`, error);
        res.status(500).json({ message: "Server error fetching messages." });
    }
});

// routes/chatRoutes.js

// ... (other routes like GET /, POST /, POST /group, etc. are fine) ...

// --- MARK Conversation as Read (CORRECTED) ---
router.post('/read/:conversationId', protect, async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;

    try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found." });
        }
        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ message: "Not authorized." });
        }
        
        const updateField = `unreadCounts.${userId}`;
        let populatedConversation; // We will store the final populated doc here

        if (conversation.unreadCounts.get(userId) > 0) {
            // --- IF UNREAD > 0: Update DB and return populated doc ---
            const updatedConversation = await Conversation.findByIdAndUpdate(
                conversationId,
                { $set: { [updateField]: 0 } },
                { new: true }
            );

            // Emit to socket
            const io = req.app.get('socketio'); 
            if (io) {
                // We must populate *before* emitting to the socket
                await updatedConversation.populate([
                    { path: 'participants', select: 'fullName profilePictureUrl' },
                    { path: 'groupAdmin', select: 'fullName' },
                    { 
                        path: 'lastMessage',
                        select: 'content imageUrl sender createdAt',
                        populate: { path: 'sender', select: 'fullName' }
                    }
                ]);
                io.to(conversationId).emit('conversationUpdated', updatedConversation);
            }
            
            // Re-assign for the final response
            populatedConversation = updatedConversation;

        } else {
            // --- IF UNREAD == 0: Just return the populated doc ---
            // The document is already read, but ChatWindow still needs
            // the populated 'lastMessage' to avoid "No Content"
            populatedConversation = conversation; // Use the one we found at the start
        }

        // --- COMMON POPULATE STEP ---
        // Ensure the conversation sent back to the user is *always* fully populated
        // This runs for both if/else cases if not already populated
        // We check if lastMessage.content exists, a simple way to see if it's populated
        if (!populatedConversation.lastMessage || populatedConversation.lastMessage.content === undefined) {
             await populatedConversation.populate([
                { path: 'participants', select: 'fullName profilePictureUrl' },
                { path: 'groupAdmin', select: 'fullName' },
                { 
                    path: 'lastMessage',
                    select: 'content imageUrl sender createdAt',
                    populate: { path: 'sender', select: 'fullName' }
                }
            ]);
        }
        
        // Return the fully populated doc
        res.status(200).json(populatedConversation); 

    } catch (error) {
        console.error("Error marking chat as read:", error);
        res.status(500).json({ message: "Server error." });
    }
});



// (Admins see all approved employees, Employees might only see Admin)
router.get('/users/chat-list', protect, async (req, res) => {
     try {
         let query = {};
         if (req.user.role === 'admin') {
             // Admin sees all approved employees (excluding self)
             query = { role: 'employee', status: 'approved', _id: { $ne: req.user.id } };
         } else {
             // Employee sees only admins (excluding self)
             query = { role: 'admin', _id: { $ne: req.user.id } };
             // // OR Employee sees admin AND other approved employees (uncomment if desired)
             // query = {
             //     status: 'approved',
             //     _id: { $ne: req.user.id }
             // };
         }

         const users = await User.find(query)
             .select('fullName profilePictureUrl email') // Select necessary fields
             .sort({ fullName: 1 });
         res.json(users);
     } catch (error) {
        console.error("Error fetching chat users list:", error);
        res.status(500).json({ message: "Server error fetching users." });
     }
});

// --- MODIFIED: Route for uploading chat images ---
router.post('/upload-image', protect, upload.single('chatImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No image file provided or file type not allowed." });
    }
    
    // req.file.path is now the full secure Cloudinary URL (https://...)
    // req.file.filename is the Cloudinary public_id
    res.status(200).json({
        imageUrl: req.file.path,
        imageCloudinaryId: req.file.filename 
    });
});

module.exports = router;