const https = require('https');
require("dotenv").config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    console.log("Listing models with key: " + key?.substring(0, 10) + "...");

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
            return;
        }

        console.log("Found Models:");
        if (data.models) {
            data.models.forEach(m => {
                console.log(`- ${m.name}`);
                console.log(`  Methods: ${m.supportedGenerationMethods}`);
            });
        } else {
            console.log("No models returned. Response:", data);
        }

    } catch (error) {
        console.error("Fetch Error:", error.message);
    }
}

listModels();
