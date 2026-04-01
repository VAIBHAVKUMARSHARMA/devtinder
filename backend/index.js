require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const initializeSocket = require("./utils/socket");

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 3000;

const allowedOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = origin.replace(/\/+$/, "");
    return allowedOrigins.includes(normalizedOrigin);
};

require("./config/database");

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

app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/connections", require("./routes/connectionRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/ideas", require("./routes/projectIdeaRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/workspaces", require("./routes/workspaceRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));

initializeSocket(server);

app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({
        success: false,
        message: err.message || "Server Error",
        stack: process.env.NODE_ENV === "production" ? null : err.stack
    });
});

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the other server or change PORT in backend/.env.`);
        process.exit(1);
    }

    console.error("Server failed to start:", error.message);
    process.exit(1);
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
