import { axiosInstance } from "../lib/axios";

export const taskService = {
    getWorkspaceTasks: async (workspaceId) => {
        const response = await axiosInstance.get(`/tasks/workspace/${workspaceId}`);
        return response.data;
    },

    createTask: async (taskData) => {
        const response = await axiosInstance.post("/tasks", taskData);
        return response.data;
    },

    updateTask: async (id, taskData) => {
        const response = await axiosInstance.put(`/tasks/${id}`, taskData);
        return response.data;
    },

    deleteTask: async (id) => {
        const response = await axiosInstance.delete(`/tasks/${id}`);
        return response.data;
    }
};
