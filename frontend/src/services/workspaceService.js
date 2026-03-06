import { axiosInstance } from "../lib/axios";

export const workspaceService = {
    getWorkspaces: async () => {
        const response = await axiosInstance.get("/workspaces");
        return response.data;
    },

    getWorkspaceDetails: async (id) => {
        const response = await axiosInstance.get(`/workspaces/${id}`);
        return response.data;
    },

    createWorkspace: async (workspaceData) => {
        const response = await axiosInstance.post("/workspaces", workspaceData);
        return response.data;
    },

    addMember: async (workspaceId, userId) => {
        const response = await axiosInstance.post(`/workspaces/${workspaceId}/members`, { userId });
        return response.data;
    },

    getPendingInvitations: async () => {
        const response = await axiosInstance.get("/workspaces/invitations");
        return response.data;
    },

    acceptInvitation: async (workspaceId) => {
        const response = await axiosInstance.post(`/workspaces/${workspaceId}/accept`);
        return response.data;
    },

    rejectInvitation: async (workspaceId) => {
        const response = await axiosInstance.post(`/workspaces/${workspaceId}/reject`);
        return response.data;
    },

    deleteWorkspace: async (id) => {
        const response = await axiosInstance.delete(`/workspaces/${id}`);
        return response.data;
    },

    saveWorkspaceCode: async (id, payload) => {
        const response = await axiosInstance.put(`/workspaces/${id}/code`, payload);
        return response.data;
    },

    saveWorkspaceWhiteboard: async (id, payload) => {
        const response = await axiosInstance.put(`/workspaces/${id}/whiteboard`, payload);
        return response.data;
    }
};
