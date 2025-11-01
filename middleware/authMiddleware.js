const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

// Middleware to check if the user is authenticated
const protect = async (req, res, next) => {
    let token;
    // --- ADD LOGGING ---
    console.log(`[Protect] Request to: ${req.originalUrl}`);
    console.log('[Protect] Auth Header:', req.headers.authorization);
    // --- END LOGGING ---

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            // --- ADD LOGGING ---
            console.log('[Protect] Token Extracted:', token ? 'Yes' : 'No');
            // --- END LOGGING ---

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // --- ADD LOGGING ---
            console.log('[Protect] Token Decoded ID:', decoded.id);
            // --- END LOGGING ---

            req.user = await User.findById(decoded.id).select('-password');
            // --- ADD LOGGING ---
            console.log('[Protect] User Found in DB:', req.user ? `${req.user._id} (${req.user.role})` : 'No');
            // --- END LOGGING ---

            if (!req.user) { // Explicit check
                return res.status(401).json({ message: 'Not authorized, user not found for token' });
            }

            next(); // Proceed if user found
        } catch (error) {
            console.error('[Protect] Error:', error.message); // Log the specific error
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else if (!token) { // Check if token wasn't found in the header at all
        // --- ADD LOGGING ---
        console.log('[Protect] No Bearer token found in header.');
        // --- END LOGGING ---
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
    // --- ADD LOGGING ---
    console.log(`[isAdmin] Check for: ${req.originalUrl}`);
    console.log('[isAdmin] User attached by protect:', req.user ? `${req.user._id} (${req.user.role})` : 'No');
    // --- END LOGGING ---

    if (req.user && req.user.role === 'admin') {
        console.log('[isAdmin] Access granted.'); // Log success
        next(); // User is admin, proceed
    } else {
        console.warn('[isAdmin] Access DENIED.'); // Log failure
        res.status(401).json({ message: 'Not authorized as an admin' });
    }
};

module.exports = { protect, isAdmin };