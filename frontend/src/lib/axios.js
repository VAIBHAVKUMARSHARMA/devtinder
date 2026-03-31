import axios from "axios";
import { API_BASE_URL } from "@/lib/runtimeConfig";

export const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});
