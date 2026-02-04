const dotenvResult = require("dotenv").config();
if (dotenvResult.error) {
    console.error("❌ Dotenv Error:", dotenvResult.error);
} else {
    console.log("✅ Dotenv loaded");
    console.log("Loaded Env Keys:", Object.keys(dotenvResult.parsed || {}));
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const initializeSocket = require("./utils/socket");
const app = express();
const server = http.createServer(app);


// Connect to database
require('./config/database');

require('./config/passport');
const passport = require('passport');

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/connections', require('./routes/connectionRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

initializeSocket(server);

initializeSocket(server);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Server Error',
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
});

// Start server
server.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
