import { createApiClient } from "@/lib/axios";
import { API_BASE_URL } from "@/lib/runtimeConfig";

// Create axios instance with credentials (cookies)
const axiosInstance = createApiClient(`${API_BASE_URL}/ai`);

export const getIcebreaker = async (targetUserId, context = []) => {
    try {
        const response = await axiosInstance.post("/icebreaker", { targetUserId, context });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || "Failed to generate icebreaker";
    }
};

export const optimizeBio = async (profileData) => {
    try {
        const response = await axiosInstance.post("/bio", profileData);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || "Failed to generate bio";
    }
};

export const getMatchScore = async (targetUserId) => {
    try {
        const response = await axiosInstance.post("/match", { targetUserId });
        return response.data;
    } catch (error) {
        console.error("Match score error:", error);
        return { score: 0, reason: "Could not calculate" };
    }
};
