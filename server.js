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
// Serve files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

// --- API Routes ---
const userRoutes = require('./routes/userRoutes');
const mainCategoryRoutes = require('./routes/mainCategoryRoutes');
const subcategoryRoutes = require('./routes/subcategoryRoutes');
const workLogRoutes = require('./routes/workLogRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const chatRoutes = require('./routes/chatRoutes');

app.use('/api/users', userRoutes);
app.use('/api/main-categories', mainCategoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/worklogs', workLogRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/chat', chatRoutes);

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
              
              // --- FIX: Disconnect previous socket for same user ---
              const previousSocketId = userSocketMap[userId];
              if (previousSocketId && previousSocketId !== socket.id && io.sockets.sockets.get(previousSocketId)) {
                  console.log(`🔌 Disconnecting previous socket ${previousSocketId} for user ${userId}`);
                  io.sockets.sockets.get(previousSocketId).disconnect(true);
              }
              
              userSocketMap[userId] = socket.id;
              socketUserMap[socket.id] = userId;
              console.log(`User ${userId} authenticated for socket ${socket.id}`);

              // --- 2. Joining Rooms ---
              socket.join(userId);
              console.log(`Socket ${socket.id} joined personal room ${userId}`);

              const conversations = await Conversation.find({ participants: userId }).select('_id');
              conversations.forEach(convo => {
                  socket.join(convo._id.toString());
                  console.log(`Socket ${socket.id} joined conversation room ${convo._id.toString()}`);
              });
          } else {
             console.log(`Authentication failed: User ${decoded.id} not found.`);
             socket.disconnect();
             return;
          }
      } catch (err) {
          console.log("Socket Authentication error:", err.message);
          socket.disconnect();
          return;
      }
  } else {
      console.log("No auth token provided for socket connection.");
      socket.disconnect();
      return;
  }
  // --- End Authentication ---

  // --- 3. Handle 'joinRoom' event ---
  socket.on('joinRoom', async (conversationId) => {
      const currentUserId = socketUserMap[socket.id];
      if (!currentUserId || !conversationId) return;

      try {
          const conversation = await Conversation.findOne({ _id: conversationId, participants: currentUserId });
          if (conversation) {
              console.log(`Socket ${socket.id} (User ${currentUserId}) joining conversation room ${conversationId}`);
              socket.join(conversationId);
          } else {
              console.log(`User ${currentUserId} attempted to join unauthorized room ${conversationId}`);
          }
      } catch (error) {
          console.error(`Error joining room ${conversationId}:`, error);
      }
  });

  // --- 4. Handle 'sendMessage' event (FIXED with duplicate prevention) ---
  socket.on('sendMessage', async ({ conversationId, content, imageUrl, imageCloudinaryId, pendingId }) => {
      const senderId = socketUserMap[socket.id];
      
      // --- FIX: Duplicate message prevention ---
      const messageKey = `${conversationId}-${senderId}-${content || imageUrl}-${Date.now()}`;
      if (socket.lastMessageKey === messageKey) {
          console.log('🔄 Ignoring duplicate sendMessage event');
          return;
      }
      socket.lastMessageKey = messageKey;

      if (!senderId || !conversationId || (!content && !imageUrl)) {
          console.log("sendMessage event failed: Missing data or no content/image.");
          socket.emit('messageError', { message: "Failed to send message: Invalid data." });
          return;
      }

      console.log(`📨 Processing message from ${senderId} in ${conversationId}: ${content ? content.substring(0, 20) : '[Image]'}...`);

      try {
          const conversation = await Conversation.findOne({ _id: conversationId, participants: senderId });
          if (!conversation) {
               console.log(`sendMessage failed: User ${senderId} not part of convo ${conversationId}`);
               socket.emit('messageError', { message: "Not authorized to send message." });
               return;
          }

          // Create and save message
          const newMessage = new Message({
              sender: senderId,
              content: content ? content.trim() : undefined,
              imageUrl: imageUrl,
              imageCloudinaryId: imageCloudinaryId,
              conversation: conversationId,
              readBy: [senderId]
          });
          const savedMessage = await newMessage.save();

          await savedMessage.populate('sender', 'fullName profilePictureUrl');

          // --- Unread Count Logic ---
          const unreadUpdates = {};
          conversation.participants.forEach(participantId => {
              const idString = participantId.toString();
              if (idString !== senderId) { 
                  const currentCount = conversation.unreadCounts.get(idString) || 0;
                  unreadUpdates[`unreadCounts.${idString}`] = currentCount + 1;
              }
          });

          // Update conversation with lastMessage AND new unread counts
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
          
          // --- Broadcast Events ---
          // Broadcast the new message, passing the pendingId back
          console.log(`📤 Broadcasting message ${savedMessage._id} to room ${conversationId}`);
          io.to(conversationId).emit('receiveMessage', { 
              ...savedMessage.toObject(), // Convert Mongoose doc to plain object
              pendingId: pendingId // Attach the pendingId
          });

          // Broadcast the updated conversation
          console.log(`📤 Broadcasting updated convo ${conversationId}`);
          io.to(conversationId).emit('conversationUpdated', updatedConversation);

      } catch (error) {
          console.error("❌ Error handling sendMessage:", error);
          socket.emit('messageError', { message: "Failed to save or broadcast message." });
      }
  });

  // --- 5. Handle Disconnect ---
  socket.on('disconnect', (reason) => {
    const disconnectedUserId = socketUserMap[socket.id];
    console.log(`User ${disconnectedUserId} (Socket ${socket.id}) disconnected. Reason: ${reason}`);
    if (disconnectedUserId) {
        delete userSocketMap[disconnectedUserId]; // Remove mapping
    }
    delete socketUserMap[socket.id]; // Remove mapping
  });
});
// --- End Socket.IO ---

// --- Start the Server (Use the 'server' object) ---
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => { // Use server.listen
    console.log(`Server is running on port: ${PORT}`);
});