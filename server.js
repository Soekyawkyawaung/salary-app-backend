// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');

// Import Database Models
const User = require('./models/userModel');
const Conversation = require('./models/conversationModel');
const Message = require('./models/messageModel');

const app = express();
const server = http.createServer(app);

// --- CORS for Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: [
        'https://goldenfalcon.netlify.app',
        'http://localhost:5173'
    ],
    methods: ["GET", "POST"]
  }
});

// --- Make io accessible to API routes ---
app.set('socketio', io);

// --- CORS for Express ---
const corsOptions = {
    origin: [
        'https://goldenfalcon.netlify.app',
        'http://localhost:5173'
    ],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// --- Database Connection ---
const uri = process.env.MONGO_URI;
mongoose.connect(uri)
    .then(() => console.log("MongoDB connection established successfully"))
    .catch(err => console.error("MongoDB connection error:", err));

// --- Static File Serving ---
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// --- API Routes ---
const userRoutes = require('./routes/userRoutes');
const mainCategoryRoutes = require('./routes/mainCategoryRoutes');
const subcategoryRoutes = require('./routes/subcategoryRoutes');
const workLogRoutes = require('./routes/workLogRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const chatRoutes = require('./routes/chatRoutes');

const advanceRoutes = require('./routes/advanceRoutes');
const fineRoutes = require('./routes/fineRoutes');


app.use('/api/advance', advanceRoutes);

app.use('/api/users', userRoutes);
app.use('/api/main-categories', mainCategoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/worklogs', workLogRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/fines', fineRoutes);


// --- Socket.IO Connection Logic ---

const userSocketMap = {}; // { userId: socketId }
const socketUserMap = {}; // { socketId: userId }


io.on('connection', async (socket) => {
  console.log('A user connected:', socket.id);

  // --- 1. Authentication ---
  const authHeader = socket.handshake.auth.token;
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await User.findById(decoded.id).select('_id');
          if (user) {
              userId = user._id.toString();
              
              const previousSocketId = userSocketMap[userId];
              if (previousSocketId && previousSocketId !== socket.id && io.sockets.sockets.get(previousSocketId)) {
                  console.log(`伯 Disconnecting previous socket ${previousSocketId} for user ${userId}`);
                  io.sockets.sockets.get(previousSocketId).disconnect(true);
              }
              
              userSocketMap[userId] = socket.id;
              socketUserMap[socket.id] = userId;
              console.log(`User ${userId} authenticated for socket ${socket.id}`);

              // --- 2. Joining Rooms ---
              socket.join(userId);
              const conversations = await Conversation.find({ participants: userId }).select('_id');
              conversations.forEach(convo => {
                  socket.join(convo._id.toString());
              });
          } else {
             socket.disconnect();
             return;
          }
      } catch (err) {
          socket.disconnect();
          return;
      }
  } else {
      socket.disconnect();
      return;
  }

  // --- 3. Handle 'joinRoom' event ---
  socket.on('joinRoom', async (conversationId) => {
      const currentUserId = socketUserMap[socket.id];
      if (!currentUserId || !conversationId) return;

      try {
          const conversation = await Conversation.findOne({ _id: conversationId, participants: currentUserId });
          if (conversation) {
              socket.join(conversationId);
          }
      } catch (error) {
          console.error(`Error joining room ${conversationId}:`, error);
      }
  });

  // --- 4. Handle 'sendMessage' event (FIXED FOR QUOTES) ---
  socket.on('sendMessage', async ({ conversationId, content, imageUrl, imageCloudinaryId, pendingId, replyTo }) => {
      const senderId = socketUserMap[socket.id];
      
      const messageKey = `${conversationId}-${senderId}-${content || imageUrl}-${Date.now()}`;
      if (socket.lastMessageKey === messageKey) return;
      socket.lastMessageKey = messageKey;

      if (!senderId || !conversationId || (!content && !imageUrl)) {
          socket.emit('messageError', { message: "Failed to send message: Invalid data." });
          return;
      }

      try {
          const conversation = await Conversation.findOne({ _id: conversationId, participants: senderId });
          if (!conversation) {
               socket.emit('messageError', { message: "Not authorized to send message." });
               return;
          }

          // --- FIX 1: Include 'replyTo' in creation ---
          const newMessage = new Message({
              sender: senderId,
              content: content ? content.trim() : undefined,
              imageUrl: imageUrl,
              imageCloudinaryId: imageCloudinaryId,
              conversation: conversationId,
              readBy: [senderId],
              replyTo: replyTo || null // Save the quote ID
          });
          const savedMessage = await newMessage.save();

          // --- FIX 2: Populate 'replyTo' for immediate display ---
          await savedMessage.populate([
              { path: 'sender', select: 'fullName profilePictureUrl' },
              { 
                  path: 'replyTo', 
                  select: 'content sender imageUrl',
                  populate: { path: 'sender', select: 'fullName' }
              }
          ]);

          const unreadUpdates = {};
          conversation.participants.forEach(participantId => {
              const idString = participantId.toString();
              if (idString !== senderId) { 
                  const currentCount = conversation.unreadCounts.get(idString) || 0;
                  unreadUpdates[`unreadCounts.${idString}`] = currentCount + 1;
              }
          });

          const updatedConversation = await Conversation.findByIdAndUpdate(
              conversationId,
              { $set: { lastMessage: savedMessage._id, ...unreadUpdates } },
              { new: true }
          )
          .populate('participants', 'fullName profilePictureUrl')
          .populate('groupAdmin', 'fullName')
          .populate({
              path: 'lastMessage',
              select: 'content imageUrl sender createdAt',
              populate: { path: 'sender', select: 'fullName' }
          });
          
          io.to(conversationId).emit('receiveMessage', { 
              ...savedMessage.toObject(), 
              pendingId: pendingId 
          });

          io.to(conversationId).emit('conversationUpdated', updatedConversation);

      } catch (error) {
          console.error("Error handling sendMessage:", error);
          socket.emit('messageError', { message: "Failed to save or broadcast message." });
      }
  });

  // --- 5. Handle Disconnect ---
  socket.on('disconnect', (reason) => {
    const disconnectedUserId = socketUserMap[socket.id];
    if (disconnectedUserId) {
        delete userSocketMap[disconnectedUserId]; 
    }
    delete socketUserMap[socket.id]; 
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});