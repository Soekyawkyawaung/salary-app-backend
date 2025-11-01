// In: config/cloudinaryConfig.js

const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

// Load environment variables from your .env file
dotenv.config(); 

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Export the configured cloudinary object
module.exports = cloudinary;