const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { protect, isAdmin } = require('../middleware/authMiddleware'); 
const upload = require('../config/cloudinaryConfig');

router.post('/register', async (req, res) => {
    try {
        
        const { fullName, email, password, birthday } = req.body;

        if (!fullName || !email || !password || !birthday) {
            return res.status(400).json({ message: 'Please provide all required fields.' });
        }
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            fullName,
            email,
            password: hashedPassword,
            birthday 
        });
        await user.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// --- POST /api/users/login ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            const payload = { id: user._id, role: user.role };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

            
            res.status(200).json({
                message: "Login successful!",
                token: token,
                user: {
                    _id: user._id, 
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    profilePictureUrl: user.profilePictureUrl,
                    birthday: user.birthday 
                }
            });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


router.post('/upload-picture', protect, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        const user = await User.findById(req.user.id);
        if (user) {
            user.profilePictureUrl = req.file.path;
            await user.save();
            
            
            res.json({
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                profilePictureUrl: user.profilePictureUrl,
                birthday: user.birthday // This line was missing
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


// --- GET /api/users ---
router.get('/', protect, isAdmin, async (req, res) => {
    try {
        const employees = await User.find({ role: 'employee' }).select('-password');
        res.json(employees);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/verify-details', async (req, res) => {
    try {
        const { email, birthday } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User with this email not found.' });
        }

        // Compare the date part only (YYYY-MM-DD), ignoring timezones
        const userBirthday = new Date(user.birthday).toISOString().split('T')[0];
        const providedBirthday = new Date(birthday).toISOString().split('T')[0];

        if (userBirthday === providedBirthday) {
            res.json({ success: true, message: 'Verification successful.' });
        } else {
            res.status(400).json({ success: false, message: 'Birthday does not match.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// --- NEW: Reset password after successful verification ---
router.put('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ message: 'Password has been reset successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});



router.put('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user) {
            user.fullName = req.body.fullName || user.fullName;
            user.birthday = req.body.birthday || user.birthday;
            
            const updatedUser = await user.save();
            res.json({
                _id: updatedUser._id,
                fullName: updatedUser.fullName,
                email: updatedUser.email,
                role: updatedUser.role,
                profilePictureUrl: updatedUser.profilePictureUrl,
                birthday: updatedUser.birthday
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// --- NEW: Change user password ---
router.put('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        if (user && (await bcrypt.compare(currentPassword, user.password))) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            await user.save();
            res.json({ message: 'Password updated successfully' });
        } else {
            res.status(401).json({ message: 'Invalid current password' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});



module.exports = router;