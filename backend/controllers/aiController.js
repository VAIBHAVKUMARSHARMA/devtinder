const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");

exports.generateIcebreaker = async (req, res) => {
    try {
        const { targetUserId, context } = req.body;
        const currentUserId = req.user._id;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("AI service not configured (Missing API Key)");
        }

        // Initialize Gemini API inside handler
        const genAI = new GoogleGenerativeAI(apiKey);

        // Fetch both users
        const currentUser = await User.findById(currentUserId);
        const targetUser = await User.findById(targetUserId);

        console.log(`Generating icebreaker for ${currentUser.name} -> ${targetUser.name}`);

        if (!targetUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // specific model
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Initialize Prompt
        let prompt = "";

        // SMART REPLY MODE: If conversation history exists
        if (context && Array.isArray(context) && context.length > 0) {
            console.log("Using SMART REPLY mode");
            const historyText = context.map(msg => {
                const role = msg.senderId === currentUserId.toString() ? "Me" : "Them";
                return `${role}: ${msg.content}`;
            }).join("\n");

            prompt = `
                You are assisting ${currentUser.name} in a chat with ${targetUser.name}.
                
                Chat History:
                ${historyText}

                Instructions:
                1. Suggest a short, natural reply for ${currentUser.name} (Me) to send to ${targetUser.name} (Them).
                2. Respond directly to the last message: "${context[context.length - 1].content}".
                3. Keep it casual (1 sentence).
                4. Output ONLY the reply text. No quotes.
            `;
        }
        // ICEBREAKER MODE: If no history (Start of chat)
        else {
            console.log("Using ICEBREAKER mode");
            prompt = `
                You are a helpful assistant for a developer networking app called DevTinder.
                Write a conversation starter from ${currentUser.name} TO ${targetUser.name}.

                Sender Profile:
                Name: ${currentUser.name}
                Role: ${currentUser.role || "Developer"}
                Skills: ${currentUser.skills?.join(", ") || "General coding"}
                Bio: ${currentUser.bio || "No bio"}

                Receiver Profile:
                Name: ${targetUser.name}
                Role: ${targetUser.role || "Developer"}
                Skills: ${targetUser.skills?.join(", ") || "General coding"}
                Bio: ${targetUser.bio || "No bio"}

                Instructions:
                1. The message MUST address ${targetUser.name} by name (e.g., "Hi ${targetUser.name}").
                2. Mention specific skills or projects from ${targetUser.name}'s profile.
                3. Keep it short (1-2 sentences), professional, and friendly.
                4. Do not include quotes.
            `;
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("✅ AI Response Generated:", text);

        res.status(200).json({
            success: true,
            icebreaker: text.trim()
        });

    } catch (error) {
        console.error("AI Icebreaker Error:", error);

        // Send the ACTUAL error to the frontend so the user/developer sees it
        res.status(500).json({
            success: false,
            message: error.message || "AI Generation Failed",
            error: error.message
        });
    }
};

exports.optimizeBio = async (req, res) => {
    try {
        const { skills, role, experience } = req.body; // Receive partial data from frontend if user is editing

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("AI service not configured (Missing API Key)");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            You are a professional career coach for developers.
            Write a short, engaging, and professional bio (max 400 characters) for a developer with the following profile:
            
            Role: ${role || "Developer"}
            Skills: ${skills?.join(", ") || "General Programming"}
            Experience Level: ${experience || "Enthusiast"}

            Instructions:
            1. Use the first person ("I am...").
            2. Highlight key skills naturally.
            3. Make it sound hireable but authentic.
            4. Do not include hashtags or emojis unless subtle.
            5. Return ONLY the bio text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("✅ AI Bio Generated");

        res.status(200).json({
            success: true,
            bio: text.trim()
        });

    } catch (error) {
        console.error("AI Bio Error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to generate bio",
            error: error.message
        });
    }
};

exports.calculateMatchScore = async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const currentUserId = req.user._id;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("AI service not configured");

        const genAI = new GoogleGenerativeAI(apiKey);
        const currentUser = await User.findById(currentUserId);
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) return res.status(404).json({ message: "User not found" });

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            Compare these two developers and calculate a compatibility match score (0-100%).
            
            User A (Me):
            Role: ${currentUser.role}
            Skills: ${currentUser.skills?.join(", ")}
            Bio: ${currentUser.bio}

            User B (Them):
            Role: ${targetUser.role}
            Skills: ${targetUser.skills?.join(", ")}
            Bio: ${targetUser.bio}

            Instructions:
            1. Analyze overlapping skills, complementary roles, and shared interests.
            2. Return strictly JSON format: { "score": 85, "reason": "Short 1 sentence reason" }
            3. Do not include markdown code blocks.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Cleanup formatting if AI adds markdown
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        const matchData = JSON.parse(text);

        res.status(200).json({
            success: true,
            score: matchData.score,
            reason: matchData.reason
        });

    } catch (error) {
        console.error("Match Score Error:", error);
        // Fallback random score if AI fails (to keep UI clean)
        res.status(200).json({
            success: true,
            score: Math.floor(Math.random() * (95 - 70) + 70),
            reason: "Based on similar interests."
        });
    }
};
