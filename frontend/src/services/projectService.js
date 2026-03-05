import { axiosInstance } from "../lib/axios";

export const projectService = {
    getAllIdeas: async () => {
        const response = await axiosInstance.get("/ideas");
        return response.data;
    },

    getMyIdeas: async () => {
        const response = await axiosInstance.get("/ideas/my-ideas");
        return response.data;
    },

    createIdea: async (ideaData) => {
        const response = await axiosInstance.post("/ideas", ideaData);
        return response.data;
    },

    deleteIdea: async (id) => {
        const response = await axiosInstance.delete(`/ideas/${id}`);
        return response.data;
    },

    toggleInterest: async (id) => {
        const response = await axiosInstance.put(`/ideas/${id}/interest`);
        return response.data;
    },

    convertToWorkspace: async (id) => {
        const response = await axiosInstance.post(`/ideas/${id}/convert`);
        return response.data;
    },

    updateApplicantStatus: async (ideaId, userId, status) => {
        const response = await axiosInstance.put(`/ideas/${ideaId}/applicants/${userId}`, { status });
        return response.data;
    },
};
