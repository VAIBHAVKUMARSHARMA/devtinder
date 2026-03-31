const socket = require('socket.io');
const crypto = require('crypto');
const Chat = require('../models/Chat');
const Connection = require('../models/Connection');

const getSecretRoomId = (userId, targetUserId) => {
    return crypto.createHash("sha256").update([userId, targetUserId].sort().join("$")).digest("hex");
};

const getAllowedOrigins = () => {
    return (process.env.FRONTEND_URL || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);
};

const workspaceUsersMap = new Map(); // Map<workspaceId, Map<socketId, user>>

const initializeSocket = (server) => {
    const allowedOrigins = getAllowedOrigins();
    const io = socket(server, {
        cors: {
            origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
            credentials: true,
        },
    });

    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}`);

        // Join a room (user's ID) to receive messages
        socket.on('join_room', (roomId) => {
            socket.join(roomId);
            console.log(`User ${socket.id} joined room: ${roomId}`);
        });

        // Join a chat room with another user
        socket.on('join_chat', ({ userId, targetUserId }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.join(roomId);
            console.log(`User ${socket.id} joined chat room: ${roomId}`);
        });

        // Handle sending messages
        socket.on('send_message', async (data) => {
            try {
                const { sender, receiver, content, timestamp, _id } = data;
                console.log(`Message sent from ${sender} to ${receiver}:`, content);

                // Validate required fields
                if (!sender || !receiver || !content) {
                    console.log('Invalid message data:', data);
                    return;
                }

                // Check if users are connected
                const connection = await Connection.findOne({
                    $or: [
                        { requester: sender, recipient: receiver, status: 'accepted' },
                        { requester: receiver, recipient: sender, status: 'accepted' }
                    ]
                });

                if (!connection) {
                    console.log('Users are not connected, message rejected');
                    socket.emit('message_error', { error: 'Users are not connected' });
                    return;
                }

                // Create a new message object
                const newMessage = {
                    senderId: sender,
                    text: content.trim(),
                    timestamp: timestamp ? new Date(timestamp) : new Date()
                };

                // Find or create a chat between these users
                const participants = [sender, receiver];

                // Try to find existing chat
                let chat = await Chat.findOne({
                    participants: { $all: participants }
                });

                // If no chat exists, create a new one
                if (!chat) {
                    chat = new Chat({
                        participants,
                        messages: [newMessage]
                    });
                } else {
                    // Add message to existing chat
                    chat.messages.push(newMessage);
                }

                // Save the chat
                await chat.save();

                // Get the newly added message (last one in the array)
                const savedMessage = chat.messages[chat.messages.length - 1];

                // Create the message payload for the receiver
                const messagePayload = {
                    _id: savedMessage._id,
                    senderId: savedMessage.senderId,
                    text: savedMessage.text,
                    timestamp: savedMessage.timestamp,
                    sender: savedMessage.senderId // For compatibility
                };

                console.log(`Emitting message to receiver: ${receiver}`);

                // Only emit to the recipient's room, not back to the sender
                // This prevents duplicate messages
                io.to(receiver).emit('receive_message', messagePayload);

                // Confirm message sent to sender
                socket.emit('message_sent', {
                    _id: savedMessage._id,
                    tempId: _id, // Original temp ID for frontend matching
                    timestamp: savedMessage.timestamp
                });

            } catch (err) {
                console.error('Error in send_message handler:', err);
                socket.emit('message_error', { error: 'Failed to send message' });
            }
        });

        // Workspace collaborative code editor events
        socket.on('join_workspace', (data) => {
            // Backward compatibility for old calls sending just workspaceId
            const workspaceId = typeof data === "string" ? data : data.workspaceId;
            const user = typeof data === "object" ? data.user : null;

            socket.join(`workspace_${workspaceId}`);
            console.log(`User ${socket.id} joined workspace room: workspace_${workspaceId}`);

            if (user) {
                if (!workspaceUsersMap.has(workspaceId)) {
                    workspaceUsersMap.set(workspaceId, new Map());
                }
                const usersMap = workspaceUsersMap.get(workspaceId);
                // Also track the active file if needed later
                usersMap.set(socket.id, { ...user, activeFile: null });

                // Broadcast updated user list
                io.to(`workspace_${workspaceId}`).emit("workspace_users",
                    Array.from(usersMap.values())
                );
            }
        });

        socket.on('active_file_change', ({ workspaceId, userId, filePath }) => {
            if (workspaceUsersMap.has(workspaceId)) {
                const usersMap = workspaceUsersMap.get(workspaceId);
                if (usersMap.has(socket.id)) {
                    const userData = usersMap.get(socket.id);
                    userData.activeFile = filePath;
                    io.to(`workspace_${workspaceId}`).emit("workspace_users",
                        Array.from(usersMap.values())
                    );
                }
            }
        });

        socket.on('code_change', (data) => {
            const { workspaceId, code, codeFiles } = data;
            socket.to(`workspace_${workspaceId}`).emit('receive_code_change', {
                workspaceId,
                code,
                codeFiles,
                senderId: socket.id
            });
        });

        socket.on('whiteboard_change', (data) => {
            const { workspaceId, whiteboardData } = data;
            socket.to(`workspace_${workspaceId}`).emit('receive_whiteboard_change', {
                workspaceId,
                whiteboardData,
                senderId: socket.id
            });
        });

        socket.on('draft_saved', (data) => {
            const { workspaceId, user } = data;
            socket.to(`workspace_${workspaceId}`).emit('receive_draft_saved', {
                user,
                workspaceId
            });
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);

            // Remove user from all workspace presence maps
            for (const [workspaceId, usersMap] of workspaceUsersMap.entries()) {
                if (usersMap.has(socket.id)) {
                    usersMap.delete(socket.id);
                    io.to(`workspace_${workspaceId}`).emit("workspace_users",
                        Array.from(usersMap.values())
                    );

                    if (usersMap.size === 0) {
                        workspaceUsersMap.delete(workspaceId);
                    }
                }
            }
        });
    });

    return io;
};

module.exports = initializeSocket;
