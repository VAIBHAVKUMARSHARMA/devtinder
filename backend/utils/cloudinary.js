const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Debug logs to verify env vars are loaded
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Cloudinary config missing! Check your .env file.');
    console.error('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    console.error('API Key:', process.env.CLOUDINARY_API_KEY ? 'Present' : 'Missing');
    console.error('API Secret:', process.env.CLOUDINARY_API_SECRET ? 'Present' : 'Missing');
} else {
    console.log('✅ Cloudinary config loaded successfully');
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'dev-connect-profiles',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };