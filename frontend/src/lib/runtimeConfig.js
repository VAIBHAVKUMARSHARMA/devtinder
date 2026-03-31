const trimTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

const getCurrentOrigin = () => {
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }

    return "http://localhost:3000";
};

export const API_BASE_URL =
    trimTrailingSlash(import.meta.env.VITE_API_URL || "") || "/api";

export const SOCKET_BASE_URL =
    trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || "") || getCurrentOrigin();
