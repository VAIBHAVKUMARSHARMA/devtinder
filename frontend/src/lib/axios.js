import axios from "axios";
import { API_BASE_URL } from "@/lib/runtimeConfig";
import { getStoredAuthToken } from "@/lib/authStorage";

export const createApiClient = (baseURL = API_BASE_URL) => {
    const client = axios.create({
        baseURL,
        withCredentials: true,
        headers: {
            "Content-Type": "application/json",
        },
    });

    client.interceptors.request.use((config) => {
        const token = getStoredAuthToken();

        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    });

    return client;
};

export const axiosInstance = createApiClient();
