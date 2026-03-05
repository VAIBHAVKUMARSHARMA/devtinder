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

const allowedOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const normalizedOrigin = origin.replace(/\/+$/, "");
    return allowedOrigins.includes(normalizedOrigin);
};

// Connect to database
require('./config/database');

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/connections', require('./routes/connectionRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/ideas', require('./routes/projectIdeaRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/workspaces', require('./routes/workspaceRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));

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
