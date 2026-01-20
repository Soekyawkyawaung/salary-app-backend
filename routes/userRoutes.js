// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Import mongoose to check ObjectId validity
const User = require('../models/userModel');
const generateToken = require('../utils/generateToken');
const { protect, isAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinaryConfig');
const streamifier = require('streamifier');

// --- POST Routes ---
router.post('/register', async (req, res) => {
    const { fullName, email, password, birthday } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const user = await User.create({ fullName, email, password, birthday });
        if (user) {
            res.status(201).json({ message: 'Registration successful! Your account is pending admin approval.' });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
           if (user.role !== 'admin' && user.status !== 'approved') {
                const message = user.status === 'pending' ? 'Account is pending admin approval.'
                    : user.status === 'rejected' ? 'Account access has been rejected.'
                    : 'Account is not yet approved.';
                return res.status(401).json({ message: message });
            }
            res.json({
                _id: user._id, fullName: user.fullName, email: user.email, role: user.role,
                profilePictureUrl: user.profilePictureUrl, birthday: user.birthday, status: user.status,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// --- Profile Picture Upload Route ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits:{fileSize: 1000000}, // 1MB limit
    fileFilter: function(req, file, cb){ checkFileType(file, cb); }
}).single('profilePicture');

function checkFileType(file, cb){
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if(mimetype && extname){ return cb(null,true); } else { cb('Error: Images Only!'); }
}

router.post('/upload-picture', protect, (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err instanceof multer.MulterError ? err.message : err });
        if (req.file == undefined) return res.status(400).json({ message: 'No file selected!' });

        let streamUpload = (req) => {
             return new Promise((resolve, reject) => {
                let stream = cloudinary.uploader.upload_stream(
                    { folder: "salary-app-profiles", resource_type: "auto" },
                    (error, result) => { result ? resolve(result) : reject(error); }
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
            });
        };

        try {
            const result = await streamUpload(req);
            const user = await User.findById(req.user.id);
            if (!user) return res.status(404).json({ message: 'User not found' });
            user.profilePictureUrl = result.secure_url;
            user.profilePicture = undefined; // Clear old local path field if it exists
            const updatedUser = await user.save();
            res.json({
                _id: updatedUser._id, fullName: updatedUser.fullName, email: updatedUser.email,
                role: updatedUser.role, profilePictureUrl: updatedUser.profilePictureUrl,
                birthday: updatedUser.birthday, status: updatedUser.status, token: generateToken(updatedUser._id)
             });
        } catch (dbError) {
             console.error("DB error after upload:", dbError);
             res.status(500).json({ message: 'Server error saving picture reference.' });
        }
    });
});

// --- PUT Routes ---
router.put('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user) {
            user.fullName = req.body.fullName || user.fullName;
            if (!user.birthday && req.body.birthday) {
                user.birthday = req.body.birthday;
            }
            const updatedUser = await user.save();
            res.json({
                _id: updatedUser._id, fullName: updatedUser.fullName, email: updatedUser.email, role: updatedUser.role,
                profilePictureUrl: updatedUser.profilePictureUrl, birthday: updatedUser.birthday, status: updatedUser.status,
                token: generateToken(updatedUser._id),
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});

router.put('/change-password', protect, async (req, res) => {
     const { currentPassword, newPassword } = req.body;
     try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (await user.matchPassword(currentPassword)) {
            if (!newPassword || newPassword.length < 6) {
                 return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
            }
            user.password = newPassword;
            await user.save();
            res.json({ message: 'Password updated successfully' });
        } else {
            res.status(401).json({ message: 'Incorrect current password' });
        }
     } catch (error) {
         console.error("Password change error:", error);
         res.status(500).json({ message: 'Server error changing password' });
     }
});

router.put('/:id/approve', protect, isAdmin, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid employee ID format.' });
    }
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'admin') return res.status(400).json({ message: 'Cannot change status of an admin.' });
        if (user.status === 'approved') return res.status(400).json({ message: 'User is already approved' });
        user.status = 'approved';
        await user.save();
        res.json({ message: `User ${user.fullName} approved successfully.` });
    } catch (error) {
        console.error("Error approving user:", error);
        res.status(500).json({ message: 'Server error approving user' });
    }
});

router.put('/:id/decline', protect, isAdmin, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid employee ID format.' });
    }
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'admin') return res.status(400).json({ message: 'Cannot change status of an admin.' });
        if (user.status === 'rejected') return res.status(400).json({ message: 'User is already rejected.' });
        user.status = 'rejected';
        await user.save();
        res.json({ message: `User ${user.fullName} declined successfully.` });
    } catch (error) {
        console.error("Error declining user:", error);
        res.status(500).json({ message: 'Server error declining user.' });
    }
});


// --- Specific GET Routes (MUST come before /:id) ---

// 1. Get Pending Users
router.get('/pending', protect, isAdmin, async (req, res) => {
    try {
        const pendingUsers = await User.find({ status: 'pending', role: { $ne: 'admin' } })
                                        .select('-password').sort({ createdAt: -1 });
        res.json(pendingUsers);
    } catch (error) {
        console.error("Error fetching pending users:", error);
        res.status(500).json({ message: 'Server error fetching pending users' });
    }
});

// 2. Get Chat List
router.get('/chat-list', protect, async (req, res) => {
     try {
         let query = {};
         if (req.user.role === 'admin') {
             query = { role: 'employee', status: 'approved', _id: { $ne: req.user.id } };
         } else {
             query = { role: 'admin', _id: { $ne: req.user.id } };
         }
         const users = await User.find(query)
             .select('fullName profilePictureUrl email')
             .sort({ fullName: 1 });
         res.json(users);
     } catch (error) {
        console.error("Error fetching chat users list:", error);
        res.status(500).json({ message: "Server error fetching users." });
     }
});

// 3. Get All Users (Fixes the 400 Bad Request Error for /users/all)
// This must be placed BEFORE the /:id route
router.get('/all', protect, isAdmin, async (req, res) => {
    try {
        console.log("Fetching all approved employees for dropdowns...");
        const users = await User.find({ role: 'employee', status: 'approved' })
                           .select('-password')
                           .sort({ fullName: 1 });
        res.json(users);
    } catch (error) {
        console.error("Error fetching all employees:", error);
        res.status(500).json({ message: "Server error fetching employees." });
    }
});

// 4. Base GET Route (Optional, does same as /all but good for REST standards)
router.get('/', protect, isAdmin, async (req, res) => {
    try {
        const users = await User.find({ role: 'employee', status: 'approved' })
                           .select('-password')
                           .sort({ fullName: 1 });
        res.json(users);
    } catch (error) {
        console.error("Error fetching approved employees:", error);
        res.status(500).json({ message: "Server error fetching approved employees." });
    }
});

// --- Parameterized GET Route (MUST come LAST) ---
// This handles /:id. If 'all' falls through to here, it causes the CastError.
router.get('/:id', protect, isAdmin, async (req, res) => {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: `Invalid employee ID format.` });
    }
    try {
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        res.json(user);
    } catch (error) {
        console.error(`Error fetching employee ${userId}:`, error);
        if (error.name === 'CastError') {
             return res.status(400).json({ message: `Invalid employee ID format: ${userId}` });
        }
        res.status(500).json({ message: 'Server error fetching employee data.' });
    }
});


// --- DELETE Route ---
router.delete('/:id', protect, isAdmin, async (req, res) => {
    const userId = req.params.id;
     if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid employee ID format.' });
    }
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'Cannot delete an admin account.' });
        }
        await User.deleteOne({ _id: userId });
        res.json({ message: 'Employee account deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting employee ${userId}:`, error);
         if (error.name === 'CastError') {
             return res.status(400).json({ message: `Invalid employee ID format: ${userId}` });
        }
        res.status(500).json({ message: 'Server error deleting employee account.' });
    }
});

module.exports = router;