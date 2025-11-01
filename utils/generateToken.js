// utils/generateToken.js
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    // Replace 'YOUR_JWT_SECRET' with the actual secret key you have
    // stored in your .env file (e.g., process.env.JWT_SECRET)
    // Make sure you have a JWT_SECRET variable in your .env file!
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        console.error('JWT_SECRET is not defined in .env file!');
        throw new Error('JWT Secret not configured'); // Or handle appropriately
    }

    return jwt.sign({ id }, secret, {
        expiresIn: '30d', // Token expires in 30 days (adjust as needed)
    });
};

module.exports = generateToken;